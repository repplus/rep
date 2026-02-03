// Main UI Module - Initialization and re-exports
import { state } from '../core/state.js';
import { getHostname, highlightHTTP } from '../core/utils/network.js';
import { events, EVENT_NAMES } from '../core/events.js';
import { selectRequest, switchRequestView, switchResponseView, toggleLayout, initPreviewControls, updatePreview } from './request-editor.js';
import { generateHexView } from './hex-view.js';
import { generateJsonView } from './json-view.js';

// DOM Elements (initialized in initUI)
export const elements = {};

export function initUI() {
    elements.requestList = document.getElementById('request-list');
    elements.searchBar = document.getElementById('search-bar');
    elements.regexToggle = document.getElementById('regex-toggle');
    elements.rawRequestInput = document.getElementById('raw-request-input');
    elements.useHttpsCheckbox = document.getElementById('use-https');
    elements.sendBtn = document.getElementById('send-btn');
    elements.sendBtnLocal = document.getElementById('send-btn-local');
    elements.rawResponseDisplay = document.getElementById('raw-response-display');
    elements.rawResponseText = document.getElementById('raw-response-text');
    elements.hexResponseDisplay = document.getElementById('res-hex-display');
    elements.jsonResponseDisplay = document.getElementById('res-json-display');
    elements.resStatus = document.getElementById('res-status');
    elements.resTime = document.getElementById('res-time');
    elements.resSize = document.getElementById('res-size');
    elements.undoBtn = document.getElementById('undo-btn');
    elements.redoBtn = document.getElementById('redo-btn');
    elements.copyReqBtn = document.getElementById('copy-req-btn');
    elements.copyResBtn = document.getElementById('copy-res-btn');
    elements.layoutToggleBtn = document.getElementById('layout-toggle-btn');
    elements.screenshotBtn = document.getElementById('screenshot-btn');
    elements.multiTabBtn = document.getElementById('multi-tab-btn');
    elements.contextMenu = document.getElementById('context-menu');
    elements.removeDuplicatesBtn = document.getElementById('remove-duplicates-btn');
    elements.clearAllBtn = document.getElementById('clear-all-btn');
    elements.exportBtn = document.getElementById('export-btn');
    elements.importBtn = document.getElementById('import-btn');
    elements.importFile = document.getElementById('import-file');
    elements.diffToggle = document.querySelector('.diff-toggle');
    elements.showDiffCheckbox = document.getElementById('show-diff');
    elements.toggleGroupsBtn = document.getElementById('toggle-groups-btn');
    elements.toggleObjectsBtn = document.getElementById('toggle-objects-btn');
    elements.colorFilterBtn = document.getElementById('color-filter-btn');
    elements.toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    elements.showSidebarBtn = document.getElementById('show-sidebar-btn');
    elements.llmChatToggleBtn = document.getElementById('llm-chat-toggle-btn');
    elements.llmChatPane = document.getElementById('llm-chat-pane');
    
    // Filter elements
    elements.methodFilterBtn = document.getElementById('method-filter-btn');
    elements.methodFilterLabel = document.getElementById('method-filter-label');
    elements.methodFilterMenu = document.getElementById('method-filter-menu');
    elements.methodSelectAllBtn = document.getElementById('method-select-all');
    elements.methodClearAllBtn = document.getElementById('method-clear-all');
    
    // Block controls
    elements.blockToggleBtn = document.getElementById('block-toggle-btn');
    elements.forwardBtn = document.getElementById('forward-btn');
    elements.forwardMenu = document.getElementById('forward-menu');
    
    // Request editor elements
    elements.rawRequestTextarea = document.getElementById('raw-request-textarea');
    elements.reqViewPretty = document.getElementById('req-view-pretty');
    elements.reqViewRaw = document.getElementById('req-view-raw');
    elements.reqViewHex = document.getElementById('req-view-hex');
    elements.reqHexDisplay = document.getElementById('req-hex-display');
    elements.resViewPreview = document.getElementById('res-view-preview');
    elements.responsePreviewIframe = document.getElementById('response-preview-iframe');
    elements.previewAllowScriptsCheckbox = document.getElementById('preview-allow-scripts');
    
    // Banner elements
    elements.promoBanner = document.getElementById('promo-banner');
    elements.closeBannerBtn = document.getElementById('close-banner');

    // Function to analyze attack surface for a specific domain
    // Note: This is kept here as it's a window function used by request-list.js
    window.analyzeDomainAttackSurface = async function (domain, groupElement) {
        if (state.isAnalyzingAttackSurface) return;

        const { analyzeAttackSurface, cacheCategories } = await import('../features/attack-surface/index.js');

        // Get all requests for this domain (page group)
        const domainRequests = state.requests.filter((req, idx) => {
            const requestPageHostname = getHostname(req.pageUrl || req.request.url);
            return requestPageHostname === domain;
        });

        if (domainRequests.length === 0) {
            alert('No requests found for this domain.');
            return;
        }

        // 1. Identify Uncategorized Requests
        const uncategorizedRequests = [];
        domainRequests.forEach((req) => {
            const globalIdx = state.requests.indexOf(req);
            if (!state.attackSurfaceCategories[globalIdx]) {
                uncategorizedRequests.push({ req, globalIdx });
            }
        });

        const aiBtn = groupElement.querySelector('.group-ai-btn');

        // 2. If all categorized, just show view
        if (uncategorizedRequests.length === 0) {
            state.domainsWithAttackSurface.add(domain);
            if (aiBtn) {
                aiBtn.disabled = false;
                aiBtn.classList.add('analyzed');
                aiBtn.title = 'Show Normal View';
                aiBtn.textContent = '📋';
            }
            events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
            return;
        }

        // 3. Deduplication for new requests
        const uniqueRequestsMap = new Map(); // Signature -> { req, globalIdx }
        const signatureToGlobalIndices = new Map(); // Signature -> [globalIdx, ...]

        uncategorizedRequests.forEach(item => {
            const urlObj = new URL(item.req.request.url);
            const path = urlObj.pathname;
            const params = Array.from(urlObj.searchParams.keys()).sort().join(',');
            const signature = `${item.req.request.method} ${path} [${params}]`;

            if (!uniqueRequestsMap.has(signature)) {
                uniqueRequestsMap.set(signature, item);
            }

            if (!signatureToGlobalIndices.has(signature)) {
                signatureToGlobalIndices.set(signature, []);
            }
            signatureToGlobalIndices.get(signature).push(item.globalIdx);
        });

        const requestsToAnalyze = Array.from(uniqueRequestsMap.values()).map(item => item.req);

        const confirmed = confirm(
            `Analyze ${requestsToAnalyze.length} new unique requests (from ${uncategorizedRequests.length} total new)?\n\n` +
            `Existing categorized requests: ${domainRequests.length - uncategorizedRequests.length}\n` +
            `Estimated tokens: ~${requestsToAnalyze.length * 100}`
        );

        if (!confirmed) return;

        state.isAnalyzingAttackSurface = true;

        // Show loading on AI button
        if (aiBtn) {
            aiBtn.disabled = true;
            aiBtn.innerHTML = '<span class="ai-thinking">🧠</span>';
            aiBtn.title = 'AI is thinking...';
        }

        try {
            await analyzeAttackSurface(requestsToAnalyze, (progress) => {
                if (progress.status === 'complete') {
                    // Map results back to all matching requests
                    Object.entries(progress.categories).forEach(([analyzedIdx, categoryData]) => {
                        const representativeItem = Array.from(uniqueRequestsMap.values())[parseInt(analyzedIdx)];

                        // Reconstruct signature to find all matching requests
                        const urlObj = new URL(representativeItem.req.request.url);
                        const path = urlObj.pathname;
                        const params = Array.from(urlObj.searchParams.keys()).sort().join(',');
                        const signature = `${representativeItem.req.request.method} ${path} [${params}]`;

                        // Apply to all matching requests
                        const globalIndices = signatureToGlobalIndices.get(signature) || [];
                        globalIndices.forEach(globalIdx => {
                            state.attackSurfaceCategories[globalIdx] = categoryData;
                        });
                    });

                    cacheCategories(state.attackSurfaceCategories);
                    state.domainsWithAttackSurface.add(domain);

                    // Update AI button to "analyzed" state
                    if (aiBtn) {
                        aiBtn.disabled = false;
                        aiBtn.classList.add('analyzed');
                        aiBtn.title = 'Show Normal View';
                        aiBtn.textContent = '📋';
                    }

                    // Re-render to show attack surface view for this domain
                    events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
                }
            });
        } catch (error) {
            alert(`Analysis failed: ${error.message}`);
            // Reset button on error
            if (aiBtn) {
                aiBtn.disabled = false;
                aiBtn.textContent = '⚡';
                aiBtn.title = 'Analyze Attack Surface';
            }
        } finally {
            state.isAnalyzingAttackSurface = false;
        }
    };

    // Set up event listeners for decoupled communication
    setupEventListeners();
}

