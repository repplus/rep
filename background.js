// Background service worker
const ports = new Set();
const requestMap = new Map();
const opencodeRequestsByPort = new WeakMap();
const opencodeSessionsByPort = new WeakMap();
const OPENCODE_SESSIONS_STORAGE_KEY = 'opencodeTrackedSessions';
const OPENCODE_CLEANUP_TIMEOUT_MS = 10000;
let storedSessionUpdate;

function getOpenCodeTarget(baseUrl, path = '/') {
    const base = new URL(baseUrl);
    const allowedHosts = new Set(['localhost', '127.0.0.1']);

    if (!['http:', 'https:'].includes(base.protocol) || !allowedHosts.has(base.hostname)) {
        throw new Error('OpenCode URL must use localhost or 127.0.0.1.');
    }
    if (base.username || base.password) {
        throw new Error('Put OpenCode credentials in the username and password fields, not the URL.');
    }

    const target = new URL(path, `${base.origin}/`);
    if (target.origin !== base.origin) {
        throw new Error('OpenCode request must stay on the configured server origin.');
    }
    return target;
}

function encodeBasicAuth(username, password) {
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
}

function getOpenCodeHeaders(msg, stream = false) {
    const headers = {
        'Accept': stream ? 'text/event-stream' : 'application/json'
    };
    if (msg.body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    if (msg.password) {
        headers.Authorization = `Basic ${encodeBasicAuth(msg.username || 'opencode', msg.password)}`;
    }
    return headers;
}

async function deleteOpenCodeSessionDirect(settings, sessionId) {
    const msg = { ...settings };
    const abortTarget = getOpenCodeTarget(settings.baseUrl, `/session/${encodeURIComponent(sessionId)}/abort`);
    const deleteTarget = getOpenCodeTarget(settings.baseUrl, `/session/${encodeURIComponent(sessionId)}`);

    try {
        await fetch(abortTarget.href, {
            method: 'POST',
            headers: getOpenCodeHeaders(msg),
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(OPENCODE_CLEANUP_TIMEOUT_MS)
        });
    } catch (error) {
        // Deletion below is still attempted if abort fails.
    }

    const response = await fetch(deleteTarget.href, {
        method: 'DELETE',
        headers: getOpenCodeHeaders(msg),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(OPENCODE_CLEANUP_TIMEOUT_MS)
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete OpenCode session ${sessionId}`);
    }
}

function isOpenCodeSessionActive(sessionId) {
    for (const port of ports) {
        if (opencodeSessionsByPort.get(port)?.has(sessionId)) return true;
    }
    return false;
}

async function cleanupStoredOpenCodeSessions() {
    const data = await chrome.storage.local.get(OPENCODE_SESSIONS_STORAGE_KEY);
    const sessions = data[OPENCODE_SESSIONS_STORAGE_KEY] || {};
    const remaining = {};

    await Promise.all(Object.entries(sessions).map(async ([sessionId, settings]) => {
        if (isOpenCodeSessionActive(sessionId)) {
            remaining[sessionId] = settings;
            return;
        }
        try {
            await deleteOpenCodeSessionDirect(settings, sessionId);
        } catch (error) {
            console.warn(`Could not clean up OpenCode session ${sessionId}; it will be retried.`, error);
            remaining[sessionId] = settings;
        }
    }));

    if (Object.keys(remaining).length > 0) {
        await chrome.storage.local.set({ [OPENCODE_SESSIONS_STORAGE_KEY]: remaining });
    } else {
        await chrome.storage.local.remove(OPENCODE_SESSIONS_STORAGE_KEY);
    }
}

function updateStoredOpenCodeSessions(update) {
    storedSessionUpdate = storedSessionUpdate.catch(() => {}).then(async () => {
        const data = await chrome.storage.local.get(OPENCODE_SESSIONS_STORAGE_KEY);
        const sessions = data[OPENCODE_SESSIONS_STORAGE_KEY] || {};
        update(sessions);
        if (Object.keys(sessions).length > 0) {
            await chrome.storage.local.set({ [OPENCODE_SESSIONS_STORAGE_KEY]: sessions });
        } else {
            await chrome.storage.local.remove(OPENCODE_SESSIONS_STORAGE_KEY);
        }
    });
    return storedSessionUpdate;
}

function persistOpenCodeSession(sessionId, settings) {
    updateStoredOpenCodeSessions(sessions => {
        sessions[sessionId] = settings;
    }).catch(() => {});
}

function removeStoredOpenCodeSession(sessionId) {
    return updateStoredOpenCodeSessions(sessions => {
        delete sessions[sessionId];
    });
}

async function getOpenCodeError(response) {
    const text = await response.text();
    if (!text.trim()) return `OpenCode request failed with status ${response.status}`;

    try {
        const data = JSON.parse(text);
        return data.error?.data?.message || data.error?.message || data.message || text;
    } catch (error) {
        return text.length > 300 ? `${text.slice(0, 300)}...` : text;
    }
}

async function handleOpenCodeRequest(port, msg) {
    const requestId = msg.requestId || `opencode-${Date.now()}-${Math.random()}`;
    const method = (msg.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
        port.postMessage({ type: 'opencode-error', requestId, error: `Unsupported OpenCode method: ${method}` });
        return;
    }

    let requests = opencodeRequestsByPort.get(port);
    if (!requests) {
        requests = new Map();
        opencodeRequestsByPort.set(port, requests);
    }

    const controller = new AbortController();
    requests.set(requestId, controller);

    try {
        const target = getOpenCodeTarget(msg.baseUrl, msg.path);
        const response = await fetch(target.href, {
            method,
            headers: getOpenCodeHeaders(msg, Boolean(msg.stream)),
            body: msg.body === undefined ? undefined : JSON.stringify(msg.body),
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(await getOpenCodeError(response));
        }

        if (!msg.stream) {
            const body = await response.text();
            port.postMessage({ type: 'opencode-response', requestId, status: response.status, body });
            return;
        }

        if (!response.body) {
            throw new Error('OpenCode returned an empty event stream.');
        }

        port.postMessage({ type: 'opencode-stream-start', requestId, status: response.status });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            port.postMessage({
                type: 'opencode-stream-chunk',
                requestId,
                chunk: decoder.decode(value, { stream: true })
            });
        }

        const finalChunk = decoder.decode();
        if (finalChunk) {
            port.postMessage({ type: 'opencode-stream-chunk', requestId, chunk: finalChunk });
        }
        port.postMessage({ type: 'opencode-stream-done', requestId });
    } catch (error) {
        const message = error.name === 'AbortError' ? 'OpenCode request was cancelled.' : error.message;
        try {
            port.postMessage({ type: 'opencode-error', requestId, error: message });
        } catch (postError) {
            // The panel disconnected while the request was active.
        }
    } finally {
        requests.delete(requestId);
    }
}

function trackOpenCodeSession(port, msg) {
    // Validate before retaining connection details for disconnect cleanup.
    getOpenCodeTarget(msg.baseUrl, `/session/${encodeURIComponent(msg.sessionId)}`);
    let sessions = opencodeSessionsByPort.get(port);
    if (!sessions) {
        sessions = new Map();
        opencodeSessionsByPort.set(port, sessions);
    }
    const settings = {
        baseUrl: msg.baseUrl,
        username: msg.username || 'opencode',
        password: msg.password || ''
    };
    sessions.set(msg.sessionId, settings);
    persistOpenCodeSession(msg.sessionId, settings);
}

function untrackOpenCodeSession(port, sessionId) {
    opencodeSessionsByPort.get(port)?.delete(sessionId);
    removeStoredOpenCodeSession(sessionId).catch(() => {});
}

function cleanupOpenCodePort(port) {
    const requests = opencodeRequestsByPort.get(port);
    requests?.forEach(controller => controller.abort());
    requests?.clear();

    const sessions = opencodeSessionsByPort.get(port);
    sessions?.forEach((settings, sessionId) => {
        deleteOpenCodeSessionDirect(settings, sessionId)
            .then(() => removeStoredOpenCodeSession(sessionId))
            .catch(() => {});
    });
    sessions?.clear();
}

const staleSessionCleanup = cleanupStoredOpenCodeSessions();
storedSessionUpdate = staleSessionCleanup;

// Handle connections from DevTools panels
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "rep-panel") return;
    storedSessionUpdate = storedSessionUpdate.catch(() => {}).then(cleanupStoredOpenCodeSessions);
    console.log("DevTools panel connected");
    ports.add(port);

    port.onDisconnect.addListener(() => {
        console.log("DevTools panel disconnected");
        cleanupOpenCodePort(port);
        ports.delete(port);
    });

    // Listen for messages from panel (e.g. to toggle capture, local model requests)
    port.onMessage.addListener((msg) => {
        console.log('Background: Received port message:', msg.type);
        if (msg.type === 'ping') {
            console.log('Background: Responding to ping');
            port.postMessage({ type: 'pong' });
        } else if (msg.type === 'opencode-request') {
            handleOpenCodeRequest(port, msg);
        } else if (msg.type === 'opencode-cancel') {
            opencodeRequestsByPort.get(port)?.get(msg.requestId)?.abort();
        } else if (msg.type === 'opencode-track-session') {
            try {
                trackOpenCodeSession(port, msg);
            } catch (error) {
                port.postMessage({ type: 'opencode-error', requestId: msg.requestId, error: error.message });
            }
        } else if (msg.type === 'opencode-untrack-session') {
            untrackOpenCodeSession(port, msg.sessionId);
        } else if (msg.type === 'local-model-request' || msg.type === 'local-model-chat') {
            // Handle local model request via port
            const requestId = msg.requestId || `local-${Date.now()}-${Math.random()}`;
            console.log('Background: Received local model request', requestId, 'URL:', msg.url, 'Body:', JSON.stringify(msg.body).substring(0, 100));
            
            // Check if port is still connected before making request
            if (!port || !port.onDisconnect) {
                console.error('Background: Port already disconnected');
                return;
            }
            
            // Keep service worker alive during request
            const keepAlive = setInterval(() => {
                // Service worker will stay alive as long as we have active work
            }, 1000);
            
            // Proxy the request to localhost
            // Note: Service workers need host_permissions for localhost in MV3
            // Support both old format (prompt) and new format (messages array)
            const requestBody = msg.body.messages 
                ? {
                    model: msg.body.model,
                    messages: msg.body.messages,
                    stream: msg.body.stream !== undefined ? msg.body.stream : true
                }
                : {
                    model: msg.body.model,
                    prompt: msg.body.prompt,
                    stream: msg.body.stream !== undefined ? msg.body.stream : true
                };
            
            console.log('Background: Sending fetch request to', msg.url, 'with body:', JSON.stringify(requestBody).substring(0, 200));
            
            // Try to match curl's request format exactly
            fetch(msg.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody),
                // Don't send credentials or referrer that might trigger security
                credentials: 'omit',
                referrerPolicy: 'no-referrer'
            })
            .then(response => {
                console.log('Background: Fetch response status', response.status);
                // Log response headers for debugging
                const responseHeaders = {};
                response.headers.forEach((value, key) => {
                    responseHeaders[key] = value;
                });
                console.log('Background: Response headers:', responseHeaders);
                
                if (!response.ok) {
                    return response.text().then(text => {
                        console.error('Background: Fetch failed with status', response.status, 'Response body length:', text?.length || 0, 'Response body:', text || '(empty)');
                        // Provide more helpful error message
                        let errorMsg = `Request failed with status ${response.status}`;
                        if (text && text.trim()) {
                            try {
                                const errorData = JSON.parse(text);
                                errorMsg = errorData.error || errorData.message || errorMsg;
                            } catch (e) {
                                errorMsg = text.length > 200 ? text.substring(0, 200) + '...' : text;
                            }
                        } else if (response.status === 403) {
                            errorMsg = '403 Forbidden: Ollama is blocking the request. ' +
                                'This might be due to CORS or security settings. ' +
                                'Try restarting Ollama with: OLLAMA_ORIGINS="*" ollama serve ' +
                                'Or check Ollama configuration for access restrictions.';
                        }
                        throw new Error(errorMsg);
                    });
                }
                return response.body;
            })
            .then(body => {
                if (!body) {
                    throw new Error('No response body received');
                }
                
                // Stream the response back via this specific port
                const reader = body.getReader();
                const decoder = new TextDecoder();
                let hasError = false;
                
                function readChunk() {
                    if (hasError) return;
                    
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            // Send final message
                            clearInterval(keepAlive);
                            try {
                                port.postMessage({ 
                                    type: 'local-model-stream-done',
                                    requestId: requestId
                                });
                                console.log('Background: Sent stream-done for', requestId);
                            } catch (e) {
                                console.error('Background: Error sending stream-done', e);
                                hasError = true;
                            }
                            return;
                        }
                        
                        const chunk = decoder.decode(value, { stream: true });
                        // Send chunk message
                        try {
                            port.postMessage({ 
                                type: 'local-model-stream-chunk', 
                                chunk: chunk,
                                requestId: requestId
                            });
                        } catch (e) {
                            console.error('Background: Port disconnected during streaming', e);
                            hasError = true;
                            reader.cancel().catch(() => {});
                            return;
                        }
                        
                        // Continue reading
                        readChunk();
                    }).catch(error => {
                        clearInterval(keepAlive);
                        console.error('Background: Error reading chunk', error);
                        hasError = true;
                        try {
                            port.postMessage({ 
                                type: 'local-model-stream-error', 
                                error: error.message,
                                requestId: requestId
                            });
                        } catch (e) {
                            console.error('Background: Error sending error message', e);
                        }
                    });
                }
                
                readChunk();
            })
            .catch(error => {
                clearInterval(keepAlive);
                console.error('Background: Fetch error', error, error.stack);
                let errorMessage = error.message || 'Failed to fetch from local model API';
                
                // Provide helpful error message for CORS issues
                if (errorMessage.includes('CORS') || errorMessage.includes('Failed to fetch')) {
                    errorMessage = 'CORS error: Ollama needs to allow CORS. ' +
                        'Start Ollama with: OLLAMA_ORIGINS="chrome-extension://*" ollama serve ' +
                        'Or configure your Ollama server to send CORS headers. ' +
                        'Original error: ' + errorMessage;
                }
                
                try {
                    port.postMessage({ 
                        type: 'local-model-error', 
                        error: errorMessage,
                        requestId: requestId
                    });
                } catch (e) {
                    console.error('Background: Port disconnected, cannot send error', e);
                }
            });
        }
    });
});

// Handle local model API requests (bypass CORS)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'local-model-request') {
        const requestId = request.requestId || `local-${Date.now()}-${Math.random()}`;
        
        // Proxy the request to localhost (service workers can bypass CORS)
        fetch(request.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request.body)
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text || 'Request failed');
                });
            }
            return response.body;
        })
        .then(body => {
            // Stream the response back via port connections (for DevTools panels)
            const reader = body.getReader();
            const decoder = new TextDecoder();
            
            function readChunk() {
                reader.read().then(({ done, value }) => {
                    if (done) {
                        // Send final message to all connected ports
                        ports.forEach(port => {
                            try {
                                port.postMessage({ 
                                    type: 'local-model-stream-done',
                                    requestId: requestId
                                });
                            } catch (e) {
                                // Port might be disconnected, remove it
                                ports.delete(port);
                            }
                        });
                        return;
                    }
                    
                    const chunk = decoder.decode(value, { stream: true });
                    // Send chunk message to all connected ports
                    ports.forEach(port => {
                        try {
                            port.postMessage({ 
                                type: 'local-model-stream-chunk', 
                                chunk: chunk,
                                requestId: requestId
                            });
                        } catch (e) {
                            // Port might be disconnected, remove it
                            ports.delete(port);
                        }
                    });
                    
                    // Continue reading
                    readChunk();
                }).catch(error => {
                    ports.forEach(port => {
                        try {
                            port.postMessage({ 
                                type: 'local-model-stream-error', 
                                error: error.message,
                                requestId: requestId
                            });
                        } catch (e) {
                            ports.delete(port);
                        }
                    });
                });
            }
            
            readChunk();
        })
        .catch(error => {
            ports.forEach(port => {
                try {
                    port.postMessage({ 
                        type: 'local-model-error', 
                        error: error.message,
                        requestId: requestId
                    });
                } catch (e) {
                    ports.delete(port);
                }
            });
        });
        
        // Return true to indicate we'll send responses asynchronously
        return true;
    }
});

// Helper to process request body
function parseRequestBody(requestBody) {
    if (!requestBody) return null;

    if (requestBody.raw && requestBody.raw.length > 0) {
        try {
            const decoder = new TextDecoder('utf-8');
            return requestBody.raw.map(bytes => {
                if (bytes.bytes) {
                    return decoder.decode(bytes.bytes);
                }
                return '';
            }).join('');
        } catch (e) {
            console.error('Error decoding request body:', e);
            return null;
        }
    }

    if (requestBody.formData) {
        // Convert formData object to URL encoded string
        const params = new URLSearchParams();
        for (const [key, values] of Object.entries(requestBody.formData)) {
            values.forEach(value => params.append(key, value));
        }
        return params.toString();
    }

    return null;
}

// Listener functions
function handleBeforeRequest(details) {
    if (ports.size === 0) return;
    if (details.url.startsWith('chrome-extension://')) return;

    requestMap.set(details.requestId, {
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        type: details.type,
        timeStamp: Date.now(),
        requestBody: parseRequestBody(details.requestBody),
        tabId: details.tabId,
        initiator: details.initiator
    });
}

function handleBeforeSendHeaders(details) {
    if (ports.size === 0) return;
    const req = requestMap.get(details.requestId);
    if (req) {
        req.requestHeaders = details.requestHeaders;
    }
}

function handleCompleted(details) {
    if (ports.size === 0) return;
    const req = requestMap.get(details.requestId);
    if (req) {
        req.statusCode = details.statusCode;
        req.statusLine = details.statusLine;
        req.responseHeaders = details.responseHeaders;

        const message = {
            type: 'captured_request',
            data: req
        };

        ports.forEach(p => {
            try {
                p.postMessage(message);
            } catch (e) {
                console.error('Error sending to port:', e);
                ports.delete(p);
            }
        });

        requestMap.delete(details.requestId);
    }
}

function handleErrorOccurred(details) {
    requestMap.delete(details.requestId);
}

function setupListeners() {
    if (chrome.webRequest) {
        if (!chrome.webRequest.onBeforeRequest.hasListener(handleBeforeRequest)) {
            chrome.webRequest.onBeforeRequest.addListener(
                handleBeforeRequest,
                { urls: ["<all_urls>"] },
                ["requestBody"]
            );
        }
        if (!chrome.webRequest.onBeforeSendHeaders.hasListener(handleBeforeSendHeaders)) {
            chrome.webRequest.onBeforeSendHeaders.addListener(
                handleBeforeSendHeaders,
                { urls: ["<all_urls>"] },
                ["requestHeaders"]
            );
        }
        if (!chrome.webRequest.onCompleted.hasListener(handleCompleted)) {
            chrome.webRequest.onCompleted.addListener(
                handleCompleted,
                { urls: ["<all_urls>"] },
                ["responseHeaders"]
            );
        }
        if (!chrome.webRequest.onErrorOccurred.hasListener(handleErrorOccurred)) {
            chrome.webRequest.onErrorOccurred.addListener(
                handleErrorOccurred,
                { urls: ["<all_urls>"] }
            );
        }
        console.log("WebRequest listeners registered");
    } else {
        console.log("WebRequest permission not granted");
    }
}

// Initial setup
setupListeners();

// Listen for permission changes
if (chrome.permissions) {
    chrome.permissions.onAdded.addListener((permissions) => {
        if (permissions.permissions && permissions.permissions.includes('webRequest')) {
            setupListeners();
        }
    });
}

// Periodic cleanup of stale requests (older than 1 minute)
setInterval(() => {
    const now = Date.now();
    for (const [id, req] of requestMap.entries()) {
        if (now - req.timeStamp > 60000) {
            requestMap.delete(id);
        }
    }
}, 30000);
