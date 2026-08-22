// AI Integration Module - Main entry point and UI setup
import { 
    getAISettings, 
    saveAISettings, 
    streamExplanationWithSystem,
    fetchAnthropicModels,
    fetchGeminiModels
} from './core.js';
import { fetchOpenAIModels } from './openai.js';
import { handleAIExplanation } from './explain.js';
import { handleAttackSurfaceAnalysis } from './suggestions.js';
import {
    fetchOpenCodeModels,
    getOpenCodePermissionPattern,
    normalizeOpenCodeBaseUrl,
    testOpenCodeConnection
} from './opencode.js';
import { state } from '../../core/state.js';

let lastAiMarkdown = '';
let lastAiType = ''; // 'explain' or 'attack-analysis'

function setLastAiText(text, type) {
    lastAiMarkdown = text || '';
    lastAiType = type || '';
}

function generateExportFilename(extension = 'md') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const type = lastAiType || 'ai-output';
    
    let host = 'unknown';
    let endpoint = 'unknown';
    
    if (state.selectedRequest && state.selectedRequest.request) {
        try {
            const url = new URL(state.selectedRequest.request.url);
            host = url.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
            let path = url.pathname || '/';
            // Clean up path: remove leading/trailing slashes, replace slashes with underscores, limit length
            path = path.replace(/^\/+|\/+$/g, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50);
            endpoint = path || 'root';
        } catch (e) {
            // If URL parsing fails, use the raw URL
            const urlStr = state.selectedRequest.request.url || '';
            host = urlStr.split('/')[2]?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'unknown';
            const pathParts = urlStr.split('/').slice(3).filter(p => p).join('_');
            endpoint = pathParts.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50) || 'root';
        }
    }
    
    return `rep-plus-${type}-${host}-${endpoint}-${timestamp}.${extension}`;
}

