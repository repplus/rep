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
import { initSearch } from './search/index.js';

// UI Modules
import { setupBlockControls } from './ui/block-controls.js';
import { setupFilters } from './ui/filters.js';
import { setupSidebar } from './ui/sidebar.js';
import { setupViewTabs } from './ui/view-tabs.js';
import { setupRawRequestEditor, initLayoutToggle } from './ui/request-editor.js';

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
    setupRawRequestEditor(elements.rawRequestInput, elements.sendBtn);
    initLayoutToggle(elements.layoutToggleBtn);

    // Send Request
    if (elements.sendBtn) {
        elements.sendBtn.addEventListener('click', handleSendRequest);
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
