import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_CHAT_PROMPTS, setupAIFeatures } from '../js/features/ai/index.js';

describe('AI chat quick actions', () => {
    let chatController;
    let rawRequestInput;

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="explain-btn"></button>
            <button id="suggest-attack-btn"></button>
            <div id="context-menu"></div>
            <button id="ctx-explain-ai"></button>
        `;

        rawRequestInput = document.createElement('div');
        Object.defineProperty(rawRequestInput, 'innerText', {
            configurable: true,
            writable: true,
            value: 'GET /account HTTP/1.1\nHost: example.test'
        });

        chatController = {
            prompt: vi.fn(() => Promise.resolve(true))
        };

        setupAIFeatures({ rawRequestInput }, chatController);
    });

    it('routes explanation and attack analysis into the request chat', () => {
        document.getElementById('explain-btn').click();
        document.getElementById('suggest-attack-btn').click();

        expect(chatController.prompt).toHaveBeenNthCalledWith(1, AI_CHAT_PROMPTS.explain);
        expect(chatController.prompt).toHaveBeenNthCalledWith(2, AI_CHAT_PROMPTS.attack);
    });

    it('routes selected request or response text into the same chat', () => {
        const contextMenu = document.getElementById('context-menu');
        contextMenu.dataset.selectedText = 'Authorization: Bearer token';

        document.getElementById('ctx-explain-ai').click();

        expect(chatController.prompt).toHaveBeenCalledWith(
            expect.stringContaining('Authorization: Bearer token')
        );
        expect(contextMenu.dataset.selectedText).toBeUndefined();
    });

    it('does not start a quick action for an empty request', () => {
        rawRequestInput.innerText = '   ';
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

        document.getElementById('explain-btn').click();
        document.getElementById('suggest-attack-btn').click();

        expect(chatController.prompt).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledTimes(2);
    });
});