function downloadMarkdown(text) {
    const filename = generateExportFilename('md');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadPdfFromHtml(htmlContent) {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const exportedAt = new Date().toLocaleString();
    const filename = generateExportFilename('pdf').replace('.pdf', '');
    win.document.write(`
        <html>
        <head>
            <title>${filename}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
                .footer { margin-top: 24px; font-size: 12px; color: #555; border-top: 1px solid #ddd; padding-top: 8px; }
            </style>
        </head>
        <body>
            ${htmlContent}
            <div class="footer">
                Exported from rep+ on ${exportedAt} — https://github.com/bscript/rep
            </div>
        </body>
        </html>
    `);
    win.document.close();
    win.focus();
    win.print();
}

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

export function setupAIFeatures(elements) {
    let openCodeConnectAttempt = 0;
    let openAIConnectAttempt = 0;
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const aiProviderSelect = document.getElementById('ai-provider');
    const anthropicApiKeyInput = document.getElementById('anthropic-api-key');
    const anthropicModelSelect = document.getElementById('anthropic-model');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const geminiModelSelect = document.getElementById('gemini-model');
    const openAISettings = document.getElementById('openai-settings');
    const openAIApiKeyInput = document.getElementById('openai-api-key');
    const openAIModelSelect = document.getElementById('openai-model');
    const openAIConnectBtn = document.getElementById('openai-connect-btn');
    const openAIStatus = document.getElementById('openai-status');
    const anthropicSettings = document.getElementById('anthropic-settings');
    const geminiSettings = document.getElementById('gemini-settings');
    const localSettings = document.getElementById('local-settings');
    const localApiUrlInput = document.getElementById('local-api-url');
    const localModelInput = document.getElementById('local-model');
    const opencodeSettings = document.getElementById('opencode-settings');
    const opencodeBaseUrlInput = document.getElementById('opencode-base-url');
    const opencodeUsernameInput = document.getElementById('opencode-username');
    const opencodePasswordInput = document.getElementById('opencode-password');
    const opencodeModelSelect = document.getElementById('opencode-model');
    const opencodeConnectBtn = document.getElementById('opencode-connect-btn');
    const opencodeStatus = document.getElementById('opencode-status');
    const aiMenuBtn = document.getElementById('ai-menu-btn');
    const aiMenuDropdown = document.getElementById('ai-menu-dropdown');
    const explainBtn = document.getElementById('explain-btn');
    const suggestAttackBtn = document.getElementById('suggest-attack-btn');
    const explanationModal = document.getElementById('explanation-modal');
    const explanationContent = document.getElementById('explanation-content');
    const ctxExplainAi = document.getElementById('ctx-explain-ai');
    const exportToggle = document.getElementById('ai-export-toggle');
    const exportMenu = document.getElementById('ai-export-menu');
    const exportMdItem = document.getElementById('ai-export-md-item');
    const exportPdfItem = document.getElementById('ai-export-pdf-item');

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

    function renderOpenAIModels(models, currentModel, preserveMissing = true) {
        if (!openAIModelSelect) return;
        openAIModelSelect.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.label;
            openAIModelSelect.appendChild(option);
        });
        if (preserveMissing && currentModel && !models.some(model => model.id === currentModel)) {
            const option = document.createElement('option');
            option.value = currentModel;
            option.textContent = `${currentModel} (saved)`;
            openAIModelSelect.appendChild(option);
        }
        if (currentModel && (preserveMissing || models.some(model => model.id === currentModel))) {
            openAIModelSelect.value = currentModel;
        }
    }

    function ensureOpenAIPermission() {
        return new Promise((resolve, reject) => {
            chrome.permissions.request({ origins: ['https://api.openai.com/*'] }, granted => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (granted) {
                    resolve();
                } else {
                    reject(new Error('Permission to connect to the OpenAI API was denied.'));
                }
            });
        });
    }

    async function connectOpenAI() {
        const attempt = ++openAIConnectAttempt;
        const apiKey = openAIApiKeyInput?.value.trim() || '';
        if (openAIStatus) openAIStatus.textContent = 'Loading Codex models...';
        if (openAIConnectBtn) openAIConnectBtn.disabled = true;

        try {
            if (!apiKey) throw new Error('Enter an OpenAI API key first.');
            await ensureOpenAIPermission();
            const models = await fetchOpenAIModels(apiKey);
            if (attempt !== openAIConnectAttempt) return false;
            if (models.length === 0) throw new Error('No Codex models were found for this API key.');
            renderOpenAIModels(models, openAIModelSelect?.value || localStorage.getItem('openai_model') || '', false);
            if (openAIStatus) openAIStatus.textContent = `Loaded ${models.length} Codex models.`;
            return true;
        } catch (error) {
            if (attempt !== openAIConnectAttempt) return false;
            if (openAIStatus) openAIStatus.textContent = `Connection failed: ${error.message}`;
            throw error;
        } finally {
            if (attempt === openAIConnectAttempt && openAIConnectBtn) openAIConnectBtn.disabled = false;
        }
    }

    function getOpenCodeFormSettings() {
        const baseUrl = normalizeOpenCodeBaseUrl(opencodeBaseUrlInput?.value.trim());
        return {
            provider: 'opencode',
            apiKey: baseUrl,
            baseUrl,
            username: opencodeUsernameInput?.value.trim() || 'opencode',
            password: opencodePasswordInput?.value || '',
            model: opencodeModelSelect?.value || ''
        };
    }

    function ensureOpenCodePermission(baseUrl) {
        const origins = [getOpenCodePermissionPattern(baseUrl)];
        return new Promise((resolve, reject) => {
            chrome.permissions.request({ origins }, granted => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (granted) {
                    resolve();
                } else {
                    reject(new Error('Permission to connect to the local OpenCode server was denied.'));
                }
            });
        });
    }

    function populateOpenCodeDefaults() {
        if (opencodeBaseUrlInput) {
            opencodeBaseUrlInput.value = localStorage.getItem('opencode_base_url') || 'http://127.0.0.1:4096';
        }
        if (opencodeUsernameInput) {
            opencodeUsernameInput.value = localStorage.getItem('opencode_username') || 'opencode';
        }
        if (opencodePasswordInput) {
            opencodePasswordInput.value = localStorage.getItem('opencode_password') || '';
        }

        const savedModel = localStorage.getItem('opencode_model') || '';
        renderOpenCodeModels([], savedModel);
    }

    function renderOpenCodeModels(models, currentModel, preserveMissing = true) {
        if (!opencodeModelSelect) return;
        opencodeModelSelect.innerHTML = '';

        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.label;
            opencodeModelSelect.appendChild(option);
        });

        if (preserveMissing && currentModel && !models.some(model => model.id === currentModel)) {
            const savedOption = document.createElement('option');
            savedOption.value = currentModel;
            savedOption.textContent = `${currentModel} (saved)`;
            opencodeModelSelect.appendChild(savedOption);
        }

        if (currentModel && (preserveMissing || models.some(model => model.id === currentModel))) {
            opencodeModelSelect.value = currentModel;
        }
    }

    async function connectOpenCode() {
        const attempt = ++openCodeConnectAttempt;
        if (opencodeStatus) opencodeStatus.textContent = 'Connecting...';
        if (opencodeConnectBtn) opencodeConnectBtn.disabled = true;

        try {
            const settings = getOpenCodeFormSettings();
            await ensureOpenCodePermission(settings.baseUrl);
            const [health, models] = await Promise.all([
                testOpenCodeConnection(settings),
                fetchOpenCodeModels(settings)
            ]);
            if (attempt !== openCodeConnectAttempt) return false;
            if (models.length === 0) {
                throw new Error('OpenCode is healthy, but no available models were found.');
            }
            renderOpenCodeModels(models, opencodeModelSelect?.value || settings.model, false);
            if (opencodeStatus) {
                opencodeStatus.textContent = `Connected to OpenCode ${health.version || ''}. Loaded ${models.length} models.`;
            }
            return true;
        } catch (error) {
            if (attempt !== openCodeConnectAttempt) return false;
            if (opencodeStatus) opencodeStatus.textContent = `Connection failed: ${error.message}`;
            throw error;
        } finally {
            if (attempt === openCodeConnectAttempt && opencodeConnectBtn) {
                opencodeConnectBtn.disabled = false;
            }
        }
    }

    // Handle provider switching
    if (aiProviderSelect) {
        aiProviderSelect.addEventListener('change', () => {
            const provider = aiProviderSelect.value;
            if (provider !== 'opencode') openCodeConnectAttempt++;
            if (provider !== 'openai') openAIConnectAttempt++;
            anthropicSettings.style.display = 'none';
            geminiSettings.style.display = 'none';
            openAISettings.style.display = 'none';
            localSettings.style.display = 'none';
            opencodeSettings.style.display = 'none';
            
            if (provider === 'gemini') {
                geminiSettings.style.display = 'block';
                // Try to auto-load models if API key is present
                const key = geminiApiKeyInput ? geminiApiKeyInput.value.trim() : '';
                if (key) {
                    populateGeminiModels(key, geminiModelSelect ? geminiModelSelect.value : '');
                }
            } else if (provider === 'openai') {
                openAISettings.style.display = 'block';
                if (openAIApiKeyInput) openAIApiKeyInput.value = localStorage.getItem('openai_api_key') || '';
                renderOpenAIModels([], localStorage.getItem('openai_model') || 'gpt-5.3-codex');
                if (openAIApiKeyInput?.value) connectOpenAI().catch(() => {});
            } else if (provider === 'local') {
                localSettings.style.display = 'block';
            } else if (provider === 'opencode') {
                opencodeSettings.style.display = 'block';
                populateOpenCodeDefaults();
                connectOpenCode().catch(() => {});
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
            const settings = getAISettings();
            const { provider, apiKey, model } = settings;

            if (aiProviderSelect) aiProviderSelect.value = provider;

            anthropicSettings.style.display = 'none';
            geminiSettings.style.display = 'none';
            openAISettings.style.display = 'none';
            localSettings.style.display = 'none';
            opencodeSettings.style.display = 'none';

            if (provider === 'gemini') {
                geminiApiKeyInput.value = apiKey;
                if (geminiModelSelect) geminiModelSelect.value = model;
                geminiSettings.style.display = 'block';
                // Auto-populate models list
                populateGeminiModels(apiKey, model);
            } else if (provider === 'openai') {
                if (openAIApiKeyInput) openAIApiKeyInput.value = apiKey;
                renderOpenAIModels([], model);
                openAISettings.style.display = 'block';
                if (apiKey) connectOpenAI().catch(() => {});
            } else if (provider === 'local') {
                if (localApiUrlInput) localApiUrlInput.value = apiKey; // apiKey is actually the URL for local
                if (localModelInput) localModelInput.value = model;
                localSettings.style.display = 'block';
            } else if (provider === 'opencode') {
                if (opencodeBaseUrlInput) opencodeBaseUrlInput.value = settings.baseUrl;
                if (opencodeUsernameInput) opencodeUsernameInput.value = settings.username;
                if (opencodePasswordInput) opencodePasswordInput.value = settings.password;
                renderOpenCodeModels([], model);
                if (opencodeStatus) opencodeStatus.textContent = 'Test the connection to refresh available models.';
                opencodeSettings.style.display = 'block';
                connectOpenCode().catch(() => {});
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

    if (opencodeConnectBtn) {
        opencodeConnectBtn.addEventListener('click', () => {
            connectOpenCode().catch(() => {});
        });
    }

    if (openAIConnectBtn) {
        openAIConnectBtn.addEventListener('click', () => {
            connectOpenAI().catch(() => {});
        });
    }

    openAIApiKeyInput?.addEventListener('input', () => {
        openAIConnectAttempt++;
        renderOpenAIModels([], 'gpt-5.3-codex');
        if (openAIStatus) openAIStatus.textContent = 'API key changed. Reload Codex models.';
        if (openAIConnectBtn) openAIConnectBtn.disabled = false;
    });

    [opencodeBaseUrlInput, opencodeUsernameInput, opencodePasswordInput].forEach(input => {
        input?.addEventListener('input', () => {
            openCodeConnectAttempt++;
            renderOpenCodeModels([], '');
            if (opencodeStatus) opencodeStatus.textContent = 'Connection details changed. Reconnecting is required.';
            if (opencodeConnectBtn) opencodeConnectBtn.disabled = false;
        });
    });

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            const provider = aiProviderSelect ? aiProviderSelect.value : 'anthropic';
            let key, model, options = {};

            if (provider === 'gemini') {
                key = geminiApiKeyInput.value.trim();
                model = geminiModelSelect ? geminiModelSelect.value : 'gemini-flash-latest';
            } else if (provider === 'openai') {
                try {
                    const connected = await connectOpenAI();
                    if (!connected) return;
                    key = openAIApiKeyInput.value.trim();
                    model = openAIModelSelect?.value || '';
                } catch (error) {
                    alert(error.message);
                    return;
                }
            } else if (provider === 'local') {
                key = localApiUrlInput ? localApiUrlInput.value.trim() : 'http://localhost:11434/api/generate';
                model = localModelInput ? localModelInput.value.trim() : '';
            } else if (provider === 'opencode') {
                try {
                    const connected = await connectOpenCode();
                    if (!connected) return;
                    const settings = getOpenCodeFormSettings();
                    key = settings.baseUrl;
                    model = settings.model;
                    options = { username: settings.username, password: settings.password };
                } catch (error) {
                    alert(error.message);
                    return;
                }
            } else {
                key = anthropicApiKeyInput.value.trim();
                model = anthropicModelSelect ? anthropicModelSelect.value : 'claude-3-5-sonnet-20241022';
            }

            if (key && (!['local', 'opencode'].includes(provider) || model)) {
                saveAISettings(provider, key, model, options);
                alert('Settings saved!');
                settingsModal.style.display = 'none';
            } else if (['local', 'opencode'].includes(provider) && !model) {
                alert(provider === 'opencode'
                    ? 'Test the OpenCode connection and select a model first.'
                    : 'Please enter a model name for the local provider.');
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
            const setLastAiTextWithType = (text) => setLastAiText(text, 'explain');
            handleAIExplanation("Explain this HTTP request:", content, explanationModal, explanationContent, settingsModal, setLastAiTextWithType);
        });
    }

    if (suggestAttackBtn) {
        suggestAttackBtn.addEventListener('click', async () => {
            const requestContent = elements.rawRequestInput.innerText;
            if (!requestContent.trim()) {
                alert('Request is empty.');
                return;
            }

            // Get response content
            let responseContent = elements.rawResponseDisplay.innerText || '';
            
            // Import handleSendRequest dynamically to avoid circular dependency
            let handleSendRequest = null;
                    try {
                const handlerModule = await import('../../network/handler.js');
                handleSendRequest = handlerModule.handleSendRequest;
                    } catch (error) {
                console.warn('Could not import handleSendRequest:', error);
            }

            const setLastAiTextWithType = (text) => setLastAiText(text, 'attack-analysis');
            await handleAttackSurfaceAnalysis(
                requestContent,
                responseContent,
                explanationModal,
                explanationContent,
                settingsModal,
                handleSendRequest,
                setLastAiTextWithType
            );
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
            const prompt = `Explain this specific part of an HTTP request / response: \n\n"${selectedText}"\n\nProvide context on what it is, how it's used, and any security relevance.`;
            handleAIExplanation(prompt, "", explanationModal, explanationContent, settingsModal, setLastAiText);
            
            // Clear stored text
            if (contextMenu) {
                delete contextMenu.dataset.selectedText;
            }
        });
    }

    // Export controls (dropdown)
    if (exportToggle && exportMenu) {
        const closeMenu = () => { exportMenu.style.display = 'none'; };
        exportToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.style.display = exportMenu.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!exportMenu.contains(e.target) && e.target !== exportToggle) {
                closeMenu();
            }
        });
    }

    if (exportMdItem) {
        exportMdItem.addEventListener('click', () => {
            if (!lastAiMarkdown.trim()) {
                alert('No AI output to export yet.');
                return;
            }
            downloadMarkdown(lastAiMarkdown);
            if (exportMenu) exportMenu.style.display = 'none';
        });
    }

    if (exportPdfItem) {
        exportPdfItem.addEventListener('click', () => {
            const html = explanationContent ? explanationContent.innerHTML : '';
            if (!html || !html.trim()) {
                alert('No AI output to export yet.');
                return;
            }
            downloadPdfFromHtml(html);
            if (exportMenu) exportMenu.style.display = 'none';
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
