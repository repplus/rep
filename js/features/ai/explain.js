// AI Explanation Module - Request explanation functionality
import { getAISettings, streamExplanation } from './core.js';
import { renderMarkdown } from '../../core/utils/dom.js';

/**
 * Handles AI explanation request
 * @param {string} promptPrefix - Prefix for the explanation prompt
 * @param {string} content - Content to explain
 * @param {HTMLElement} explanationModal - Modal element to display explanation
 * @param {HTMLElement} explanationContent - Content element in modal
 * @param {HTMLElement} settingsModal - Settings modal element
 */
export async function handleAIExplanation(promptPrefix, content, explanationModal, explanationContent, settingsModal, onTextUpdate) {
    const { provider, apiKey, model } = getAISettings();
    if (!apiKey || (['local', 'opencode'].includes(provider) && !model)) {
        let providerName = 'Anthropic';
        if (provider === 'gemini') {
            providerName = 'Gemini';
        } else if (provider === 'openai') {
            providerName = 'OpenAI Codex';
        } else if (provider === 'local') {
            providerName = 'Local Model';
        } else if (provider === 'opencode') {
            providerName = 'OpenCode';
        }
        const message = ['local', 'opencode'].includes(provider)
            ? `Please configure your ${providerName} server and model in Settings first.`
            : `Please configure your ${providerName} API Key in Settings first.`;
        alert(message);
        settingsModal.style.display = 'block';
        return;
    }

    // Update modal title
    const modalTitleElement = explanationModal.querySelector('.modal-header h3');
    if (modalTitleElement) {
        modalTitleElement.textContent = 'Request Explanation';
    }

    explanationModal.style.display = 'block';
    explanationContent.innerHTML = '<div class="loading-spinner">Generating...</div>';

    try {
        await streamExplanation(apiKey, model, promptPrefix + "\n\n" + content, (text) => {
            if (onTextUpdate) onTextUpdate(text);
            explanationContent.innerHTML = renderMarkdown(text);
        }, provider);
    } catch (error) {
        explanationContent.innerHTML = '';
        const errorElement = document.createElement('div');
        errorElement.style.color = 'var(--error-color)';
        errorElement.style.padding = '20px';
        errorElement.textContent = `Error: ${error.message}`;
        explanationContent.appendChild(errorElement);
    }
}
