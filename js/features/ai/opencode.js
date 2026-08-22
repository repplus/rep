const DEFAULT_BASE_URL = 'http://127.0.0.1:4096';
const DEFAULT_USERNAME = 'opencode';
const REQUEST_TIMEOUT_MS = 15000;
const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

let sharedPort = null;
const requestListeners = new Map();
const conversationSessions = new Map();

export function normalizeOpenCodeBaseUrl(value = DEFAULT_BASE_URL) {
    let url;
    try {
        url = new URL(value || DEFAULT_BASE_URL);
    } catch (error) {
        throw new Error('Enter a valid OpenCode server URL.');
    }

    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname)) {
        throw new Error('OpenCode URL must use localhost or 127.0.0.1.');
    }
    if (url.username || url.password) {
        throw new Error('Put credentials in the OpenCode username and password fields, not the URL.');
    }
    if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error('OpenCode URL must contain only the server origin, without a path, query, or hash.');
    }

    return url.origin;
}

export function getOpenCodePermissionPattern(baseUrl) {
    const url = new URL(normalizeOpenCodeBaseUrl(baseUrl));
    return `${url.protocol}//${url.hostname}/*`;
}

export function parseOpenCodeModel(value) {
    const separator = value.indexOf('/');
    if (separator <= 0 || separator === value.length - 1) {
        throw new Error('Select a valid OpenCode provider and model.');
    }
    return {
        providerID: value.slice(0, separator),
        modelID: value.slice(separator + 1)
    };
}

export function flattenOpenCodeModels(data) {
    const hasConnectedList = Array.isArray(data?.connected);
    const connected = new Set(Array.isArray(data?.connected) ? data.connected : []);
    const providers = Array.isArray(data?.all)
        ? data.all
        : (Array.isArray(data?.providers) ? data.providers : []);

    return providers
        .filter(provider => !hasConnectedList || connected.has(provider.id))
        .flatMap(provider => Object.values(provider.models || {}).map(model => ({
            id: `${provider.id}/${model.id}`,
            label: `${provider.name || provider.id} - ${model.name || model.id}`
        })))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export function createSSEParser(onEvent) {
    let buffer = '';

    return {
        feed(chunk) {
            buffer += chunk || '';
            let boundary = buffer.match(/\r?\n\r?\n/);

            while (boundary && boundary.index !== undefined) {
                const block = buffer.slice(0, boundary.index);
                buffer = buffer.slice(boundary.index + boundary[0].length);
                const data = block
                    .split(/\r?\n/)
                    .filter(line => line.startsWith('data:'))
                    .map(line => line.slice(5).trimStart())
                    .join('\n');

                if (data && data !== '[DONE]') {
                    try {
                        onEvent(JSON.parse(data));
                    } catch (error) {
                        throw new Error(`OpenCode returned an invalid event: ${error.message}`);
                    }
                }
                boundary = buffer.match(/\r?\n\r?\n/);
            }
        }
    };
}

function getPort() {
    if (sharedPort) return sharedPort;

    sharedPort = chrome.runtime.connect({ name: 'rep-panel' });
    sharedPort.onMessage.addListener(message => {
        if (!message.type?.startsWith('opencode-') || !message.requestId) return;
        requestListeners.get(message.requestId)?.(message);
    });
    sharedPort.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError?.message || 'Connection to the background worker was lost.';
        sharedPort = null;
        requestListeners.forEach(listener => listener({ type: 'opencode-error', error }));
        requestListeners.clear();
        conversationSessions.forEach(entry => {
            entry.activeCancel = null;
            entry.needsValidation = true;
        });
    });
    return sharedPort;
}

function getConnection(settings) {
    return {
        baseUrl: normalizeOpenCodeBaseUrl(settings.baseUrl || settings.apiKey),
        username: settings.username || DEFAULT_USERNAME,
        password: settings.password || ''
    };
}

function connectionFingerprint(connection) {
    return `${connection.baseUrl}\n${connection.username}\n${connection.password}`;
}

