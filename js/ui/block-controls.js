// Block Controls Module - Handles request blocking and forwarding
import { state, actions } from '../core/state.js';
import { events } from '../core/events.js';
import { clearAllRequestsUI, elements } from './main-ui.js';

/**
 * Sets up block/forward controls for request interception
 * @param {Function} processCapturedRequest - Callback to process captured requests
 */
export function setupBlockControls(processCapturedRequest) {
    if (!elements.blockToggleBtn || !elements.forwardBtn || !elements.forwardMenu) return;
    
    const forwardMenuItems = Array.from(elements.forwardMenu.querySelectorAll('.forward-menu-item'));
    let forwardMode = 'next';

    function updateBlockButtons() {
        if (elements.blockToggleBtn) {
            elements.blockToggleBtn.classList.toggle('active', state.blockRequests);
            const isBlocking = state.blockRequests;
            elements.blockToggleBtn.title = isBlocking ? 'Unblock incoming requests' : 'Block incoming requests';
            elements.blockToggleBtn.innerHTML = isBlocking
                ? '<svg class="block-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
                : '<svg class="block-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5h3v14H8zm5 0h3v14h-3z"/></svg>';
        }
        const count = state.blockedQueue.length;
        if (elements.forwardBtn) {
            const mode = forwardMode;
            const label = mode === 'all' ? 'Forward all' : 'Forward';
            const labelEl = elements.forwardBtn.querySelector('.forward-label');
            if (labelEl) {
                labelEl.textContent = `${label} (${count})`;
            } else {
                elements.forwardBtn.textContent = `${label} (${count})`;
            }
            elements.forwardBtn.disabled = count === 0;
        }
    }

    elements.blockToggleBtn.addEventListener('click', () => {
        const newBlockingState = !state.blockRequests;
        
        // Use action to set blocking (automatically emits events)
        actions.blocking.setBlocking(newBlockingState);
        
        if (newBlockingState) {
            // Fresh blocking session: clear current list and queue
            clearAllRequestsUI();
            actions.blocking.clearBlockedQueue();
        }
        // If unblocking, flush all queued
        if (!newBlockingState && state.blockedQueue.length > 0) {
            const queued = [...state.blockedQueue];
            actions.blocking.clearBlockedQueue();
            queued.forEach(req => processCapturedRequest(req));
        }
        updateBlockButtons();
    });

    elements.forwardBtn.addEventListener('click', (e) => {
        if (state.blockedQueue.length === 0) return;

        const caret = elements.forwardBtn.querySelector('.forward-caret');
        const rect = elements.forwardBtn.getBoundingClientRect();
        const clickInCaretZone = caret && caret.contains(e.target);
        const clickOnRightEdge = e.clientX >= rect.right - 28; // generous hit area on the right side

        // If click was on caret or right edge, toggle menu
        if (clickInCaretZone || clickOnRightEdge) {
            if (elements.forwardMenu) elements.forwardMenu.classList.toggle('open');
            return;
        }

        const mode = forwardMode;
        if (mode === 'all') {
            const queued = [...state.blockedQueue];
            actions.blocking.clearBlockedQueue();
            queued.forEach(req => processCapturedRequest(req));
        } else {
            const next = state.blockedQueue.shift();
            if (next) {
                // Remove from queue (manually since shift() already removed it)
                state.blockedQueue = state.blockedQueue.filter(r => r !== next);
                events.emit('block-queue:updated');
                processCapturedRequest(next);
            }
        }
        updateBlockButtons();
    });

    if (forwardMenuItems.length) {
        const setMode = (mode) => {
            forwardMode = mode;
            forwardMenuItems.forEach(item => item.classList.toggle('active', item.dataset.mode === mode));
            updateBlockButtons();
            elements.forwardMenu.classList.remove('open');
        };

        forwardMenuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                setMode(item.dataset.mode || 'next');
            });
        });

        document.addEventListener('click', (e) => {
            if (elements.forwardMenu.contains(e.target) || elements.forwardBtn?.contains(e.target)) return;
            elements.forwardMenu.classList.remove('open');
        });
    }

    // React to global events that change queue/counters
    events.on('block-queue:updated', updateBlockButtons);
    events.on('ui:clear-all', updateBlockButtons);
    
    // Initialize labels
    updateBlockButtons();
}