function setupEventListeners() {
    // Request selection (from request-list.js)
    events.on(EVENT_NAMES.REQUEST_SELECTED, (index) => {
        selectRequest(index);
    });

    // Request selected UI updates (from request-editor.js)
    events.on(EVENT_NAMES.UI_REQUEST_SELECTED, ({ index, rawText, useHttps }) => {
        // Highlight in list
        document.querySelectorAll('.request-item').forEach(el => el.classList.remove('selected'));
        const selectedItem = Array.from(document.querySelectorAll('.request-item')).find(el => el.dataset.index === String(index));
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        // Hide diff toggle (only for bulk replay)
        if (elements.diffToggle) {
            elements.diffToggle.style.display = 'none';
        }

        // Update request input
        if (elements.rawRequestInput) {
            elements.rawRequestInput.innerHTML = rawText;
        }
        
        // Also update raw textarea if it exists (for raw view)
        if (elements.rawRequestTextarea) {
            // Extract plain text from HTML (remove highlighting)
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = rawText;
            elements.rawRequestTextarea.value = tempDiv.textContent || tempDiv.innerText || '';
        }

        // Set HTTPS toggle
        if (elements.useHttpsCheckbox) {
            elements.useHttpsCheckbox.checked = useHttps;
        }

        // Clear Response (only if not being restored from saved state)
        // Response restoration is handled in request-editor.js restoreEditorState()
        // We check if response was restored by checking if state.currentResponse exists
        // If it doesn't exist, clear the UI (this happens for new requests without saved state)
        if (!state.currentResponse) {
            if (elements.rawResponseDisplay) {
                elements.rawResponseDisplay.textContent = '';
            }
            if (elements.resStatus) {
                elements.resStatus.textContent = '';
                elements.resStatus.className = 'status-badge';
            }
            if (elements.resTime) {
                elements.resTime.textContent = '';
            }
            if (elements.resSize) {
                elements.resSize.textContent = '';
            }
        }

        // Update history buttons
        events.emit(EVENT_NAMES.UI_UPDATE_HISTORY_BUTTONS);
    });

    // Update request content
    events.on(EVENT_NAMES.UI_UPDATE_REQUEST_CONTENT, ({ text, highlighted }) => {
        if (elements.rawRequestInput) {
            elements.rawRequestInput.innerText = text;
            elements.rawRequestInput.innerHTML = highlighted;
        }
    });

    // Update response view (captured or replayed)
    events.on(EVENT_NAMES.UI_UPDATE_RESPONSE_VIEW, ({ status, statusClass, time, size, content }) => {
        if (elements.resStatus) {
            elements.resStatus.textContent = status || '';
            elements.resStatus.className = statusClass || 'status-badge';
        }
        if (elements.resTime) {
            elements.resTime.textContent = time || '';
        }
        if (elements.resSize) {
            elements.resSize.textContent = size || '';
        }
        if (elements.rawResponseDisplay) {
            elements.rawResponseDisplay.innerHTML = highlightHTTP(content || '');
            elements.rawResponseDisplay.style.display = 'block';
            elements.rawResponseDisplay.style.visibility = 'visible';
        }
        if (elements.rawResponseText)
            elements.rawResponseText.textContent = content;
        if (elements.hexResponseDisplay)
            elements.hexResponseDisplay.textContent = generateHexView(content);
        if (elements.jsonResponseDisplay) {
            elements.jsonResponseDisplay.innerHTML = '';
            elements.jsonResponseDisplay.appendChild(generateJsonView(content));
        }

        // Update preview if it's currently active
        if (elements.resViewPreview && elements.resViewPreview.style.display !== 'none' && elements.resViewPreview.classList.contains('active')) {
            updatePreview(content || '');
        }
    });

    // Get request content
    events.on(EVENT_NAMES.UI_GET_REQUEST_CONTENT, (callback) => {
        if (elements.rawRequestInput && typeof callback === 'function') {
            callback(elements.rawRequestInput.innerText);
        }
    });

    // Regex toggle error state
    events.on('ui:regex-error', ({ hasError, message }) => {
        if (elements.regexToggle) {
            if (hasError) {
                elements.regexToggle.classList.add('error');
                elements.regexToggle.title = message;
            } else {
                elements.regexToggle.classList.remove('error');
                elements.regexToggle.title = message;
            }
        }
    });

    // Request filtered event (from request-actions.js)
    events.on('request:filtered', ({ preserveScroll, scrollTop } = {}) => {
        if (preserveScroll && scrollTop !== undefined) {
            const requestList = document.getElementById('request-list');
            const savedScroll = scrollTop;
            events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
            if (requestList) {
                requestList.scrollTop = savedScroll;
            }
        } else {
            events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
        }
    });

    // Request star updated (from request-actions.js)
    events.on('request:star-updated', ({ index, starred }) => {
        const requestList = document.getElementById('request-list');
        if (requestList) {
            const item = requestList.querySelector(`.request-item[data-index="${index}"]`);
            if (item) {
                const starBtn = item.querySelector('.star-btn');
                if (starBtn) {
                    starBtn.classList.toggle('active', starred);
                    starBtn.innerHTML = starred ? 
                        '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' :
                        '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.01 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>';
                    starBtn.title = starred ? 'Unstar' : 'Star request';
                }
                item.classList.toggle('starred', starred);
            }
        }
    });

    // Restore grouped view (from request-actions.js)
    events.on('request:restore-grouped-view', () => {
        state.requests.forEach((request, index) => {
            events.emit(EVENT_NAMES.REQUEST_RENDERED, { request, index });
        });
    });

    // Clear all UI (from ui-utils.js)
    events.on(EVENT_NAMES.UI_CLEAR_ALL, () => {
        if (elements.rawRequestInput) {
            elements.rawRequestInput.textContent = '';
        }
        if (elements.rawResponseDisplay) {
            elements.rawResponseDisplay.textContent = '';
        }
        if (elements.resStatus) {
            elements.resStatus.textContent = '';
            elements.resStatus.className = 'status-badge';
        }
        if (elements.resTime) {
            elements.resTime.textContent = '';
        }
        if (elements.resSize) {
            elements.resSize.textContent = '';
        }
    });
}

// Re-export everything from split modules
export { renderRequestList, renderRequestItem, filterRequests, createRequestItemElement, createPageGroup, createDomainGroup } from './request-list.js';
export { selectRequest, switchRequestView, switchResponseView, toggleLayout, initPreviewControls, setupRawRequestEditor, initLayoutToggle } from './request-editor.js';
export { toggleStar, toggleGroupStar, setTimelineFilter, toggleAllGroups, getFilteredRequests, setRequestColor } from './request-actions.js';
export { updateHistoryButtons, clearAllRequestsUI, setupResizeHandle, toggleAllObjects, setupSidebarResize, setupContextMenu, setupUndoRedo, captureScreenshot, exportRequests, importRequests } from './ui-utils.js';
