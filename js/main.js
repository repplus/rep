// Main Entry Point
import { state, addRequest } from './modules/state.js';
import {
    initUI, elements, renderRequestItem, filterRequests, updateHistoryButtons,
    clearAllRequestsUI, setupResizeHandle, setupSidebarResize, setupContextMenu,
    setupUndoRedo, captureScreenshot, exportRequests, importRequests,
    initSortableHeaders, initOOSToggle
} from './modules/ui.js';
import { setupNetworkListener } from './modules/network.js';
import { setupBulkReplay } from './modules/bulk-replay.js';
import { copyToClipboard, renderDiff, highlightHTTP } from './modules/utils.js';

// Feature Modules
import { initTheme } from './modules/theme.js';
import { initMultiTabCapture } from './modules/multi-tab.js';
import { initExtractorUI } from './modules/extractor-ui.js';
import { setupAIFeatures } from './modules/ai.js';
import { handleSendRequest, initKeyboardShortcuts } from './modules/request-handler.js';
import { initSearch } from './modules/search.js';
import { loadSettings, initSettingsModal } from './modules/settings.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI Elements
    initUI();

    // Load settings first
    loadSettings();

    // Initialize Features
    initTheme();
    initMultiTabCapture();
    initExtractorUI();
    setupBulkReplay();
    setupAIFeatures(elements);
    initSearch();
    initKeyboardShortcuts();
    initSortableHeaders();
    initOOSToggle();
    initSettingsModal();

    // Setup Network Listener (Current Tab)
    setupNetworkListener((request) => {
        const index = addRequest(request);
        renderRequestItem(request, index);
    });

    // Setup UI Components
    setupResizeHandle();
    setupSidebarResize();
    setupContextMenu();
    setupUndoRedo();

    // Event Listeners

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

    document.querySelectorAll('.filter-btn:not(#oos-toggle)').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn:not(#oos-toggle)').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.filter;
            // If selecting a non-OOS filter, ensure OOS button is not active
            if (elements.oosToggle) elements.oosToggle.classList.remove('active');
            filterRequests();
        });
    });

    // OOS filter button behaves inline with other filters: toggles "oos" filter
    if (elements.oosToggle) {
        elements.oosToggle.addEventListener('click', () => {
            const willActivate = !elements.oosToggle.classList.contains('active');
            // Deactivate other filter buttons
            document.querySelectorAll('.filter-btn:not(#oos-toggle)').forEach(b => b.classList.remove('active'));
            // Toggle OOS button
            elements.oosToggle.classList.toggle('active', willActivate);
            // Set filter
            state.currentFilter = willActivate ? 'oos' : 'all';
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
