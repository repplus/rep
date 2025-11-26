// js/modules/ai.js
// AI Integration Module (Anthropic / OpenAI-compatible / Ollama)

const DEFAULTS = {
    provider: 'anthropic',
    anthropic: {
        baseUrl: 'https://api.anthropic.com/v1/messages',
        model: 'claude-3-5-sonnet-20241022'
    },
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini'
    },
    ollama: {
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.2:3b'
    },
    promptTemplate:
        "You are an expert security researcher and penetration tester. " +
        "Given an HTTP request, explain its purpose, parameters, " +
        "potential security implications, and what this request is likely doing. " +
        "Be concise but thorough, use Markdown.",
    contextTemplate:
        "The following content comes from a browser-based repeater tool " +
        "used for manual web application testing."
};

export function getAISettings() {
    const provider = localStorage.getItem('ai_provider') || DEFAULTS.provider;

    const promptTemplate =
        localStorage.getItem('ai_prompt_template') || DEFAULTS.promptTemplate;
    const contextTemplate =
        localStorage.getItem('ai_context_template') || DEFAULTS.contextTemplate;

    const promptByMode = {
        explain: localStorage.getItem('ai_prompt_explain') || '',
        'suggest-attacks': localStorage.getItem('ai_prompt_suggest_attacks') || ''
    };

    const contextByMode = {
        explain: localStorage.getItem('ai_context_explain') || '',
        'suggest-attacks': localStorage.getItem('ai_context_suggest_attacks') || ''
    };

    if (provider === 'openai') {
        return {
            provider,
            apiKey: localStorage.getItem('openai_api_key') || '',
            baseUrl: localStorage.getItem('openai_base_url') || DEFAULTS.openai.baseUrl,
            model: localStorage.getItem('openai_model') || DEFAULTS.openai.model,
            promptTemplate,
            contextTemplate,
            promptByMode,
            contextByMode
        };
    }

    if (provider === 'ollama') {
        return {
            provider,
            apiKey: '', // not used
            baseUrl: localStorage.getItem('ollama_base_url') || DEFAULTS.ollama.baseUrl,
            model: localStorage.getItem('ollama_model') || DEFAULTS.ollama.model,
            promptTemplate,
            contextTemplate,
            promptByMode,
            contextByMode
        };
    }

    // Default: Anthropic
    return {
        provider: 'anthropic',
        apiKey: localStorage.getItem('anthropic_api_key') || '',
        baseUrl: DEFAULTS.anthropic.baseUrl,
        model: localStorage.getItem('anthropic_model') || DEFAULTS.anthropic.model,
        promptTemplate,
        contextTemplate,
        promptByMode,
        contextByMode
    };
}

export function saveAISettings(settings) {
    const {
        provider,
        apiKey,
        baseUrl,
        model,
        promptTemplate,
        contextTemplate,
        promptByMode,
        contextByMode
    } = settings;

    if (provider) {
        localStorage.setItem('ai_provider', provider);
    }

    if (promptTemplate != null) {
        localStorage.setItem('ai_prompt_template', promptTemplate);
    }
    if (contextTemplate != null) {
        localStorage.setItem('ai_context_template', contextTemplate);
    }

    if (promptByMode) {
        const promptKeys = {
            explain: 'ai_prompt_explain',
            'suggest-attacks': 'ai_prompt_suggest_attacks'
        };
        Object.entries(promptByMode).forEach(([mode, value]) => {
            const key = promptKeys[mode];
            if (!key) return;
            if (value != null) {
                localStorage.setItem(key, value);
            }
        });
    }

    if (contextByMode) {
        const contextKeys = {
            explain: 'ai_context_explain',
            'suggest-attacks': 'ai_context_suggest_attacks'
        };
        Object.entries(contextByMode).forEach(([mode, value]) => {
            const key = contextKeys[mode];
            if (!key) return;
            if (value != null) {
                localStorage.setItem(key, value);
            }
        });
    }

    if (provider === 'openai') {
        if (apiKey != null) localStorage.setItem('openai_api_key', apiKey);
        if (baseUrl != null) localStorage.setItem('openai_base_url', baseUrl);
        if (model != null) localStorage.setItem('openai_model', model);
        return;
    }

    if (provider === 'ollama') {
        if (baseUrl != null) localStorage.setItem('ollama_base_url', baseUrl);
        if (model != null) localStorage.setItem('ollama_model', model);
        return;
    }

    // Anthropic
    if (apiKey != null) localStorage.setItem('anthropic_api_key', apiKey);
    if (model != null) localStorage.setItem('anthropic_model', model);
}

/**
 * Generic streaming entrypoint.
 *
 * @param {object} settings - getAISettings() result
 * @param {string} rawRequestText - raw request text (headers + body, or selection)
 * @param {string} mode - "explain" | "suggest-attacks" | others
 * @param {Function} onUpdate - callback with full accumulated text
 */
