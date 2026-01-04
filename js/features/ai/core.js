// AI Core Module - Generic LLM wrapper and provider abstraction

export function getAISettings() {
    const provider = localStorage.getItem('ai_provider') || 'anthropic';

    if (provider === 'gemini') {
        return {
            provider: 'gemini',
            apiKey: localStorage.getItem('gemini_api_key') || '',
            model: localStorage.getItem('gemini_model') || 'gemini-flash-latest'
        };
    }

    if (provider === 'local') {
        return {
            provider: 'local',
            apiKey: localStorage.getItem('local_api_url') || 'http://localhost:11434/api/generate',
            model: localStorage.getItem('local_model') || ''
        };
    }

    return {
        provider: 'anthropic',
        apiKey: localStorage.getItem('anthropic_api_key') || '',
        model: localStorage.getItem('anthropic_model') || 'claude-sonnet-4-5-20250929'
    };
}

/**
 * Fetch available Anthropic models for a given API key.
 * Returns an array of { id, label } objects.
 */
export async function fetchAnthropicModels(apiKey) {
    if (!apiKey) return [];

    try {
        const response = await fetch('https://api.anthropic.com/v1/models', {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'anthropic-dangerous-direct-browser-access': 'true'
            }
        });

        if (!response.ok) {
            // Silently fail and let caller fall back to defaults
            console.warn('Failed to fetch Anthropic models:', response.status, await response.text());
            return [];
        }

        const data = await response.json();
        const models = Array.isArray(data.data) ? data.data : [];

        return models
            .map(m => m.id)
            .filter(Boolean)
            .map(id => ({ id, label: id }));
    } catch (e) {
        console.warn('Error while fetching Anthropic models:', e);
        return [];
    }
}

/**
 * Fetch available Gemini models for a given API key.
 * Returns an array of { id, label } objects where id is the short model id
 * compatible with the existing URL pattern (models/${id}:streamGenerateContent).
 */
export async function fetchGeminiModels(apiKey) {
    if (!apiKey) return [];

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('Failed to fetch Gemini models:', response.status, await response.text());
            return [];
        }

        const data = await response.json();
        const models = Array.isArray(data.models) ? data.models : [];

        return models
            .map(m => m.name || '')
            .filter(Boolean)
            .map(fullName => {
                // fullName is usually like "models/gemini-1.5-flash"
                const parts = fullName.split('/');
                const shortId = parts[parts.length - 1] || fullName;
                return {
                    id: shortId,
                    label: shortId
                };
            });
    } catch (e) {
        console.warn('Error while fetching Gemini models:', e);
        return [];
    }
}

export function saveAISettings(provider, apiKey, model) {
    localStorage.setItem('ai_provider', provider);

    if (provider === 'gemini') {
        localStorage.setItem('gemini_api_key', apiKey);
        localStorage.setItem('gemini_model', model);
    } else if (provider === 'local') {
        localStorage.setItem('local_api_url', apiKey); // apiKey is actually the URL for local
        localStorage.setItem('local_model', model);
    } else {
        localStorage.setItem('anthropic_api_key', apiKey);
        localStorage.setItem('anthropic_model', model);
    }
}

export async function streamExplanation(apiKey, model, request, onUpdate, provider = 'anthropic') {
    if (provider === 'gemini') {
        return streamExplanationFromGemini(apiKey, model, request, onUpdate);
    }
    if (provider === 'local') {
        return streamExplanationFromLocal(apiKey, model, request, onUpdate);
    }
    return streamExplanationFromClaude(apiKey, model, request, onUpdate);
}

export async function streamExplanationWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate, provider = 'anthropic') {
    if (provider === 'gemini') {
        return streamExplanationFromGeminiWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate);
    }
    if (provider === 'local') {
        return streamExplanationFromLocalWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate);
    }
    return streamExplanationFromClaudeWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate);
}

/**
 * Stream chat with proper message history (rolling context)
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {Array} messages - Array of { role: 'system'|'user'|'assistant', content: string }
 * @param {Function} onUpdate - Callback for streaming updates
 * @param {string} provider - Provider name ('anthropic', 'gemini', 'local')
 */
export async function streamChatWithMessages(apiKey, model, messages, onUpdate, provider = 'anthropic') {
    if (provider === 'gemini') {
        return streamChatFromGeminiWithMessages(apiKey, model, messages, onUpdate);
    }
    if (provider === 'local') {
        return streamChatFromLocalWithMessages(apiKey, model, messages, onUpdate);
    }
    return streamChatFromClaudeWithMessages(apiKey, model, messages, onUpdate);
}