function nextRequestId() {
    return `opencode-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cancelRequest(requestId) {
    try {
        getPort().postMessage({ type: 'opencode-cancel', requestId });
    } catch (error) {
        // The port may already be disconnected.
    }
}

function requestOpenCode(settings, path, options = {}) {
    const requestId = nextRequestId();
    const connection = getConnection(settings);
    const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            requestListeners.delete(requestId);
            cancelRequest(requestId);
            reject(new Error('OpenCode request timed out.'));
        }, timeoutMs);

        requestListeners.set(requestId, message => {
            if (message.requestId && message.requestId !== requestId) return;
            if (message.type === 'opencode-response') {
                clearTimeout(timer);
                requestListeners.delete(requestId);
                if (!message.body) {
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(message.body));
                } catch (error) {
                    reject(new Error(`OpenCode returned invalid JSON: ${error.message}`));
                }
            } else if (message.type === 'opencode-error') {
                clearTimeout(timer);
                requestListeners.delete(requestId);
                reject(new Error(message.error || 'OpenCode request failed.'));
            }
        });

        getPort().postMessage({
            type: 'opencode-request',
            requestId,
            ...connection,
            path,
            method: options.method || 'GET',
            body: options.body
        });
    });
}

function openOpenCodeEventStream(settings, onChunk) {
    const requestId = nextRequestId();
    const connection = getConnection(settings);
    let readySettled = false;
    let resolveDone;
    let rejectDone;
    const done = new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
    });
    done.catch(() => {});

    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            requestListeners.delete(requestId);
            cancelRequest(requestId);
            reject(new Error('Timed out while connecting to the OpenCode event stream.'));
            rejectDone(new Error('Timed out while connecting to the OpenCode event stream.'));
        }, REQUEST_TIMEOUT_MS);

        requestListeners.set(requestId, message => {
            if (message.requestId && message.requestId !== requestId) return;
            if (message.type === 'opencode-stream-start') {
                clearTimeout(timer);
                readySettled = true;
                resolve({
                    done,
                    cancel() {
                        requestListeners.delete(requestId);
                        cancelRequest(requestId);
                        resolveDone();
                    }
                });
            } else if (message.type === 'opencode-stream-chunk') {
                try {
                    onChunk(message.chunk || '');
                } catch (error) {
                    requestListeners.delete(requestId);
                    cancelRequest(requestId);
                    rejectDone(error);
                }
            } else if (message.type === 'opencode-stream-done') {
                requestListeners.delete(requestId);
                resolveDone();
            } else if (message.type === 'opencode-error') {
                clearTimeout(timer);
                requestListeners.delete(requestId);
                const error = new Error(message.error || 'OpenCode event stream failed.');
                if (!readySettled) reject(error);
                rejectDone(error);
            }
        });

        getPort().postMessage({
            type: 'opencode-request',
            requestId,
            ...connection,
            path: '/event',
            method: 'GET',
            stream: true
        });
    });

    return ready;
}

function trackSession(settings, sessionId) {
    getPort().postMessage({
        type: 'opencode-track-session',
        requestId: nextRequestId(),
        sessionId,
        ...getConnection(settings)
    });
}

function untrackSession(sessionId) {
    try {
        getPort().postMessage({ type: 'opencode-untrack-session', sessionId });
    } catch (error) {
        // Disconnect cleanup will retry tracked sessions.
    }
}

async function createSession(settings, title) {
    const session = await requestOpenCode(settings, '/session', {
        method: 'POST',
        body: {
            title: title || 'rep+ investigation',
            permission: [{ permission: '*', pattern: '*', action: 'deny' }]
        }
    });
    if (!session?.id) throw new Error('OpenCode did not return a session ID.');
    trackSession(settings, session.id);
    return session.id;
}

async function deleteSession(settings, sessionId) {
    await abortSession(settings, sessionId);

    await requestOpenCode(settings, `/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE'
    });
    untrackSession(sessionId);
}

async function abortSession(settings, sessionId) {
    try {
        await requestOpenCode(settings, `/session/${encodeURIComponent(sessionId)}/abort`, {
            method: 'POST'
        });
    } catch (error) {
        // The session may already be idle or the connection may have closed.
    }
}

async function denyPermission(settings, permissionId) {
    try {
        await requestOpenCode(settings, `/permission/${encodeURIComponent(permissionId)}/reply`, {
            method: 'POST',
            body: { reply: 'reject' }
        });
    } catch (error) {
        // The prompt is rejected regardless; this is best-effort cleanup.
    }
}