export async function streamExplanation(settings, rawRequestText, mode, onUpdate) {
    const modeKey = mode || 'explain';

    const promptByMode = settings.promptByMode || {};
    const contextByMode = settings.contextByMode || {};

    const perModePrompt = (promptByMode[modeKey] || '').trim();
    const perModeContext = (contextByMode[modeKey] || '').trim();

    const systemPrompt =
        perModePrompt ||
        settings.promptTemplate ||
        DEFAULTS.promptTemplate;

    const context =
        perModeContext ||
        settings.contextTemplate ||
        DEFAULTS.contextTemplate;

    const modeHint = modeKey === 'suggest-attacks'
        ? 'Focus on discovering potential exploits and attack vectors, payload ideas, and ways to chain this request with others.'
        : 'Focus on explanation, security implications, possible vulnerabilities, and where further testing is warranted.';

    const userContent = [
        context && `Context:\n${context}`,
        `Mode: ${modeKey}`,
        modeHint,
        'HTTP request (or selected text):',
        rawRequestText
    ]
        .filter(Boolean)
        .join('\n\n');

    if (settings.provider === 'openai') {
        return streamFromOpenAI(settings, systemPrompt, userContent, onUpdate);
    } else if (settings.provider === 'ollama') {
        return streamFromOllama(settings, systemPrompt, userContent, onUpdate);
    } else {
        return streamFromAnthropic(settings, systemPrompt, userContent, onUpdate);
    }
}

// --- Provider-specific implementations ---

async function streamFromAnthropic(settings, systemPrompt, prompt, onUpdate) {
    const { apiKey } = settings;
    const baseUrl = settings.baseUrl || DEFAULTS.anthropic.baseUrl;
    const model = settings.model || DEFAULTS.anthropic.model;

    if (!apiKey) {
        throw new Error('Anthropic API key is missing');
    }

    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            system: systemPrompt,
            max_tokens: 1024,
            stream: true,
            messages: [
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok || !response.body) {
        throw new Error(`Anthropic error ${response.status}`);
    }

    return readSSEStream(
        response.body,
        (data) => {
            if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                return data.delta.text;
            }
            return '';
        },
        onUpdate
    );
}

async function streamFromOpenAI(settings, systemPrompt, prompt, onUpdate) {
    const { apiKey } = settings;
    let baseUrl = settings.baseUrl || DEFAULTS.openai.baseUrl;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    if (!baseUrl.toLowerCase().includes('/v1')) {
        baseUrl += '/v1';
    }
    const url = baseUrl + '/chat/completions';
    const model = settings.model || DEFAULTS.openai.model;

    if (!apiKey) {
        throw new Error('OpenAI-compatible API key is missing');
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            stream: true,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok || !response.body) {
        throw new Error(`OpenAI error ${response.status}`);
    }

    return readSSEStream(
        response.body,
        (data) => {
            const choice = data.choices && data.choices[0];
            if (choice && choice.delta && typeof choice.delta.content === 'string') {
                return choice.delta.content;
            }
            return '';
        },
        onUpdate
    );
}

async function streamFromOllama(settings, systemPrompt, prompt, onUpdate) {
    let baseUrl = settings.baseUrl || DEFAULTS.ollama.baseUrl;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const url = baseUrl + '/api/chat';
    const model = settings.model || DEFAULTS.ollama.model;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model,
            stream: true,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok || !response.body) {
        throw new Error(`Ollama error ${response.status}`);
    }

    // Ollama streams NDJSON
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line) continue;

            try {
                const data = JSON.parse(line);
                if (data.message && typeof data.message.content === 'string') {
                    fullText += data.message.content;
                    onUpdate(fullText);
                }
            } catch {
                // ignore parse errors
            }
        }
    }

    return fullText;
}

// Generic SSE stream reader for Anthropic / OpenAI style chunking
async function readSSEStream(stream, extractDeltaFn, onUpdate) {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let eventBoundary;
        while ((eventBoundary = buffer.indexOf('\n\n')) >= 0) {
            const eventChunk = buffer.slice(0, eventBoundary);
            buffer = buffer.slice(eventBoundary + 2);

            const lines = eventChunk.split('\n').map(l => l.trim());
            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const dataStr = line.slice('data:'.length).trim();
                if (dataStr === '[DONE]') continue;

                try {
                    const json = JSON.parse(dataStr);
                    const delta = extractDeltaFn(json);
                    if (delta) {
                        fullText += delta;
                        onUpdate(fullText);
                    }
                } catch {
                    // ignore malformed chunk
                }
            }
        }
    }

    return fullText;
}
