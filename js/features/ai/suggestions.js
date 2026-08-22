// AI Suggestions Module - Attack vector analysis and suggestions
import { getAISettings, streamExplanationWithSystem } from './core.js';
import { renderMarkdown } from '../../core/utils/dom.js';

/**
 * Handles AI attack surface analysis request
 * @param {string} requestContent - The HTTP request content
 * @param {string} responseContent - The HTTP response content (optional)
 * @param {HTMLElement} explanationModal - Modal element to display analysis
 * @param {HTMLElement} explanationContent - Content element in modal
 * @param {HTMLElement} settingsModal - Settings modal element
 * @param {Function} handleSendRequest - Function to send request if needed
 */
export async function handleAttackSurfaceAnalysis(
    requestContent,
    responseContent,
    explanationModal,
    explanationContent,
    settingsModal,
    handleSendRequest,
    onTextUpdate
) {
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

    let hasResponse = responseContent && responseContent.trim().length > 0;

    // If no response exists, auto-send the request first
    if (!hasResponse && handleSendRequest) {
        const shouldSend = confirm('No response available. Send the request first to get a response for analysis?');
        if (shouldSend) {
            try {
                // Show loading indicator
                explanationModal.style.display = 'block';
                explanationContent.innerHTML = '<div class="loading-spinner">Sending request and waiting for response...</div>';

                // Send the request
                await handleSendRequest();

                // Wait a bit for UI to update
                await new Promise(resolve => setTimeout(resolve, 500));

                // Get the response that was just populated
                const rawResponseDisplay = document.getElementById('raw-response-display');
                responseContent = rawResponseDisplay ? rawResponseDisplay.innerText || '' : '';
                hasResponse = responseContent.trim().length > 0;

                if (!hasResponse) {
                    explanationContent.innerHTML = '<div style="color: var(--error-color); padding: 20px;">Failed to get response. Analyzing request only.</div>';
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (error) {
                explanationContent.innerHTML = `<div style="color: var(--error-color); padding: 20px;">Error sending request: ${error.message}</div>`;
                await new Promise(resolve => setTimeout(resolve, 2000));
                hasResponse = false;
            }
        }
    }

    // Build the analysis prompt
    let analysisPrompt = `Analyze the following HTTP request${hasResponse ? ' and response' : ''} and produce:

1. A short summary of what this endpoint likely does.
2. The top 5 realistic attack vectors based on ${hasResponse ? 'BOTH the request and the response' : 'the request (note: response not available)'}.
3. For each attack vector:
   - Why this vector might work (based on ${hasResponse ? 'request/response evidence' : 'request evidence'})
   - 2–3 test payloads
4. Highlight reflected parameters, error messages, sensitive data, or unusual patterns.
5. If applicable, propose a multi-step chained attack.

REQUEST:
${requestContent}`;

    if (hasResponse) {
        analysisPrompt += `

RESPONSE:
${responseContent}`;
    } else {
        analysisPrompt += `

⚠️ NOTE: Response data is not available. Analysis will be limited to request-based insights only.`;
    }

    analysisPrompt += `

Output must stay concise, structured, and actionable. Format as clear Markdown.`;

    // Update modal title
    const modalTitleElement = explanationModal.querySelector('.modal-header h3');
    if (modalTitleElement) {
        modalTitleElement.textContent = 'Security Analysis';
    }

    explanationModal.style.display = 'block';
    explanationContent.innerHTML = '<div class="loading-spinner">Generating...</div>';

    try {
        await streamExplanationWithSystem(
            apiKey,
            model,
            "You are an AI security assistant inside a web security testing tool. Your job is to analyze HTTP requests and responses to identify realistic attack vectors and generate payloads. Be precise and base everything strictly on what you see.",
            analysisPrompt,
            (text) => {
                if (onTextUpdate) onTextUpdate(text);
                explanationContent.innerHTML = renderMarkdown(text);
            },
            provider
        );
    } catch (error) {
        explanationContent.innerHTML = '';
        const errorElement = document.createElement('div');
        errorElement.style.color = 'var(--error-color)';
        errorElement.style.padding = '20px';
        errorElement.textContent = `Error: ${error.message}`;
        explanationContent.appendChild(errorElement);
    }
}
