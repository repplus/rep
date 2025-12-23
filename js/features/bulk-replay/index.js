// Bulk Replay Logic
import { state } from '../../core/state.js';
import { elements } from '../../ui/main-ui.js';
import { generateAttackRequests } from './engine.js';
import { formatBytes } from '../../core/utils/format.js';
import { highlightHTTP } from '../../core/utils/network.js';
import { renderDiff } from '../../core/utils/misc.js';
import { escapeHtml } from '../../core/utils/dom.js';

export function setupBulkReplay() {
    const bulkReplayBtn = document.getElementById('bulk-replay-btn');
    const bulkConfigModal = document.getElementById('bulk-config-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    const startAttackBtn = document.getElementById('start-attack-btn');
    const bulkReplayPane = document.getElementById('bulk-replay-pane');
    const bulkResultsTable = document.getElementById('bulk-results-table').querySelector('tbody');
    const bulkProgressBar = document.getElementById('bulk-progress-bar');
    const bulkProgressText = document.getElementById('bulk-progress-text');
    const bulkStopBtn = document.getElementById('bulk-stop-btn');
    const bulkCloseBtn = document.getElementById('bulk-close-btn');
    const verticalResizeHandle = document.querySelector('.vertical-resize-handle');

    // We use elements.rawRequestInput from ui.js

    // Helper to check for payload markers
    function checkPayloadMarkers() {
        if (!bulkReplayBtn || !elements.rawRequestInput) return;

        const content = elements.rawRequestInput.innerText;
        const hasMarkers = /§[\s\S]*?§/.test(content);

        if (hasMarkers) {
            bulkReplayBtn.disabled = false;
            bulkReplayBtn.classList.add('ready');
        } else {
            bulkReplayBtn.disabled = true;
            bulkReplayBtn.classList.remove('ready');
        }
    }

    // Initial check
    checkPayloadMarkers();

    // Listen for changes in input
    if (elements.rawRequestInput) {
        elements.rawRequestInput.addEventListener('input', checkPayloadMarkers);
        elements.rawRequestInput.addEventListener('keyup', checkPayloadMarkers);
        elements.rawRequestInput.addEventListener('click', checkPayloadMarkers);

        const observer = new MutationObserver(checkPayloadMarkers);
        observer.observe(elements.rawRequestInput, { childList: true, subtree: true, characterData: true });
    }

    // Bulk Replay Button
    if (bulkReplayBtn) {
        bulkReplayBtn.addEventListener('click', () => {
            if (bulkReplayBtn.disabled) return;

            const content = elements.rawRequestInput.innerText;
            const matches = content.match(/§[\s\S]*?§/g);
            const count = matches ? matches.length : 0;
            document.getElementById('payload-count').textContent = count;

            if (!matches || count === 0) {
                alert('No payload positions found. Mark parameters with § to enable Bulk Replay.');
                return;
            }

            // Initialize position configs
            state.positionConfigs = matches.map((match, index) => ({
                index,
                originalValue: match.replace(/§/g, ''),
                type: 'simple-list',
                list: '',
                numbers: { from: 1, to: 10, step: 1 }
            }));

            populatePositionsContainer(matches);

            state.currentAttackType = 'sniper';
            document.getElementById('attack-type').value = 'sniper';
            updateAttackTypeUI('sniper');

            bulkConfigModal.style.display = 'block';
        });
    }

    function populatePositionsContainer(matches) {
        const container = document.getElementById('positions-container');
        container.innerHTML = '';

        matches.forEach((match, index) => {
            const cleanValue = match.replace(/§/g, '');
            const card = document.createElement('div');
            card.className = 'position-card';
            card.dataset.index = index;
            card.innerHTML = `
                <div class="position-card-header">
                    <span class="position-title">Position ${index + 1}</span>
                    <span class="position-value">${cleanValue.substring(0, 30)}${cleanValue.length > 30 ? '...' : ''}</span>
                </div>
                <div class="form-group">
                    <label>Payload Type</label>
                    <select class="payload-type-select form-control" data-index="${index}">
                        <option value="simple-list">Simple List</option>
                        <option value="numbers">Numbers</option>
                    </select>
                </div>
                <div class="payload-options-simple-list">
                    <div class="form-group">
                        <label>Payloads (one per line)</label>
                        <textarea class="payload-list-input form-control" rows="5" data-index="${index}" placeholder="admin&#10;user&#10;guest"></textarea>
                    </div>
                </div>
                <div class="payload-options-numbers" style="display: none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>From</label>
                            <input type="number" class="num-from-input form-control" data-index="${index}" value="1">
                        </div>
                        <div class="form-group">
                            <label>To</label>
                            <input type="number" class="num-to-input form-control" data-index="${index}" value="10">
                        </div>
                        <div class="form-group">
                            <label>Step</label>
                            <input type="number" class="num-step-input form-control" data-index="${index}" value="1">
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(card);

            const typeSelect = card.querySelector('.payload-type-select');
            typeSelect.addEventListener('change', (e) => {
                const card = e.target.closest('.position-card');
                const simpleList = card.querySelector('.payload-options-simple-list');
                const numbers = card.querySelector('.payload-options-numbers');
                if (e.target.value === 'simple-list') {
                    simpleList.style.display = 'block';
                    numbers.style.display = 'none';
                } else {
                    simpleList.style.display = 'none';
                    numbers.style.display = 'block';
                }
            });
        });
    }

    const attackTypeSelect = document.getElementById('attack-type');
    if (attackTypeSelect) {
        attackTypeSelect.addEventListener('change', (e) => {
            state.currentAttackType = e.target.value;
            updateAttackTypeUI(e.target.value);
        });
    }

    function updateAttackTypeUI(attackType) {
        const positionsContainer = document.getElementById('positions-container');
        const batteringRamConfig = document.getElementById('battering-ram-config');
        const helpText = document.getElementById('attack-type-help');

        const helpTexts = {
            'sniper': 'Sniper: Tests each position independently with its own payloads. Others remain unchanged.',
            'battering-ram': 'Battering Ram: All positions receive the same payload value from a shared list.',
            'pitchfork': 'Pitchfork: Zips payloads across positions (index-wise). Stops at shortest list.',
            'cluster-bomb': 'Cluster Bomb: Tests all combinations of payloads across positions (Cartesian product).'
        };
        helpText.textContent = helpTexts[attackType] || '';

        if (attackType === 'battering-ram') {
            positionsContainer.style.display = 'none';
            batteringRamConfig.style.display = 'block';
        } else {
            positionsContainer.style.display = 'block';
            batteringRamConfig.style.display = 'none';
        }
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            bulkConfigModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === bulkConfigModal) {
            bulkConfigModal.style.display = 'none';
        }
    });

    const batteringRamTypeSelect = document.querySelector('#battering-ram-config .payload-type-select');
    if (batteringRamTypeSelect) {
        batteringRamTypeSelect.addEventListener('change', (e) => {
            const container = document.getElementById('battering-ram-config');
            const simpleList = container.querySelector('.payload-options-simple-list');
            const numbers = container.querySelector('.payload-options-numbers');
            if (e.target.value === 'simple-list') {
                simpleList.style.display = 'block';
                numbers.style.display = 'none';
            } else {
                simpleList.style.display = 'none';
                numbers.style.display = 'block';
            }
        });
    }

    if (startAttackBtn) {
        startAttackBtn.addEventListener('click', () => {
            startBulkReplay();
        });
    }

    if (bulkStopBtn) {
        bulkStopBtn.addEventListener('click', () => {
            if (bulkStopBtn.dataset.state === 'paused') {
                state.shouldPauseBulk = false;
                bulkStopBtn.dataset.state = 'running';
                bulkStopBtn.title = 'Pause Attack';
                bulkStopBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor" />
                    </svg>
                `;
            } else {
                state.shouldPauseBulk = true;
                bulkStopBtn.dataset.state = 'paused';
                bulkStopBtn.title = 'Resume Attack';
                bulkStopBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M8 5v14l11-7z" fill="currentColor" />
                    </svg>
                `;
            }
        });
    }

    if (bulkCloseBtn) {
        bulkCloseBtn.addEventListener('click', () => {
            bulkReplayPane.style.display = 'none';
            verticalResizeHandle.style.display = 'none';
            state.shouldStopBulk = true;
        });
    }

    // Vertical Resize Handle
    let isVerticalResizing = false;
    if (verticalResizeHandle) {
        verticalResizeHandle.addEventListener('mousedown', (e) => {
            isVerticalResizing = true;
            document.body.style.cursor = 'row-resize';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isVerticalResizing) return;
            const containerHeight = document.querySelector('.main-content').offsetHeight;
            const newHeight = containerHeight - e.clientY;
            if (newHeight > 100 && newHeight < containerHeight - 100) {
                bulkReplayPane.style.height = `${newHeight}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isVerticalResizing = false;
            document.body.style.cursor = 'default';
        });
    }

    // Context Menu: Mark Payload
    const contextMenu = document.getElementById('context-menu');
    const markPayloadItem = contextMenu.querySelector('[data-action="mark-payload"]');
    if (markPayloadItem) {
        markPayloadItem.addEventListener('click', () => {
            // Use the selection information stored by `setupContextMenu` in `ui-utils.js`
            const targetType = contextMenu.dataset.target;
            const editor = targetType === 'request' ? elements.rawRequestInput : elements.rawResponseDisplay;

            if (!editor) {
                contextMenu.classList.remove('show');
                return;
            }

            const rawSelected = contextMenu.dataset.selectedText || '';
            const selectedText = rawSelected.trim();

            if (!selectedText) {
                contextMenu.classList.remove('show');
                return;
            }

            const editorText = editor.textContent || editor.innerText || '';
            let startIndex = editorText.indexOf(selectedText);

            // As a small safeguard, if the trimmed text isn't found, try the raw text
            if (startIndex === -1 && rawSelected) {
                startIndex = editorText.indexOf(rawSelected);
            }

            if (startIndex === -1) {
                // If we can't reliably find the text, do nothing rather than
                // inserting at an incorrect position (like the start of the request)
                contextMenu.classList.remove('show');
                return;
            }

            const lengthToUse = startIndex === -1 ? 0 : selectedText.length;
            const before = editorText.substring(0, startIndex);
            const middle = editorText.substring(startIndex, startIndex + lengthToUse);
            const after = editorText.substring(startIndex + lengthToUse);
            const newText = `${before}§${middle}§${after}`;

            editor.textContent = newText;

            // Re-apply HTTP highlighting and notify undo system for the request editor
            if (editor === elements.rawRequestInput) {
                const currentContent = editor.innerText || editor.textContent;
                editor.innerHTML = highlightHTTP(currentContent);
                // Trigger input so the undo stack captures this change
                const inputEvent = new Event('input', { bubbles: true });
                editor.dispatchEvent(inputEvent);
            }

            contextMenu.classList.remove('show');
        });
    }

    async function startBulkReplay() {
        const template = elements.rawRequestInput.innerText;

        if (state.currentAttackType === 'battering-ram') {
            const container = document.getElementById('battering-ram-config');
            const type = container.querySelector('.payload-type-select').value;
            const sharedConfig = {
                type,
                list: type === 'simple-list' ? container.querySelector('.payload-list-input').value : '',
                numbers: type === 'numbers' ? {
                    from: parseInt(container.querySelector('.num-from-input').value),
                    to: parseInt(container.querySelector('.num-to-input').value),
                    step: parseInt(container.querySelector('.num-step-input').value)
                } : { from: 1, to: 10, step: 1 }
            };

            state.positionConfigs.forEach(config => {
                config.type = sharedConfig.type;
                config.list = sharedConfig.list;
                config.numbers = sharedConfig.numbers;
            });
        } else {
            const cards = document.querySelectorAll('.position-card');
            cards.forEach((card, index) => {
                const type = card.querySelector('.payload-type-select').value;
                state.positionConfigs[index].type = type;
                state.positionConfigs[index].list = type === 'simple-list' ?
                    card.querySelector('.payload-list-input').value : '';
                state.positionConfigs[index].numbers = type === 'numbers' ? {
                    from: parseInt(card.querySelector('.num-from-input').value),
                    to: parseInt(card.querySelector('.num-to-input').value),
                    step: parseInt(card.querySelector('.num-step-input').value)
                } : { from: 1, to: 10, step: 1 };
            });
        }

        let attackRequests;
        try {
            attackRequests = generateAttackRequests(state.currentAttackType, state.positionConfigs, template);
        } catch (error) {
            alert(`Error generating attack requests: ${error.message}`);
            return;
        }

        if (attackRequests.length === 0) {
            alert('No requests generated. Please check your payload configuration.');
            return;
        }

        if (state.currentAttackType === 'cluster-bomb' && attackRequests.length > 1000) {
            if (!confirm(`This will generate ${attackRequests.length} requests. Continue?`)) {
                return;
            }
        }

        bulkConfigModal.style.display = 'none';

        let baselineResponse = elements.rawResponseDisplay.textContent || '';
        if (baselineResponse.trim()) {
            elements.diffToggle.style.display = 'flex';
        }

        bulkReplayPane.style.display = 'flex';
        verticalResizeHandle.style.display = 'block';
        bulkResultsTable.innerHTML = '';
        state.shouldStopBulk = false;
        state.shouldPauseBulk = false;

        if (bulkStopBtn) {
            bulkStopBtn.dataset.state = 'running';
            bulkStopBtn.title = 'Pause Attack';
            bulkStopBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor" />
                </svg>
            `;
        }

        const bulkResults = [];
        const useHttps = document.getElementById('use-https').checked;
        const scheme = useHttps ? 'https' : 'http';

        let completed = 0;
        const total = attackRequests.length;

        for (let i = 0; i < total; i++) {
            if (state.shouldStopBulk) break;

            while (state.shouldPauseBulk) {
                await new Promise(resolve => setTimeout(resolve, 100));
                if (state.shouldStopBulk) break;
            }

            if (state.shouldStopBulk) break;

            const { requestContent } = attackRequests[i];

            const row = document.createElement('tr');
            row.dataset.index = i;
            row.innerHTML = `
                <td>${i + 1}</td>
                <td>${escapeHtml(attackRequests[i].payloads.join(', '))}</td>
                <td class="status-cell">Sending...</td>
                <td class="size-cell">-</td>
                <td class="time-cell">-</td>
            `;
            bulkResultsTable.appendChild(row);
            row.scrollIntoView({ behavior: 'smooth', block: 'end' });

            row.addEventListener('click', () => {
                bulkResultsTable.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
                row.classList.add('selected');

                const result = bulkResults[i];
                if (result) {
                    elements.rawRequestInput.innerText = result.requestContent;

                    elements.resStatus.textContent = result.statusText ? `${result.status} ${result.statusText}` : result.status;
                    elements.resStatus.className = 'status-badge';
                    if (result.status >= 200 && result.status < 300) elements.resStatus.classList.add('status-2xx');
                    else if (result.status >= 400 && result.status < 500) elements.resStatus.classList.add('status-4xx');
                    else if (result.status >= 500) elements.resStatus.classList.add('status-5xx');

                    elements.resTime.textContent = result.duration;
                    elements.resSize.textContent = formatBytes(result.size);

                    if (result.error) {
                        elements.rawResponseDisplay.textContent = result.error;
                    } else {
                        let rawResponse = `HTTP/1.1 ${result.status} ${result.statusText}\n`;
                        if (result.headers) {
                            result.headers.forEach((val, key) => {
                                rawResponse += `${key}: ${val}\n`;
                            });
                        }
                        rawResponse += '\n';

                        try {
                            const json = JSON.parse(result.responseBody);
                            rawResponse += JSON.stringify(json, null, 2);
                        } catch (e) {
                            rawResponse += result.responseBody;
                        }

                        if (elements.showDiffCheckbox && elements.showDiffCheckbox.checked && baselineResponse.trim() && typeof Diff !== 'undefined') {
                            elements.rawResponseDisplay.innerHTML = renderDiff(baselineResponse, rawResponse);
                        } else {
                            elements.rawResponseDisplay.innerHTML = highlightHTTP(rawResponse);
                        }
                    }
                }
            });

            const startTime = performance.now();

            try {
                // We duplicate parse logic here or import it. 
                // Since this is inside the loop and needs to be fast, and slightly different (no UI update), we can keep it or import `parseRequest` from network.js
                // But `parseRequest` in network.js is designed for the main editor.
                // Let's just use fetch directly as in original code for now to minimize risk.

                const lines = requestContent.split('\n');
                if (lines.length === 0) throw new Error('No content');

                const requestLine = lines[0].trim();
                const reqLineParts = requestLine.split(' ');
                if (reqLineParts.length < 2) throw new Error('Invalid Request Line');

                const method = reqLineParts[0].toUpperCase();
                const path = reqLineParts[1];

                let headers = {};
                let bodyLines = [];
                let isBody = false;
                let host = '';

                for (let j = 1; j < lines.length; j++) {
                    const line = lines[j];
                    if (!isBody) {
                        if (line.trim() === '') {
                            isBody = true;
                            continue;
                        }
                        if (line.trim().startsWith(':')) continue;

                        const colonIndex = line.indexOf(':');
                        if (colonIndex > 0) {
                            const key = line.substring(0, colonIndex).trim();
                            const value = line.substring(colonIndex + 1).trim();
                            if (key && value) {
                                if (key.toLowerCase() === 'host') host = value;
                                else headers[key] = value;
                            }
                        }
                    } else {
                        bodyLines.push(line);
                    }
                }

                if (!host) throw new Error('Host header missing');

                let url = path;
                if (!path.startsWith('http')) {
                    url = `${scheme}://${host}${path}`;
                }

                const body = bodyLines.join('\n');

                const options = {
                    method: method,
                    headers: headers
                };

                if (method !== 'GET' && method !== 'HEAD') {
                    options.body = body;
                }

                const response = await fetch(url, options);
                const endTime = performance.now();
                const responseBody = await response.text();
                const responseSize = new TextEncoder().encode(responseBody).length;
                const duration = `${(endTime - startTime).toFixed(0)}ms`;

                bulkResults[i] = {
                    requestContent: requestContent,
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    responseBody: responseBody,
                    size: responseSize,
                    duration: duration,
                    error: null
                };

                row.querySelector('.status-cell').textContent = `${response.status} ${response.statusText}`;
                row.querySelector('.size-cell').textContent = formatBytes(responseSize);
                row.querySelector('.time-cell').textContent = duration;

            } catch (error) {
                const endTime = performance.now();
                console.error(error);

                bulkResults[i] = {
                    requestContent: requestContent,
                    status: 'Error',
                    statusText: '',
                    headers: null,
                    responseBody: '',
                    size: 0,
                    duration: `${(endTime - startTime).toFixed(0)}ms`,
                    error: error.message
                };

                row.querySelector('.status-cell').textContent = 'Error';
                row.querySelector('.status-cell').title = error.message;
            }

            completed++;
            const progress = (completed / total) * 100;
            bulkProgressBar.style.setProperty('--progress', `${progress}%`);
            bulkProgressText.textContent = `${completed}/${total}`;
        }
    }
}
