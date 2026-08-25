// AI Integration Module - Main entry point and UI setup
import { 
    getAISettings, 
    saveAISettings, 
    fetchAnthropicModels,
    fetchGeminiModels
} from './core.js';

export const AI_CHAT_PROMPTS = Object.freeze({
    explain: 'Explain this HTTP request. Describe what it does, highlight important parameters and headers, and call out relevant security implications.',
    attack: 'Analyze this HTTP request and response for practical attack vectors. Prioritize likely vulnerabilities, explain what to test, and suggest concrete request modifications or payloads.'
});

// Re-export core functions for backward compatibility
export { 
    getAISettings, 
    saveAISettings, 
    streamExplanation, 
    streamExplanationWithSystem,
    streamExplanationFromClaude,
    streamExplanationFromClaudeWithSystem,
    streamExplanationFromGemini,
    streamExplanationFromGeminiWithSystem,
    streamExplanationFromLocal,
    streamExplanationFromLocalWithSystem
} from './core.js';
export { handleAIExplanation } from './explain.js';
export { handleAttackSurfaceAnalysis } from './suggestions.js';

export function setupAIFeatures(elements, chatController) {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const aiProviderSelect = document.getElementById('ai-provider');
    const anthropicApiKeyInput = document.getElementById('anthropic-api-key');
    const anthropicModelSelect = document.getElementById('anthropic-model');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const geminiModelSelect = document.getElementById('gemini-model');
    const anthropicSettings = document.getElementById('anthropic-settings');
    const geminiSettings = document.getElementById('gemini-settings');
    const localSettings = document.getElementById('local-settings');
    const localApiUrlInput = document.getElementById('local-api-url');
    const localModelInput = document.getElementById('local-model');
    const aiMenuBtn = document.getElementById('ai-menu-btn');
    const aiMenuDropdown = document.getElementById('ai-menu-dropdown');
    const explainBtn = document.getElementById('explain-btn');
    const suggestAttackBtn = document.getElementById('suggest-attack-btn');
    const ctxExplainAi = document.getElementById('ctx-explain-ai');

    function promptChat(message) {
        if (!chatController?.prompt) {
            console.error('AI chat is unavailable.');
            return;
        }
        chatController.prompt(message);
    }

    // Helpers to populate model dropdowns dynamically
    async function populateAnthropicModels(apiKey, currentModel) {
        if (!anthropicModelSelect || !apiKey) return;

        const models = await fetchAnthropicModels(apiKey);
        if (!models || models.length === 0) {
            // Leave existing options as fallback
            return;
        }

        const existingValue = currentModel || anthropicModelSelect.value || 'claude-3-5-sonnet-20241022';

        anthropicModelSelect.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            anthropicModelSelect.appendChild(opt);
        });

        // Ensure current model is preserved even if not in list
        if (existingValue && !models.some(m => m.id === existingValue)) {
            const customOpt = document.createElement('option');
            customOpt.value = existingValue;
            customOpt.textContent = `${existingValue} (saved)`;
            anthropicModelSelect.appendChild(customOpt);
        }

        anthropicModelSelect.value = existingValue;
    }

    async function populateGeminiModels(apiKey, currentModel) {
        if (!geminiModelSelect || !apiKey) return;

        const models = await fetchGeminiModels(apiKey);
        if (!models || models.length === 0) {
            // Leave existing options as fallback
            return;
        }

        const existingValue = currentModel || geminiModelSelect.value || 'gemini-flash-latest';

        geminiModelSelect.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            geminiModelSelect.appendChild(opt);
        });

        if (existingValue && !models.some(m => m.id === existingValue)) {
            const customOpt = document.createElement('option');
            customOpt.value = existingValue;
            customOpt.textContent = `${existingValue} (saved)`;
            geminiModelSelect.appendChild(customOpt);
        }

        geminiModelSelect.value = existingValue;
    }

    // Handle provider switching
    if (aiProviderSelect) {
        aiProviderSelect.addEventListener('change', () => {
            const provider = aiProviderSelect.value;
            anthropicSettings.style.display = 'none';
            geminiSettings.style.display = 'none';
            localSettings.style.display = 'none';
            
            if (provider === 'gemini') {
                geminiSettings.style.display = 'block';
                // Try to auto-load models if API key is present
                const key = geminiApiKeyInput ? geminiApiKeyInput.value.trim() : '';
                if (key) {
                    populateGeminiModels(key, geminiModelSelect ? geminiModelSelect.value : '');
                }
            } else if (provider === 'local') {
                localSettings.style.display = 'block';
            } else {
                anthropicSettings.style.display = 'block';
                const key = anthropicApiKeyInput ? anthropicApiKeyInput.value.trim() : '';
                if (key) {
                    populateAnthropicModels(key, anthropicModelSelect ? anthropicModelSelect.value : '');
                }
            }
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const { provider, apiKey, model } = getAISettings();

            if (aiProviderSelect) aiProviderSelect.value = provider;

            anthropicSettings.style.display = 'none';
            geminiSettings.style.display = 'none';
            localSettings.style.display = 'none';

            if (provider === 'gemini') {
                geminiApiKeyInput.value = apiKey;
                if (geminiModelSelect) geminiModelSelect.value = model;
                geminiSettings.style.display = 'block';
                // Auto-populate models list
                populateGeminiModels(apiKey, model);
            } else if (provider === 'local') {
                if (localApiUrlInput) localApiUrlInput.value = apiKey; // apiKey is actually the URL for local
                if (localModelInput) localModelInput.value = model;
                localSettings.style.display = 'block';
            } else {
                anthropicApiKeyInput.value = apiKey;
                if (anthropicModelSelect) anthropicModelSelect.value = model;
                anthropicSettings.style.display = 'block';
                // Auto-populate models list
                populateAnthropicModels(apiKey, model);
            }

            settingsModal.style.display = 'block';
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const provider = aiProviderSelect ? aiProviderSelect.value : 'anthropic';
            let key, model;

            if (provider === 'gemini') {
                key = geminiApiKeyInput.value.trim();
                model = geminiModelSelect ? geminiModelSelect.value : 'gemini-flash-latest';
            } else if (provider === 'local') {
                key = localApiUrlInput ? localApiUrlInput.value.trim() : 'http://localhost:11434/api/generate';
                model = localModelInput ? localModelInput.value.trim() : '';
            } else {
                key = anthropicApiKeyInput.value.trim();
                model = anthropicModelSelect ? anthropicModelSelect.value : 'claude-3-5-sonnet-20241022';
            }

            if (key && (provider !== 'local' || model)) {
                saveAISettings(provider, key, model);
                alert('Settings saved!');
                settingsModal.style.display = 'none';
            } else if (provider === 'local' && !model) {
                alert('Please enter a model name for the local provider.');
            } else {
                alert('Please enter required settings.');
            }
        });
    }

    if (aiMenuBtn && aiMenuDropdown) {
        aiMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            aiMenuDropdown.classList.toggle('show');
        });
        window.addEventListener('click', () => {
            if (aiMenuDropdown.classList.contains('show')) {
                aiMenuDropdown.classList.remove('show');
            }
        });
    }

    if (explainBtn) {
        explainBtn.addEventListener('click', () => {
            const content = elements.rawRequestInput.innerText;
            if (!content.trim()) {
                alert('Request is empty.');
                return;
            }
            promptChat(AI_CHAT_PROMPTS.explain);
        });
    }

    if (suggestAttackBtn) {
        suggestAttackBtn.addEventListener('click', () => {
            const requestContent = elements.rawRequestInput.innerText;
            if (!requestContent.trim()) {
                alert('Request is empty.');
                return;
            }
            promptChat(AI_CHAT_PROMPTS.attack);
        });
    }

    if (ctxExplainAi) {
        ctxExplainAi.addEventListener('click', () => {
            // Hide context menu if open
            const contextMenu = document.getElementById('context-menu');
            if (contextMenu) {
                contextMenu.classList.remove('show');
                contextMenu.style.visibility = 'hidden';
            }

            // Get stored selected text from context menu dataset
            const selectedText = contextMenu?.dataset.selectedText || window.getSelection().toString().trim();
            if (!selectedText) {
                alert('Please select some text to explain.');
                return;
            }
            const prompt = `Explain this specific part of the selected HTTP request or response:\n\n"${selectedText}"\n\nProvide context on what it is, how it is used, and any security relevance.`;
            promptChat(prompt);
            
            // Clear stored text
            if (contextMenu) {
                delete contextMenu.dataset.selectedText;
            }
        });
    }

    // Close Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}
