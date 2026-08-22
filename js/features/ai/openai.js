const OPENAI_API_BASE = 'https://api.openai.com/v1';
const OPENAI_REQUEST_TIMEOUT_MS = 15000;
const OPENAI_RESPONSE_TIMEOUT_MS = 5 * 60 * 1000;
const OPENAI_INACTIVITY_TIMEOUT_MS = 60 * 1000;

async function getOpenAIError(response) {
    const text = await response.text();
    try {
        const data = JSON.parse(text);
        return data.error?.message || data.message || text;
    } catch (error) {
        return text || `OpenAI request failed with status ${response.status}`;
    }
}

export async function fetchOpenAIModels(apiKey, fetchImpl = fetch) {
    if (!apiKey) return [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetchImpl(`${OPENAI_API_BASE}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal
        });
        if (!response.ok) throw new Error(await getOpenAIError(response));

        const data = await response.json();
        return (Array.isArray(data.data) ? data.data : [])
            .map(model => model.id)
            .filter(id => typeof id === 'string' && id.toLowerCase().includes('codex'))
            .sort()
            .map(id => ({ id, label: id }));
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('OpenAI model discovery timed out.');
        throw error;
    } finally {
        clearTimeout(timeout);
        controller.abort();
    }
}

export function createOpenAIResponseParser(onEvent) {
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
                if (data && data !== '[DONE]') onEvent(JSON.parse(data));
                boundary = buffer.match(/\r?\n\r?\n/);
            }
        }
    };
}

export async function streamFromOpenAI(apiKey, model, messages, onUpdate, fetchImpl = fetch, options = {}) {
    const instructions = messages
        .filter(message => message.role === 'system')
        .map(message => message.content)
        .join('\n\n');
    const input = messages
        .filter(message => message.role !== 'system')
        .map(message => ({ role: message.role, content: message.content }));

    const controller = new AbortController();
    let timeoutMessage = 'OpenAI response timed out.';
    const cancelRequest = () => {
        timeoutMessage = 'OpenAI request was cancelled.';
        controller.abort();
    };
    if (options.signal?.aborted) cancelRequest();
    else options.signal?.addEventListener('abort', cancelRequest, { once: true });
    const responseTimeout = setTimeout(() => controller.abort(), OPENAI_RESPONSE_TIMEOUT_MS);
    let inactivityTimeout;
    const resetInactivityTimeout = () => {
        clearTimeout(inactivityTimeout);
        timeoutMessage = 'OpenAI response stream stalled.';
        inactivityTimeout = setTimeout(() => controller.abort(), OPENAI_INACTIVITY_TIMEOUT_MS);
    };

    let fullText = '';
    let completed = false;
    const parser = createOpenAIResponseParser(event => {
        if (
            (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') &&
            typeof event.delta === 'string'
        ) {
            fullText += event.delta;
            onUpdate(fullText);
        } else if (event.type === 'response.completed') {
            completed = true;
        } else if (event.type === 'response.failed' || event.type === 'response.incomplete') {
            throw new Error(event.response?.error?.message || 'OpenAI could not complete the response.');
        } else if (event.type === 'error') {
            throw new Error(event.message || event.error?.message || 'OpenAI response failed.');
        }
    });

    try {
        const response = await fetchImpl(`${OPENAI_API_BASE}/responses`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                Accept: 'text/event-stream'
            },
            body: JSON.stringify({
                model,
                instructions,
                input,
                max_output_tokens: 4096,
                store: false,
                stream: true
            }),
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal
        });
        if (!response.ok) throw new Error(await getOpenAIError(response));
        if (!response.body) throw new Error('OpenAI returned an empty response stream.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        resetInactivityTimeout();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            resetInactivityTimeout();
            parser.feed(decoder.decode(value, { stream: true }));
        }
        parser.feed(decoder.decode());

        if (!completed) throw new Error('OpenAI closed the response stream before completion.');
        if (!fullText) throw new Error('OpenAI completed without returning text.');
        return fullText;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error(timeoutMessage);
        throw error;
    } finally {
        clearTimeout(responseTimeout);
        clearTimeout(inactivityTimeout);
        options.signal?.removeEventListener('abort', cancelRequest);
        controller.abort();
    }
}
