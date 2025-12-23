// Main Entry Point
import { state, addRequest } from './core/state.js';
import { events } from './core/events.js';
import {
    initUI, elements, renderRequestItem, filterRequests, updateHistoryButtons,
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
import { initExtractorUI } from './features/extractors/ui.js';
import { setupAIFeatures } from './features/ai/index.js';
import { handleSendRequest } from './network/handler.js';
import { initSearch } from './search/index.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI Elements
    initUI();

    // Initialize Features
    initTheme();
    initMultiTabCapture();
    initExtractorUI();
    setupBulkReplay();
    setupAIFeatures(elements);
    initSearch();

    // Promotional Banner
    const promoBanner = document.getElementById('promo-banner');
    const closeBannerBtn = document.getElementById('close-banner');

    // Check if banner was previously dismissed
    const bannerDismissed = localStorage.getItem('repPlusBannerDismissed');
    if (bannerDismissed === 'true') {
        promoBanner.classList.add('hidden');
    }

    // Handle banner dismissal
    if (closeBannerBtn) {
        closeBannerBtn.addEventListener('click', () => {
            promoBanner.classList.add('hidden');
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

        const index = addRequest(request);
        renderRequestItem(request, index);
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
                updateBlockButtons();
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

    // Event Listeners

    // Block/Step controls
    const blockBtn = document.getElementById('block-toggle-btn');
    const forwardBtn = document.getElementById('forward-btn');
    const forwardMenu = document.getElementById('forward-menu');
    const forwardMenuItems = forwardMenu ? Array.from(forwardMenu.querySelectorAll('.forward-menu-item')) : [];
    let forwardMode = 'next';

    function updateBlockButtons() {
        if (blockBtn) {
            blockBtn.classList.toggle('active', state.blockRequests);
            const isBlocking = state.blockRequests;
            blockBtn.title = isBlocking ? 'Unblock incoming requests' : 'Block incoming requests';
            blockBtn.innerHTML = isBlocking
                ? '<svg class="block-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
                : '<svg class="block-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5h3v14H8zm5 0h3v14h-3z"/></svg>';
        }
        const count = state.blockedQueue.length;
        if (forwardBtn) {
            const mode = forwardMode;
            const label = mode === 'all' ? 'Forward all' : 'Forward';
            const labelEl = forwardBtn.querySelector('.forward-label');
            if (labelEl) {
                labelEl.textContent = `${label} (${count})`;
            } else {
                forwardBtn.textContent = `${label} (${count})`;
            }
            forwardBtn.disabled = count === 0;
        }
    }

    if (blockBtn) {
        blockBtn.addEventListener('click', () => {
            state.blockRequests = !state.blockRequests;
            if (state.blockRequests) {
                // Fresh blocking session: clear current list and queue
                clearAllRequestsUI();
                state.blockedQueue = [];
            }
            // If unblocking, flush all queued
            if (!state.blockRequests && state.blockedQueue.length > 0) {
                const queued = [...state.blockedQueue];
                state.blockedQueue = [];
                queued.forEach(req => processCapturedRequest(req));
            }
            updateBlockButtons();
        });
    }

    if (forwardBtn) {
        forwardBtn.addEventListener('click', (e) => {
            if (state.blockedQueue.length === 0) return;

            const caret = forwardBtn.querySelector('.forward-caret');
            const rect = forwardBtn.getBoundingClientRect();
            const clickInCaretZone = caret && caret.contains(e.target);
            const clickOnRightEdge = e.clientX >= rect.right - 28; // generous hit area on the right side

            // If click was on caret or right edge, toggle menu
            if (clickInCaretZone || clickOnRightEdge) {
                if (forwardMenu) forwardMenu.classList.toggle('open');
                return;
            }

            const mode = forwardMode;
            if (mode === 'all') {
                const queued = [...state.blockedQueue];
                state.blockedQueue = [];
                queued.forEach(req => processCapturedRequest(req));
            } else {
                const next = state.blockedQueue.shift();
                processCapturedRequest(next);
            }
            updateBlockButtons();
        });
    }

    if (forwardMenu && forwardMenuItems.length) {
        const setMode = (mode) => {
            forwardMode = mode;
            forwardMenuItems.forEach(item => item.classList.toggle('active', item.dataset.mode === mode));
            updateBlockButtons();
            forwardMenu.classList.remove('open');
        };

        forwardMenuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                setMode(item.dataset.mode || 'next');
            });
        });

        document.addEventListener('click', (e) => {
            if (forwardMenu.contains(e.target) || forwardBtn?.contains(e.target)) return;
            forwardMenu.classList.remove('open');
        });
    }

    // React to global events that change queue/counters
    events.on('block-queue:updated', updateBlockButtons);
    events.on('ui:clear-all', updateBlockButtons);
    // initialize labels
    updateBlockButtons();

    // Send Request
    if (elements.sendBtn) {
        elements.sendBtn.addEventListener('click', handleSendRequest);
    }

    // Search & Filter
    if (elements.searchBar) {
        elements.searchBar.addEventListener('input', (e) => {
            state.currentSearchTerm = e.target.value.toLowerCase();
            filterRequests();
        });
    }

    if (elements.regexToggle) {
        elements.regexToggle.addEventListener('click', () => {
            state.useRegex = !state.useRegex;
            elements.regexToggle.classList.toggle('active', state.useRegex);
            elements.regexToggle.title = state.useRegex
                ? 'Regex mode enabled (click to disable)'
                : 'Toggle Regex Mode (enable to use regex patterns)';
            filterRequests();
        });
    }

    // Method filter dropdown (multi-select)
    const methodFilterBtn = document.getElementById('method-filter-btn');
    const methodFilterLabel = document.getElementById('method-filter-label');
    const methodFilterMenu = document.getElementById('method-filter-menu');
    const methodCheckboxes = methodFilterMenu ? Array.from(methodFilterMenu.querySelectorAll('.method-checkbox')) : [];
    const methodItems = methodFilterMenu ? Array.from(methodFilterMenu.querySelectorAll('.method-filter-item')) : [];
    const selectAllBtn = document.getElementById('method-select-all');
    const clearAllBtn = document.getElementById('method-clear-all');
    const starFilterBtn = document.querySelector('.filter-btn[data-filter="starred"]');

    const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'XHR'];

    const updateMethodFilterUI = () => {
        // Update checkboxes
        methodCheckboxes.forEach(checkbox => {
            const method = checkbox.dataset.filter;
            checkbox.checked = state.selectedMethods.has(method);
        });

        // Update item active state
        methodItems.forEach(item => {
            const method = item.dataset.filter;
            item.classList.toggle('active', state.selectedMethods.has(method));
        });

        // Update label
        if (methodFilterLabel) {
            if (state.selectedMethods.size === 0) {
                methodFilterLabel.textContent = 'All';
            } else if (state.selectedMethods.size === ALL_METHODS.length) {
                methodFilterLabel.textContent = 'All';
            } else if (state.selectedMethods.size <= 3) {
                methodFilterLabel.textContent = Array.from(state.selectedMethods).join(', ');
            } else {
                methodFilterLabel.textContent = `${state.selectedMethods.size} methods`;
            }
        }

        // Visual cue on the pill when filter is active
        if (methodFilterBtn) {
            methodFilterBtn.classList.toggle('active', state.selectedMethods.size > 0 && state.selectedMethods.size < ALL_METHODS.length);
        }

        // Don't clear star filter - they work together now

        // Update legacy currentFilter for compatibility
        if (state.selectedMethods.size === 0 || state.selectedMethods.size === ALL_METHODS.length) {
            state.currentFilter = 'all';
        } else if (state.selectedMethods.size === 1) {
            state.currentFilter = Array.from(state.selectedMethods)[0];
        } else {
            state.currentFilter = 'multiple';
        }

        filterRequests();
    };

    const toggleMethod = (method) => {
        if (state.selectedMethods.has(method)) {
            state.selectedMethods.delete(method);
        } else {
            state.selectedMethods.add(method);
        }
        // Don't clear star filter - they work together now
        updateMethodFilterUI();
    };

    const selectAllMethods = () => {
        ALL_METHODS.forEach(method => state.selectedMethods.add(method));
        // Don't clear star filter - they work together now
        updateMethodFilterUI();
    };

    const clearAllMethods = () => {
        state.selectedMethods.clear();
        // Don't clear star filter - they work together now
        updateMethodFilterUI();
    };

    if (methodFilterBtn && methodFilterMenu) {
        methodFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            methodFilterMenu.classList.toggle('open');
        });

        // Handle checkbox clicks
        methodCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const method = checkbox.dataset.filter;
                toggleMethod(method);
            });
        });

        // Handle item clicks (clicking anywhere on the item toggles the checkbox)
        methodItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't toggle if clicking directly on the checkbox (it handles its own event)
                if (e.target.type === 'checkbox') return;
                e.stopPropagation();
                const checkbox = item.querySelector('.method-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    toggleMethod(checkbox.dataset.filter);
                }
            });
        });

        // Select all button
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectAllMethods();
            });
        }

        // Clear all button
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                clearAllMethods();
            });
        }

        document.addEventListener('click', (e) => {
            if (methodFilterMenu.contains(e.target) || methodFilterBtn.contains(e.target)) return;
            methodFilterMenu.classList.remove('open');
        });

        // Initialize UI
        updateMethodFilterUI();
    }

    // Star filter toggle (works together with method and color filters)
    if (starFilterBtn) {
        // Initialize button state
        starFilterBtn.classList.toggle('active', state.starFilterActive);
        
        starFilterBtn.addEventListener('click', () => {
            const currentlyActive = starFilterBtn.classList.contains('active');
            if (currentlyActive) {
                // Clear star filter
                starFilterBtn.classList.remove('active');
                state.starFilterActive = false;
                state.currentFilter = 'all';
            } else {
                // Activate star filter
                starFilterBtn.classList.add('active');
                state.starFilterActive = true;
                if (methodFilterMenu) methodFilterMenu.classList.remove('open');
            }
            filterRequests();
        });
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

    // Export/Import
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

    // History Navigation
    if (elements.historyBackBtn) {
        elements.historyBackBtn.addEventListener('click', () => {
            if (state.historyIndex > 0) {
                state.historyIndex--;
                const item = state.requestHistory[state.historyIndex];
                elements.rawRequestInput.innerText = item.rawText;
                elements.useHttpsCheckbox.checked = item.useHttps;
                updateHistoryButtons();
            }
        });
    }

    if (elements.historyFwdBtn) {
        elements.historyFwdBtn.addEventListener('click', () => {
            if (state.historyIndex < state.requestHistory.length - 1) {
                state.historyIndex++;
                const item = state.requestHistory[state.historyIndex];
                elements.rawRequestInput.innerText = item.rawText;
                elements.useHttpsCheckbox.checked = item.useHttps;
                updateHistoryButtons();
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
