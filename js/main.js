// Main Entry Point
import { state, actions } from './core/state.js';
import { events, EVENT_NAMES } from './core/events.js';
import {
    initUI, elements,
    clearAllRequestsUI, setupResizeHandle, setupSidebarResize, setupContextMenu,
    setupUndoRedo, captureScreenshot, exportRequests, importRequests, toggleAllGroups,
    toggleAllObjects
} from './ui/main-ui.js';
import { setupNetworkListener } from './network/capture.js';
import { setupBulkReplay } from './features/bulk-replay/index.js';
import { copyToClipboard } from './core/utils/dom.js';
import { renderDiff } from './core/utils/misc.js';
import { highlightHTTP, getHostname } from './core/utils/network.js';

// Feature Modules
import { initTheme } from './ui/theme.js';
import { initMultiTabCapture } from './network/multi-tab.js';
import { initExtractorUI } from './features/extractors/index.js';
import { setupAIFeatures } from './features/ai/index.js';
import { setupLLMChat } from './features/llm-chat/index.js';
import { handleSendRequest } from './network/handler.js';
import { getUrlMappings, saveUrlMappings } from './network/url-mapping.js';
import { initSearch } from './search/index.js';

// UI Modules
import { setupBlockControls } from './ui/block-controls.js';
import { setupFilters } from './ui/filters.js';
import { setupSidebar } from './ui/sidebar.js';
import { setupViewTabs } from './ui/view-tabs.js';
import { setupRawRequestEditor, initLayoutToggle, initPreviewControls } from './ui/request-editor.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI Elements
    initUI();

    // Ensure all modals are closed by default
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });

    // Initialize Features
    initTheme();
    initMultiTabCapture();
    initExtractorUI();
    setupBulkReplay();
    setupAIFeatures(elements);
    setupLLMChat(elements);
    initSearch();

    // Promotional Banner
    if (elements.promoBanner && elements.closeBannerBtn) {
        // Check if banner was previously dismissed
        const bannerDismissed = localStorage.getItem('repPlusBannerDismissed');
        if (bannerDismissed === 'true') {
            elements.promoBanner.classList.add('hidden');
        }

        // Handle banner dismissal
        elements.closeBannerBtn.addEventListener('click', () => {
            elements.promoBanner.classList.add('hidden');
            localStorage.setItem('repPlusBannerDismissed', 'true');
        });
    }

    // Setup Network Listener (Current Tab)
    const processCapturedRequest = (request) => {
        // Auto-star if group is starred
        const pageHostname = getHostname(request.pageUrl || request.request.url);
        const requestHostname = getHostname(request.request.url);

        if (state.starredPages.has(pageHostname)) {
            // Only auto-star if it's a first-party request
            if (pageHostname === requestHostname) {
                request.starred = true;
            }
        }

        if (state.starredDomains.has(requestHostname)) {
            request.starred = true;
        }

        // Use action to add request (automatically emits events)
        const index = actions.request.add(request);
    };

    setupNetworkListener((request) => {
        if (state.blockRequests) {
            const hasActiveList = state.requests.length > 0;
            const hasQueued = state.blockedQueue.length > 0;
            if (!hasActiveList && !hasQueued) {
                // Show the first blocked request immediately so the user can step through
                processCapturedRequest(request);
            } else {
                state.blockedQueue.push(request);
                // Emit event to update block buttons
                events.emit('block-queue:updated');
            }
            return;
        }
        processCapturedRequest(request);
    });

    // Setup UI Components
    setupResizeHandle();
    setupSidebarResize();
    setupContextMenu();
    setupUndoRedo();

    // Setup UI Features
    setupBlockControls(processCapturedRequest);
    setupFilters();
    setupSidebar();
    setupViewTabs();
    initPreviewControls();
    setupRawRequestEditor(elements.rawRequestInput, elements.sendBtn);
    initLayoutToggle(elements.layoutToggleBtn);

    // Send Request
    if (elements.sendBtn) {
        elements.sendBtn.addEventListener('click', handleSendRequest);
    }
    if (elements.sendBtnLocal) {
        elements.sendBtnLocal.addEventListener('click', () => handleSendRequest({ useUrlMapping: true }));
    }

    // Remove Duplicates Toggle
    if (elements.removeDuplicatesBtn) {
        // Load saved preference (default: true/enabled)
        const removeDuplicatesEnabled = localStorage.getItem('rep_remove_duplicates') !== 'false';
        updateRemoveDuplicatesButton(removeDuplicatesEnabled);
        
        elements.removeDuplicatesBtn.addEventListener('click', () => {
            const currentState = localStorage.getItem('rep_remove_duplicates') !== 'false';
            const newState = !currentState;
            
            localStorage.setItem('rep_remove_duplicates', newState.toString());
            updateRemoveDuplicatesButton(newState);
            
            // If enabling, remove existing duplicates
            if (newState) {
                const removedCount = actions.request.removeDuplicates();
                if (removedCount > 0) {
                    console.log(`Removed ${removedCount} duplicate request${removedCount !== 1 ? 's' : ''}`);
                } else {
                    console.log('No duplicates found to remove');
                }
            }
        });
    }
    
    function updateRemoveDuplicatesButton(enabled) {
        if (!elements.removeDuplicatesBtn) return;
        
        if (enabled) {
            elements.removeDuplicatesBtn.classList.add('active');
            elements.removeDuplicatesBtn.title = 'Remove duplicate requests (enabled)';
        } else {
            elements.removeDuplicatesBtn.classList.remove('active');
            elements.removeDuplicatesBtn.title = 'Remove duplicate requests (disabled)';
        }
    }

    // Clear All
    if (elements.clearAllBtn) {
        elements.clearAllBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all requests?')) {
                clearAllRequestsUI();
            }
        });
    }

    // Toggle Groups
    if (elements.toggleGroupsBtn) {
        elements.toggleGroupsBtn.addEventListener('click', toggleAllGroups);
    }

    // Toggle Objects (for JSON responses)
    if (elements.toggleObjectsBtn) {
        elements.toggleObjectsBtn.addEventListener('click', toggleAllObjects);
    }

    // More Menu Toggle
    const moreMenuBtn = document.getElementById('more-menu-btn');
    const moreMenu = document.getElementById('more-menu');
    if (moreMenuBtn && moreMenu) {
        moreMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu.classList.toggle('hidden');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!moreMenu.contains(e.target) && e.target !== moreMenuBtn) {
                moreMenu.classList.add('hidden');
            }
        });
    }

    // Export/Import (now in more menu)
    if (elements.exportBtn) elements.exportBtn.addEventListener('click', exportRequests);
    if (elements.importBtn) elements.importBtn.addEventListener('click', () => elements.importFile.click());
    if (elements.importFile) {
        elements.importFile.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                importRequests(e.target.files[0]);
                e.target.value = ''; // Reset
            }
        });
    }
    
    // Close more menu after clicking an item
    if (moreMenu) {
        moreMenu.addEventListener('click', (e) => {
            if (e.target.closest('.more-menu-item')) {
                setTimeout(() => {
                    moreMenu.classList.add('hidden');
                }, 100);
            }
        });
    }

    // URL Mapping
    const urlMappingBtn = document.getElementById('url-mapping-btn');
    const urlMappingModal = document.getElementById('url-mapping-modal');
    const urlMappingList = document.getElementById('url-mapping-list');
    const addUrlMappingBtn = document.getElementById('add-url-mapping-btn');
    const saveUrlMappingBtn = document.getElementById('save-url-mapping-btn');
    const urlMappingBulkInput = document.getElementById('url-mapping-bulk-input');
    const applyUrlMappingBulkBtn = document.getElementById('apply-url-mapping-bulk-btn');

    function createUrlMappingRow(mapping = { from: '', to: '' }) {
        const row = document.createElement('div');
        row.className = 'url-mapping-row';
        row.innerHTML = `
            <input type="text" class="form-control url-mapping-from" placeholder="From (prefix)">
            <span class="url-mapping-arrow">→</span>
            <input type="text" class="form-control url-mapping-to" placeholder="To (prefix)">
            <button type="button" class="icon-btn url-mapping-remove" title="Remove">×</button>
        `;

        const fromInput = row.querySelector('.url-mapping-from');
        const toInput = row.querySelector('.url-mapping-to');
        const removeBtn = row.querySelector('.url-mapping-remove');

        if (fromInput) fromInput.value = mapping.from || '';
        if (toInput) toInput.value = mapping.to || '';

        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                row.remove();
            });
        }

        return row;
    }

    function loadUrlMappingsIntoModal() {
        if (!urlMappingList) return;
        urlMappingList.innerHTML = '';
        const mappings = getUrlMappings();
        if (mappings.length === 0) {
            urlMappingList.appendChild(createUrlMappingRow());
            return;
        }
        mappings.forEach(mapping => {
            urlMappingList.appendChild(createUrlMappingRow(mapping));
        });
    }

    if (urlMappingBtn && urlMappingModal) {
        urlMappingBtn.addEventListener('click', () => {
            loadUrlMappingsIntoModal();
            if (urlMappingBulkInput) urlMappingBulkInput.value = '';
            urlMappingModal.style.display = 'block';
        });
    }
    
    if (urlMappingModal) {
        const urlMappingCloseBtn = urlMappingModal.querySelector('.close-modal');
        if (urlMappingCloseBtn) {
            urlMappingCloseBtn.addEventListener('click', () => {
                urlMappingModal.style.display = 'none';
            });
        }
    }

    if (addUrlMappingBtn) {
        addUrlMappingBtn.addEventListener('click', () => {
            if (urlMappingList) {
                urlMappingList.appendChild(createUrlMappingRow());
            }
        });
    }

    if (applyUrlMappingBulkBtn) {
        applyUrlMappingBulkBtn.addEventListener('click', () => {
            if (!urlMappingList || !urlMappingBulkInput) return;
            const text = urlMappingBulkInput.value || '';
            const entries = parseBulkOverrides(text);
            if (entries.length === 0) {
                alert('No valid overrides found.');
                return;
            }

            const rowMap = new Map();
            urlMappingList.querySelectorAll('.url-mapping-row').forEach(row => {
                const fromInput = row.querySelector('.url-mapping-from');
                if (fromInput && fromInput.value.trim()) {
                    rowMap.set(fromInput.value.trim(), row);
                }
            });

            entries.forEach(({ from, to }) => {
                const existingRow = rowMap.get(from);
                if (existingRow) {
                    const toInput = existingRow.querySelector('.url-mapping-to');
                    if (toInput) toInput.value = to;
                } else {
                    const newRow = createUrlMappingRow({ from, to });
                    urlMappingList.appendChild(newRow);
                    rowMap.set(from, newRow);
                }
            });

            urlMappingBulkInput.value = '';
        });
    }

    if (saveUrlMappingBtn && urlMappingModal) {
        saveUrlMappingBtn.addEventListener('click', () => {
            if (!urlMappingList) return;
            const rows = Array.from(urlMappingList.querySelectorAll('.url-mapping-row'));
            const mappings = rows.map(row => {
                const fromInput = row.querySelector('.url-mapping-from');
                const toInput = row.querySelector('.url-mapping-to');
                return {
                    from: fromInput ? fromInput.value.trim() : '',
                    to: toInput ? toInput.value.trim() : ''
                };
            });

            if (rows.length === 0 || mappings.some(mapping => !mapping.from || !mapping.to)) {
                alert('Both fields are required for each route override.');
                return;
            }

            saveUrlMappings(mappings);
            alert('Route overrides saved.');
            urlMappingModal.style.display = 'none';
        });
    }

    function parseBulkOverrides(text) {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const separator = '=>';
                const separatorIndex = line.indexOf(separator);
                if (separatorIndex === -1) return null;
                const from = line.slice(0, separatorIndex).trim();
                const to = line.slice(separatorIndex + separator.length).trim();
                if (!from || !to) return null;
                return { from, to };
            })
            .filter(Boolean);
    }

    // History Navigation
    // Undo/Redo buttons
    if (elements.undoBtn) {
        elements.undoBtn.addEventListener('click', () => {
            if (state.undoStack.length <= 1) return;

            const currentContent = elements.rawRequestInput.innerText || elements.rawRequestInput.textContent;
            state.redoStack.push(currentContent);

            state.undoStack.pop();
            const previousContent = state.undoStack[state.undoStack.length - 1];

            if (previousContent !== undefined) {
                elements.rawRequestInput.textContent = previousContent;
                elements.rawRequestInput.innerHTML = highlightHTTP(previousContent);
                // Update undo/redo button states
                events.emit(EVENT_NAMES.UI_UPDATE_HISTORY_BUTTONS);
            }
        });
    }

    if (elements.redoBtn) {
        elements.redoBtn.addEventListener('click', () => {
            if (state.redoStack.length === 0) return;

            const nextContent = state.redoStack.pop();
            if (nextContent !== undefined) {
                state.undoStack.push(nextContent);
                elements.rawRequestInput.textContent = nextContent;
                elements.rawRequestInput.innerHTML = highlightHTTP(nextContent);
                // Update undo/redo button states
                events.emit(EVENT_NAMES.UI_UPDATE_HISTORY_BUTTONS);
            }
        });
    }

    // Copy Buttons
    if (elements.copyReqBtn) {
        elements.copyReqBtn.addEventListener('click', () => {
            copyToClipboard(elements.rawRequestInput.innerText, elements.copyReqBtn);
        });
    }

    if (elements.copyResBtn) {
        elements.copyResBtn.addEventListener('click', () => {
            copyToClipboard(elements.rawResponseDisplay.innerText, elements.copyResBtn);
        });
    }

    // Screenshot
    if (elements.screenshotBtn) {
        elements.screenshotBtn.addEventListener('click', captureScreenshot);
    }

    // Diff Toggle
    if (elements.showDiffCheckbox) {
        elements.showDiffCheckbox.addEventListener('change', () => {
            if (state.regularRequestBaseline && state.currentResponse) {
                if (elements.showDiffCheckbox.checked) {
                    elements.rawResponseDisplay.innerHTML = renderDiff(state.regularRequestBaseline, state.currentResponse);
                } else {
                    elements.rawResponseDisplay.innerHTML = highlightHTTP(state.currentResponse);
                }
            }
        });
    }
});
