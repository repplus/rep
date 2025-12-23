// Request Handler Module - High-level orchestrator for sending requests
import { state, addToHistory } from '../core/state.js';
import { elements, updateHistoryButtons } from '../ui/main-ui.js';
import { parseRequest } from './capture.js';
import { sendRequest } from './request-sender.js';
import { formatRawResponse, getStatusClass } from './response-parser.js';
import { formatBytes } from '../core/utils/format.js';
import { renderDiff } from '../core/utils/misc.js';
import { highlightHTTP } from '../core/utils/network.js';
import { events, EVENT_NAMES } from '../core/events.js';
import { generateHexView } from '../ui/hex-view.js'
import { generateJsonView } from '../ui/json-view.js'

export async function handleSendRequest() {
    const rawContent = elements.rawRequestInput.innerText;
    const useHttps = elements.useHttpsCheckbox.checked;

    // Add to history
    addToHistory(rawContent, useHttps);
    updateHistoryButtons();

    try {
        const { url, options, method, filteredHeaders, bodyText } = parseRequest(rawContent, useHttps);

        elements.resStatus.textContent = 'Sending...';
        elements.resStatus.className = 'status-badge';

        console.log('Sending request to:', url);

        const result = await sendRequest(url, options);

        elements.resTime.textContent = `${result.duration}ms`;
        elements.resSize.textContent = formatBytes(result.size);

        elements.resStatus.textContent = `${result.status} ${result.statusText}`;
        elements.resStatus.className = getStatusClass(result.status);

        // Format raw HTTP response
        const rawResponse = formatRawResponse(result);

        // Store current response
        state.currentResponse = rawResponse;

        // Handle Diff Baseline
        if (!state.regularRequestBaseline) {
            state.regularRequestBaseline = rawResponse;
            elements.diffToggle.style.display = 'none';
        } else {
            elements.diffToggle.style.display = 'flex';
            if (elements.showDiffCheckbox && elements.showDiffCheckbox.checked) {
                elements.rawResponseDisplay.innerHTML = renderDiff(state.regularRequestBaseline, rawResponse);
            } else {
                elements.rawResponseDisplay.innerHTML = highlightHTTP(rawResponse);
            }
        }

        // If diff not enabled or first response
        if (!elements.showDiffCheckbox || !elements.showDiffCheckbox.checked || !state.regularRequestBaseline || state.regularRequestBaseline === rawResponse) {
            elements.rawResponseDisplay.innerHTML = highlightHTTP(rawResponse);
        }

        elements.rawResponseDisplay.style.display = 'block';
        elements.rawResponseDisplay.style.visibility = 'visible';

        // Update other tabs as well
        elements.rawResponseText.textContent = rawResponse;
        elements.hexResponseDisplay.textContent = generateHexView(rawResponse);
        elements.jsonResponseDisplay.innerHTML = '';
        elements.jsonResponseDisplay.appendChild(generateJsonView(rawResponse));

    } catch (err) {
        console.error('Request Failed:', err);

        // Check for missing permissions if it's a fetch error
        if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
            chrome.permissions.contains({
                permissions: ['webRequest'],
                origins: ['<all_urls>']
            }, (hasPermissions) => {
                if (!hasPermissions) {
                    elements.resStatus.textContent = 'Permission Required';
                    elements.resStatus.className = 'status-badge status-4xx';
                    elements.resTime.textContent = '0ms';

                    elements.rawResponseDisplay.innerHTML = `
                        <div style="padding: 20px; text-align: center;">
                            <h3 style="margin-top: 0;">Permission Required</h3>
                            <p>To replay requests to any domain, Rep+ needs the <code>&lt;all_urls&gt;</code> permission.</p>
                            <p>This permission is optional and only requested when you use this feature.</p>
                            <button id="grant-perm-btn" class="primary-btn" style="margin-top: 10px;">Grant Permission & Retry</button>
                        </div>
                    `;
                    elements.rawResponseDisplay.style.display = 'block';

                    document.getElementById('grant-perm-btn').addEventListener('click', () => {
                        chrome.permissions.request({
                            permissions: ['webRequest'],
                            origins: ['<all_urls>']
                        }, (granted) => {
                            if (granted) {
                                handleSendRequest();
                            } else {
                                elements.rawResponseDisplay.innerHTML += '<p style="color: var(--error-color); margin-top: 10px;">Permission denied.</p>';
                            }
                        });
                    });
                    return;
                }

                // If permissions exist but still failed
                showError(err);
            });
        } else {
            showError(err);
        }
    }
}

function showError(err) {
    elements.resStatus.textContent = 'Error';
    elements.resStatus.className = 'status-badge status-5xx';
    elements.resTime.textContent = '0ms';
    elements.rawResponseDisplay.textContent = `Error: ${err.message}\n\nStack: ${err.stack}`;
    elements.rawResponseDisplay.style.display = 'block';
}
