import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiMocks = vi.hoisted(() => ({
    streamChatWithMessages: vi.fn()
}));

vi.mock('../js/features/ai/core.js', () => ({
    getAISettings: () => ({
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'test-model'
    }),
    streamChatWithMessages: aiMocks.streamChatWithMessages
}));

vi.mock('../js/network/handler.js', () => ({
    handleSendRequest: vi.fn()
}));

import { events } from '../js/core/events.js';
import { state } from '../js/core/state.js';
import { elements } from '../js/ui/main-ui.js';
import { setupLLMChat } from '../js/features/llm-chat/index.js';

describe('request AI chat controller', () => {
    beforeEach(() => {
        events.removeAllListeners();
        aiMocks.streamChatWithMessages.mockReset();
        aiMocks.streamChatWithMessages.mockImplementation(async (apiKey, model, messages, onUpdate) => {
            onUpdate('Assistant answer');
            return 'Assistant answer';
        });

        document.body.innerHTML = `
            <button id="llm-chat-toggle-btn"></button>
            <div class="split-view-container">
                <div class="pane request-pane"></div>
                <div class="resize-handle pane-resize-handle"></div>
                <div class="pane response-pane"></div>
                <div class="resize-handle pane-resize-handle chat-resize-handle"></div>
                <div id="llm-chat-pane" class="pane">
                    <button id="llm-chat-close-btn"></button>
                    <span id="llm-chat-request-badge"></span>
                    <span id="llm-chat-token-estimate"></span>
                    <div id="llm-chat-messages"></div>
                    <div class="llm-chat-input-wrapper">
                        <textarea id="llm-chat-input"></textarea>
                    </div>
                    <button id="llm-chat-send-btn"></button>
                    <button id="llm-chat-clear-btn"></button>
                </div>
            </div>
            <div id="raw-request-input"></div>
        `;

        const request = {
            request: {
                method: 'GET',
                url: 'https://example.test/account',
                httpVersion: 'HTTP/1.1',
                headers: [{ name: 'Accept', value: 'application/json' }]
            }
        };

        state.requests.length = 0;
        state.requests.push(request);
        state.selectedRequest = request;
        state.currentResponse = null;

        elements.rawRequestInput = document.getElementById('raw-request-input');
        Object.defineProperty(elements.rawRequestInput, 'innerText', {
            configurable: true,
            value: 'GET /account HTTP/1.1\nHost: example.test'
        });

        delete window.marked;
        delete window.hljs;
    });

    it('opens beside the request and preserves prior turns for follow-up prompts', async () => {
        const controller = setupLLMChat(elements);

        await controller.prompt('Explain this request');

        expect(document.getElementById('llm-chat-pane').style.display).toBe('flex');
        expect(document.querySelector('.request-pane').style.flex).toBe('0 0 33.33%');
        expect(document.querySelector('.response-pane').style.flex).toBe('0 0 33.33%');
        expect(document.getElementById('llm-chat-messages').textContent).toContain('Explain this request');
        expect(document.getElementById('llm-chat-messages').textContent).toContain('Assistant answer');

        const firstMessages = aiMocks.streamChatWithMessages.mock.calls[0][2];
        expect(firstMessages.at(-1).content).toContain('--- Current Request');
        expect(firstMessages.at(-1).content).toContain('GET /account HTTP/1.1');

        await controller.prompt('What should I test first?');

        const secondMessages = aiMocks.streamChatWithMessages.mock.calls[1][2];
        expect(secondMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Explain this request' }),
            expect.objectContaining({ role: 'assistant', content: 'Assistant answer' })
        ]));
        expect(secondMessages.at(-1).content).toContain('What should I test first?');
    });
});