export async function streamExplanationFromClaude(apiKey, model, request, onUpdate) {
    const systemPrompt = "You are an expert security researcher and web developer. Explain the following HTTP request in detail, highlighting interesting parameters, potential security implications, and what this request is likely doing. Be concise but thorough.";

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: model,
            max_tokens: 1024,
            system: systemPrompt,
            stream: true,
            messages: [
                { role: 'user', content: `Explain this HTTP request:\n\n${request}` }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Anthropic API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.type === 'content_block_delta' && data.delta.text) {
                        fullText += data.delta.text;
                        onUpdate(fullText);
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

export async function streamExplanationFromClaudeWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: model,
            max_tokens: 2048,
            system: systemPrompt,
            stream: true,
            messages: [
                { role: 'user', content: userPrompt }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Anthropic API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr || dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                        fullText += data.delta.text;
                        onUpdate(fullText);
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

/**
 * Stream chat from Claude with proper message history
 */
export async function streamChatFromClaudeWithMessages(apiKey, model, messages, onUpdate) {
    // Separate system message from conversation messages
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: model,
            max_tokens: 4096,
            system: systemMessage?.content || '',
            stream: true,
            messages: conversationMessages
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Anthropic API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr || dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                        fullText += data.delta.text;
                        onUpdate(fullText);
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

/**
 * Stream chat from Gemini with proper message history
 * Note: Gemini API has different format, we'll convert messages to their format
 */
export async function streamChatFromGeminiWithMessages(apiKey, model, messages, onUpdate) {
    // Gemini uses a different format - convert messages
    // System message is prepended to first user message
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    // Build contents array for Gemini (alternating user/model)
    const contents = [];
    
    for (const msg of conversationMessages) {
        if (msg.role === 'user') {
            // Add system prompt to first user message if available
            const text = (contents.length === 0 && systemMessage) 
                ? `${systemMessage.content}\n\n${msg.content}`
                : msg.content;
            contents.push({ role: 'user', parts: [{ text }] });
        } else if (msg.role === 'assistant') {
            contents.push({ role: 'model', parts: [{ text: msg.content }] });
        }
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Gemini API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.candidates && data.candidates[0]?.content?.parts) {
                        for (const part of data.candidates[0].content.parts) {
                            if (part.text) {
                                fullText += part.text;
                                onUpdate(fullText);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

export async function streamExplanationFromGemini(apiKey, model, request, onUpdate) {
    const systemPrompt = "You are an expert security researcher and web developer. Explain the following HTTP request in detail, highlighting interesting parameters, potential security implications, and what this request is likely doing. Be concise but thorough.";

    const prompt = `${systemPrompt}\n\nExplain this HTTP request:\n\n${request}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Gemini API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.candidates && data.candidates[0]?.content?.parts) {
                        for (const part of data.candidates[0].content.parts) {
                            if (part.text) {
                                fullText += part.text;
                                onUpdate(fullText);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

export async function streamExplanationFromGeminiWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate) {
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: combinedPrompt }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Gemini API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.candidates && data.candidates[0]?.content?.parts) {
                        for (const part of data.candidates[0].content.parts) {
                            if (part.text) {
                                fullText += part.text;
                                onUpdate(fullText);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

// Shared port connection for local model requests
let sharedPort = null;
let portListeners = new Map(); // Map of requestId -> listener function

function getOrCreatePort() {
    // Check if existing port is still valid
    if (sharedPort) {
        // Try to check if port is still connected by checking lastError
        // Note: lastError is only set after an operation, so we can't check it here
        // Instead, we'll rely on the onDisconnect handler
        return sharedPort;
    }
    
    // Create new port connection
    try {
        sharedPort = chrome.runtime.connect({ name: "rep-panel" });
        console.log('Created new port connection for local model requests');
        
        // Set up shared message listener
        sharedPort.onMessage.addListener((msg) => {
            // Only handle local-model messages, ignore others (like captured_request)
            if (!msg.type || !msg.type.startsWith('local-model')) {
                return; // Silently ignore non-local-model messages
            }
            
            console.log('Port received message:', msg.type, msg.requestId, 'Available listeners:', Array.from(portListeners.keys()));
            if (msg.requestId && portListeners.has(msg.requestId)) {
                const listener = portListeners.get(msg.requestId);
                console.log('Calling listener for requestId:', msg.requestId);
                listener(msg);
            } else {
                console.warn('Port message ignored - no listener for requestId:', msg.requestId, 'Available:', Array.from(portListeners.keys()));
            }
        });
        
        // Handle disconnection
        sharedPort.onDisconnect.addListener(() => {
            console.warn('Port disconnected, clearing shared port. Error:', chrome.runtime.lastError?.message);
            const wasConnected = sharedPort !== null;
            sharedPort = null;
            
            // Reject all pending requests only if we had an active connection
            if (wasConnected) {
                portListeners.forEach((listener, requestId) => {
                    try {
                        listener({ 
                            type: 'local-model-error', 
                            error: 'Connection to background script lost. Service worker may have been terminated.',
                            requestId: requestId
                        });
                    } catch (e) {
                        console.error('Error notifying listener:', e);
                    }
                });
                portListeners.clear();
            }
        });
        
        return sharedPort;
    } catch (e) {
        console.error('Failed to create port connection:', e);
        throw new Error('Failed to connect to background script: ' + e.message);
    }
}

export async function streamExplanationFromLocal(apiUrl, model, request, onUpdate) {
    const systemPrompt = "You are an expert security researcher and web developer. Explain the following HTTP request in detail, highlighting interesting parameters, potential security implications, and what this request is likely doing. Be concise but thorough.";
    const prompt = `${systemPrompt}\n\nExplain this HTTP request:\n\n${request}`;

    // Use background service worker to proxy the request (bypasses CORS)
    return new Promise((resolve, reject) => {
        let fullText = '';
        let buffer = '';
        const requestId = `local-${Date.now()}-${Math.random()}`;
        let isResolved = false;

        // Get or create shared port connection
        let port;
        try {
            port = getOrCreatePort();
        } catch (e) {
            reject(e);
            return;
        }

        const portMessageListener = (msg) => {
            // Only process messages for this request
            if (!msg.type || msg.requestId !== requestId) return;
            
            if (msg.type === 'local-model-stream-chunk') {
                buffer += msg.chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const data = JSON.parse(line);
                        // Ollama format: { "response": "text", "done": false }
                        if (data.response) {
                            fullText += data.response;
                            onUpdate(fullText);
                        }
                        // If done, break
                        if (data.done) {
                            if (!isResolved) {
                                isResolved = true;
                                portListeners.delete(requestId);
                                resolve(fullText);
                            }
                            return;
                        }
                    } catch (e) {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            } else if (msg.type === 'local-model-stream-done') {
                // Process any remaining buffer
                if (buffer.trim()) {
                    try {
                        const data = JSON.parse(buffer);
                        if (data.response) {
                            fullText += data.response;
                            onUpdate(fullText);
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
                if (!isResolved) {
                    isResolved = true;
                    portListeners.delete(requestId);
                    resolve(fullText);
                }
            } else if (msg.type === 'local-model-stream-error' || msg.type === 'local-model-error') {
                if (!isResolved) {
                    isResolved = true;
                    portListeners.delete(requestId);
                    reject(new Error(msg.error || 'Failed to communicate with local model API'));
                }
            }
        };

        // Register listener for this request
        portListeners.set(requestId, portMessageListener);

        // Set a timeout to detect if the request is stuck (60 seconds)
        const timeout = setTimeout(() => {
            if (!isResolved) {
                console.warn('Local model request timeout after 60s, requestId:', requestId);
            }
        }, 60000);

        // Wrap the listener to clear timeout on completion
        const wrappedListener = (msg) => {
            if (msg.type === 'local-model-stream-done' || msg.type === 'local-model-error' || msg.type === 'local-model-stream-error') {
                clearTimeout(timeout);
            }
            portMessageListener(msg);
        };
        
        // Update the listener in the map
        portListeners.set(requestId, wrappedListener);

        // Send request to background script via port
        try {
            const message = {
                type: 'local-model-request',
                requestId: requestId,
                url: apiUrl,
                body: {
                    model: model,
                    prompt: prompt,
                    stream: true
                }
            };
            
            port.postMessage(message);
            console.log('Sent local model request:', requestId, 'URL:', apiUrl, 'Model:', model);
            
            // Verify port is still connected after sending
            if (chrome.runtime.lastError) {
                clearTimeout(timeout);
                if (!isResolved) {
                    isResolved = true;
                    portListeners.delete(requestId);
                    reject(new Error('Port error after sending: ' + chrome.runtime.lastError.message));
                }
            }
        } catch (e) {
            clearTimeout(timeout);
            if (!isResolved) {
                isResolved = true;
                portListeners.delete(requestId);
                reject(new Error('Failed to send request to background script: ' + e.message));
            }
        }
    });
}

export async function streamExplanationFromLocalWithSystem(apiUrl, model, systemPrompt, userPrompt, onUpdate) {
    // Combine system prompt and user prompt for local models that don't support system messages
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    // Use background service worker to proxy the request (bypasses CORS)
    return new Promise((resolve, reject) => {
        let fullText = '';
        let buffer = '';
        const requestId = `local-${Date.now()}-${Math.random()}`;
        let isResolved = false;

        // Get or create shared port connection
        let port;
        try {
            port = getOrCreatePort();
        } catch (e) {
            reject(e);
            return;
        }

        const portMessageListener = (msg) => {
            // Only process messages for this request
            if (!msg.type || msg.requestId !== requestId) return;
            
            if (msg.type === 'local-model-stream-chunk') {
                buffer += msg.chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const data = JSON.parse(line);
                        // Ollama format: { "response": "text", "done": false }
                        if (data.response) {
                            fullText += data.response;
                            onUpdate(fullText);
                        }
                        // If done, break
                        if (data.done) {
                            if (!isResolved) {
                                isResolved = true;
                                portListeners.delete(requestId);
                                resolve(fullText);
                            }
                            return;
                        }
                    } catch (e) {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            } else if (msg.type === 'local-model-stream-done') {
                // Process any remaining buffer
                if (buffer.trim()) {
                    try {
                        const data = JSON.parse(buffer);
                        if (data.response) {
                            fullText += data.response;
                            onUpdate(fullText);
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
                if (!isResolved) {
                    isResolved = true;
                    portListeners.delete(requestId);
                    resolve(fullText);
                }
            } else if (msg.type === 'local-model-stream-error' || msg.type === 'local-model-error') {
                if (!isResolved) {
                    isResolved = true;
                    portListeners.delete(requestId);
                    reject(new Error(msg.error || 'Failed to communicate with local model API'));
                }
            }
        };

        // Register listener for this request
        portListeners.set(requestId, portMessageListener);

        // Set a timeout to detect if the request is stuck (60 seconds)
        const timeout = setTimeout(() => {
            if (!isResolved) {
                console.warn('Local model request timeout after 60s, requestId:', requestId);
            }
        }, 60000);

        // Send request to background script via port
        try {
            const message = {
                type: 'local-model-request',
                requestId: requestId,
                url: apiUrl,
                body: {
                    model: model,
                    prompt: prompt,
                    stream: true
                }
            };
            
            port.postMessage(message);
            console.log('Sent local model request (with system):', requestId);
            
            // Wrap the listener to clear timeout on completion
            const wrappedListener = (msg) => {
                if (msg.type === 'local-model-stream-done' || msg.type === 'local-model-error' || msg.type === 'local-model-stream-error') {
                    clearTimeout(timeout);
                }
                portMessageListener(msg);
            };
            
            // Update the listener in the map
            portListeners.set(requestId, wrappedListener);
        } catch (e) {
            clearTimeout(timeout);
            if (!isResolved) {
                isResolved = true;
                portListeners.delete(requestId);
                reject(new Error('Failed to send request to background script: ' + e.message));
            }
        }
    });
}

/**
 * Stream chat from Local/Ollama with proper message history
 */
export async function streamChatFromLocalWithMessages(apiKey, model, messages, onUpdate) {
    return new Promise((resolve, reject) => {
        let fullText = '';
        let buffer = ''; // Persistent buffer for accumulating incomplete JSON lines
        const requestId = `local-${Date.now()}-${Math.random()}`;
        let isResolved = false;

        // Get or create shared port connection
        let port;
        try {
            port = getOrCreatePort();
        } catch (e) {
            reject(e);
            return;
        }

        // Convert messages to Ollama format
        // Ollama expects: { model, messages: [{ role, content }], stream: true }
        const systemMessage = messages.find(m => m.role === 'system');
        const conversationMessages = messages.filter(m => m.role !== 'system');
        
        // Prepend system message to first user message if available
        const formattedMessages = conversationMessages.map((msg, index) => {
            if (index === 0 && msg.role === 'user' && systemMessage) {
                return {
                    role: 'user',
                    content: `${systemMessage.content}\n\n${msg.content}`
                };
            }
            return { role: msg.role, content: msg.content };
        });

        // Set a timeout to detect if the request is stuck (60 seconds)
        const timeout = setTimeout(() => {
            if (!isResolved) {
                console.warn('Local model chat request timeout after 60s, requestId:', requestId);
            }
        }, 60000);

        const portMessageListener = (msg) => {
            // Only process messages for this request
            if (!msg.type || msg.requestId !== requestId) return;
            
            if (msg.type === 'local-model-stream-chunk') {
                // Accumulate chunks in persistent buffer
                buffer += msg.chunk || '';
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            
                            // Ollama /api/generate format: { "response": "text", "done": false }
                            // Ollama /api/chat format: { "message": { "role": "assistant", "content": "text" }, "done": false }
                            let textChunk = null;
                            
                            if (data.response) {
                                // /api/generate format
                                textChunk = data.response;
                            } else if (data.message && data.message.content) {
                                // /api/chat format
                                textChunk = data.message.content;
                            }
                            
                            if (textChunk) {
                                fullText += textChunk;
                                onUpdate(fullText);
                            }
                            
                            // If done, resolve immediately
                            if (data.done) {
                                if (!isResolved) {
                                    isResolved = true;
                                    clearTimeout(timeout);
                                    portListeners.delete(requestId);
                                    resolve(fullText);
                                }
                                return;
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            } else if (msg.type === 'local-model-stream-done') {
                // Process any remaining buffer
                if (buffer.trim()) {
                    try {
                        const data = JSON.parse(buffer);
                        // Handle both /api/generate and /api/chat formats
                        let textChunk = null;
                        if (data.response) {
                            textChunk = data.response;
                        } else if (data.message && data.message.content) {
                            textChunk = data.message.content;
                        }
                        if (textChunk) {
                            fullText += textChunk;
                            onUpdate(fullText);
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
                
                // Background script sends 'local-model-stream-done' not 'local-model-stream-complete'
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeout);
                    portListeners.delete(requestId);
                    resolve(fullText);
                }
            } else if (msg.type === 'local-model-stream-error' || msg.type === 'local-model-error') {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeout);
                    portListeners.delete(requestId);
                    reject(new Error(msg.error || 'Failed to communicate with local model API'));
                }
            }
        };

        // Wrap the listener to clear timeout on completion (like explain function does)
        const wrappedListener = (msg) => {
            if (msg.type === 'local-model-stream-done' || msg.type === 'local-model-error' || msg.type === 'local-model-stream-error') {
                clearTimeout(timeout);
            }
            portMessageListener(msg);
        };
        
        // Register listener BEFORE sending message to avoid race condition
        portListeners.set(requestId, wrappedListener);
        console.log('Registered listener for requestId:', requestId, 'Total listeners:', portListeners.size);

        // Send request to background script
        // Use 'url' instead of 'apiUrl' to match what background script expects
        // For Ollama, if using messages array, we should use /api/chat endpoint instead of /api/generate
        let apiUrl = apiKey; // apiKey is actually the API URL for local
        if (apiUrl.includes('/api/generate') && formattedMessages.length > 0) {
            // Replace /api/generate with /api/chat for messages-based requests
            apiUrl = apiUrl.replace('/api/generate', '/api/chat');
        } else if (!apiUrl.includes('/api/') && !apiUrl.includes('/api/chat')) {
            // If no endpoint specified, default to /api/chat for messages
            apiUrl = apiUrl.replace(/\/$/, '') + '/api/chat';
        }
        
        try {
            const message = {
                type: 'local-model-chat',
                requestId: requestId,
                url: apiUrl,
                body: {
                    model: model,
                    messages: formattedMessages,
                    stream: true
                }
            };
            
            port.postMessage(message);
            console.log('Sent local model chat request:', requestId, 'URL:', apiUrl, 'Model:', model, 'Messages:', formattedMessages.length);
            console.log('Listener still registered after send:', portListeners.has(requestId));
            
            // Verify port is still connected after sending
            if (chrome.runtime.lastError) {
                clearTimeout(timeout);
                if (!isResolved) {
                    isResolved = true;
                    portListeners.delete(requestId);
                    reject(new Error('Port error after sending: ' + chrome.runtime.lastError.message));
                }
            }
        } catch (e) {
            clearTimeout(timeout);
            if (!isResolved) {
                isResolved = true;
                portListeners.delete(requestId);
                reject(new Error('Failed to send request to background script: ' + e.message));
            }
            return;
        }
    });
}