async function runPrompt(settings, sessionId, model, systemPrompt, userPrompt, onUpdate, entry) {
    const textParts = new Map();
    const assistantMessageIds = new Set();
    const pendingParts = new Map();
    let promptSent = false;
    let settled = false;
    let resolveResult;
    let rejectResult;

    const result = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    result.catch(() => {});
    let promptRunning = false;

    const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) {
            rejectResult(error);
            return;
        }
        const text = Array.from(textParts.values()).join('');
        if (!text) {
            rejectResult(new Error('OpenCode completed without returning text.'));
            return;
        }
        resolveResult(text);
    };

    const acceptPart = part => {
        if (part.type !== 'text' || !assistantMessageIds.has(part.messageID)) return;
        textParts.set(part.id, part.text || '');
        onUpdate(Array.from(textParts.values()).join(''));
    };

    const parser = createSSEParser(event => {
        if (event.type === 'message.updated') {
            const info = event.properties?.info;
            if (info?.sessionID !== sessionId || info.role !== 'assistant' || info.summary === true) return;
            if (info.error) {
                finish(new Error(info.error.data?.message || 'OpenCode model request failed.'));
                return;
            }
            assistantMessageIds.add(info.id);
            pendingParts.forEach((part, partId) => {
                if (part.messageID === info.id) {
                    acceptPart(part);
                    pendingParts.delete(partId);
                }
            });
        } else if (event.type === 'message.part.updated') {
            const part = event.properties?.part;
            if (part?.sessionID !== sessionId || part.type !== 'text') return;
            if (assistantMessageIds.has(part.messageID)) acceptPart(part);
            else pendingParts.set(part.id, part);
        } else if (event.type === 'message.part.delta') {
            const delta = event.properties;
            if (delta?.sessionID === sessionId && delta.field === 'text' && textParts.has(delta.partID)) {
                textParts.set(delta.partID, `${textParts.get(delta.partID)}${delta.delta || ''}`);
                onUpdate(Array.from(textParts.values()).join(''));
            }
        } else if (event.type === 'permission.asked') {
            const permission = event.properties;
            if (permission?.sessionID !== sessionId) return;
            denyPermission(settings, permission.id);
            finish(new Error(`OpenCode unexpectedly requested the "${permission.permission}" permission. The request was blocked.`));
        } else if (event.type === 'session.error' && event.properties?.sessionID === sessionId) {
            finish(new Error(event.properties.error?.data?.message || 'OpenCode session failed.'));
        } else if (event.type === 'session.idle' && event.properties?.sessionID === sessionId && promptRunning) {
            finish();
        } else if (
            event.type === 'session.status' &&
            event.properties?.sessionID === sessionId &&
            event.properties.status?.type === 'busy' &&
            promptSent
        ) {
            promptRunning = true;
        } else if (
            event.type === 'session.status' &&
            event.properties?.sessionID === sessionId &&
            event.properties.status?.type === 'idle' &&
            promptRunning
        ) {
            finish();
        }
    });

    const stream = await openOpenCodeEventStream(settings, chunk => parser.feed(chunk));
    entry.activeCancel = () => {
        finish(new Error('OpenCode request was cancelled.'));
        stream.cancel();
    };
    stream.done.then(
        () => finish(new Error('OpenCode closed the event stream before the prompt completed.')),
        error => finish(error)
    );
    try {
        const selectedModel = parseOpenCodeModel(model);
        promptSent = true;
        await requestOpenCode(settings, `/session/${encodeURIComponent(sessionId)}/prompt_async`, {
            method: 'POST',
            timeoutMs: REQUEST_TIMEOUT_MS,
            body: {
                model: selectedModel,
                system: systemPrompt,
                tools: { '*': false },
                parts: [{ type: 'text', text: userPrompt }]
            }
        });

        const timeout = setTimeout(() => finish(new Error('OpenCode prompt timed out.')), PROMPT_TIMEOUT_MS);
        try {
            return await result;
        } finally {
            clearTimeout(timeout);
        }
    } catch (error) {
        await abortSession(settings, sessionId);
        throw error;
    } finally {
        stream.cancel();
        entry.activeCancel = null;
    }
}

function throwIfCancelled(signal) {
    if (signal?.aborted) throw new Error('OpenCode request was cancelled.');
}

