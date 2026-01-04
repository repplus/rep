// View Tabs Module - Handles request/response view tab switching
import { switchRequestView, switchResponseView } from './request-editor.js';

/**
 * Sets up view tabs for request and response panes
 */
export function setupViewTabs() {
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const view = tab.dataset.view;
            const pane = tab.dataset.pane;
            if (pane === 'request') {
                switchRequestView(view);
            } else {
                switchResponseView(view);
            }
        });
    });
}