async function getConversationSession(settings, conversationKey, title, signal) {
    throwIfCancelled(signal);
    const connection = getConnection(settings);
    const fingerprint = connectionFingerprint(connection);
    let existing = conversationSessions.get(conversationKey);

    if (existing && existing.fingerprint === fingerprint && existing.sessionId) {
        if (existing.needsValidation) {
            try {
                await deleteSession(existing.settings, existing.sessionId);
            } catch (error) {
                // Disconnect cleanup may already have deleted the session.
            }
            throwIfCancelled(signal);
            if (existing.cancelled || conversationSessions.get(conversationKey) !== existing) {
                throw new Error('OpenCode session validation was cancelled.');
            }
            conversationSessions.delete(conversationKey);
            existing = null;
        }
        if (existing) {
            trackSession(existing.settings, existing.sessionId);
            return { entry: existing, isNew: false };
        }
    }
    if (existing) {
        await resetOpenCodeConversation(conversationKey);
        throwIfCancelled(signal);
    }

    const entry = {
        settings: { ...settings, ...connection },
        fingerprint,
        sessionId: null,
        activeCancel: null,
        needsValidation: false,
        cancelled: false
    };
    conversationSessions.set(conversationKey, entry);
    try {
        entry.sessionId = await createSession(settings, title);
        if (signal?.aborted || entry.cancelled || conversationSessions.get(conversationKey) !== entry) {
            await deleteSession(entry.settings, entry.sessionId);
            throw new Error('OpenCode session creation was cancelled.');
        }
        return { entry, isNew: true };
    } catch (error) {
        if (conversationSessions.get(conversationKey) === entry) {
            conversationSessions.delete(conversationKey);
        }
        throw error;
    }
}

export async function testOpenCodeConnection(settings) {
    const health = await requestOpenCode(settings, '/global/health');
    if (!health?.healthy) throw new Error('OpenCode server reported that it is unhealthy.');
    return health;
}

export async function fetchOpenCodeModels(settings) {
    const data = await requestOpenCode(settings, '/config/providers');
    return flattenOpenCodeModels(data);
}

export async function streamFromOpenCode(settings, model, systemPrompt, userPrompt, onUpdate, options = {}) {
    const persistent = options.conversationKey !== undefined && options.conversationKey !== null;
    let session;
    if (persistent) {
        session = await getConversationSession(settings, options.conversationKey, options.sessionTitle, options.signal);
        if (!session.isNew && Array.isArray(options.messages) && session.entry.lastResponse !== undefined) {
            const previousMessage = options.messages.at(-2);
            if (previousMessage?.role !== 'assistant' || previousMessage.content !== session.entry.lastResponse) {
                await resetOpenCodeConversation(options.conversationKey);
                throwIfCancelled(options.signal);
                session = await getConversationSession(settings, options.conversationKey, options.sessionTitle, options.signal);
            }
        }
    } else {
        session = {
            entry: {
                settings,
                sessionId: await createSession(settings, options.sessionTitle),
                activeCancel: null,
                needsValidation: false
            },
            isNew: true
        };
    }
    const entry = session.entry;
    let prompt = userPrompt;

    if (persistent && session.isNew && Array.isArray(options.messages)) {
        const transcript = options.messages
            .filter(message => message.role !== 'system')
            .map(message => `${message.role === 'assistant' ? 'Assistant' : 'User'}:\n${message.content}`)
            .join('\n\n');
        if (transcript) prompt = `Continue this rep+ investigation:\n\n${transcript}`;
    }

    try {
        const response = await runPrompt(settings, entry.sessionId, model, systemPrompt, prompt, onUpdate, entry);
        if (persistent) entry.lastResponse = response;
        return response;
    } catch (error) {
        if (persistent) entry.needsValidation = true;
        throw error;
    } finally {
        if (!persistent) {
            try {
                await deleteSession(settings, entry.sessionId);
            } catch (error) {
                console.warn('Failed to delete temporary OpenCode session:', error);
            }
        }
    }
}

export async function resetOpenCodeConversation(conversationKey) {
    const entry = conversationSessions.get(conversationKey);
    if (!entry) return;

    conversationSessions.delete(conversationKey);
    entry.cancelled = true;
    entry.activeCancel?.();
    if (!entry.sessionId) return;
    await deleteSession(entry.settings, entry.sessionId);
}

export async function resetAllOpenCodeConversations() {
    const keys = Array.from(conversationSessions.keys());
    await Promise.allSettled(keys.map(key => resetOpenCodeConversation(key)));
}
