// Request Handler Module
import { state, addToHistory } from './state.js';
import { elements, updateHistoryButtons, toggleOOSVisibility } from './ui.js';
import { parseRequest, executeRequest } from './network.js';
import { formatBytes, renderDiff, highlightHTTP } from './utils.js';

/**
 * Keyboard shortcut configuration
 * Format: { key: 'KeyCode', ctrl: bool, shift: bool, alt: bool, action: fn, description: string }
 * 
 * To add new shortcuts:
 * 1. Add entry to KEYBOARD_SHORTCUTS array
 * 2. Action function receives the KeyboardEvent
 */
const KEYBOARD_SHORTCUTS = [
    {
        key: 'Space',
        ctrl: true,
        description: 'Send request',
        action: () => {
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn && !sendBtn.disabled) {
                handleSendRequest();
            }
        }
    },
    {
        key: 'KeyL',
        ctrl: true,
        description: 'Clear request input',
        action: () => {
            if (elements.rawRequestInput) {
                elements.rawRequestInput.innerText = '';
                elements.rawRequestInput.focus();
            }
        }
    },
    {
        key: 'KeyO',
        ctrl: true,
        shift: true,
        description: 'Toggle OOS visibility',
        action: () => {
            toggleOOSVisibility();
        }
    }
];

/**
 * Check if a keyboard event matches a shortcut definition
 */
function matchesShortcut(event, shortcut) {
    const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !(event.ctrlKey || event.metaKey);
    const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
    const altMatch = shortcut.alt ? event.altKey : !event.altKey;
    const keyMatch = event.code === shortcut.key;
    
    return keyMatch && ctrlMatch && shiftMatch && altMatch;
}

/**
 * Initialize keyboard shortcuts for the request panel
 */
export function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        for (const shortcut of KEYBOARD_SHORTCUTS) {
            if (matchesShortcut(e, shortcut)) {
                e.preventDefault();
                shortcut.action(e);
                return;
            }
        }
    });
}

/**
 * Get all registered keyboard shortcuts (for help/documentation)
 */
export function getKeyboardShortcuts() {
    return KEYBOARD_SHORTCUTS.map(s => ({
        key: s.key,
        modifiers: [s.ctrl && 'Ctrl', s.shift && 'Shift', s.alt && 'Alt'].filter(Boolean),
        description: s.description
    }));
}

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

        const result = await executeRequest(url, options);

        elements.resTime.textContent = `${result.duration}ms`;
        elements.resSize.textContent = formatBytes(result.size);

        elements.resStatus.textContent = `${result.status} ${result.statusText}`;
        if (result.status >= 200 && result.status < 300) {
            elements.resStatus.className = 'status-badge status-2xx';
        } else if (result.status >= 400 && result.status < 500) {
            elements.resStatus.className = 'status-badge status-4xx';
        } else if (result.status >= 500) {
            elements.resStatus.className = 'status-badge status-5xx';
        }

        // Build raw HTTP response
        let rawResponse = `HTTP/1.1 ${result.status} ${result.statusText}\n`;
        for (const [key, value] of result.headers) {
            rawResponse += `${key}: ${value}\n`;
        }
        rawResponse += '\n';

        try {
            const json = JSON.parse(result.body);
            rawResponse += JSON.stringify(json, null, 2);
        } catch (e) {
            rawResponse += result.body;
        }

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

    } catch (err) {
        console.error('Request Failed:', err);
        elements.resStatus.textContent = 'Error';
        elements.resStatus.className = 'status-badge status-5xx';
        elements.resTime.textContent = '0ms';
        elements.rawResponseDisplay.textContent = `Error: ${err.message}\n\nStack: ${err.stack}`;
        elements.rawResponseDisplay.style.display = 'block';
    }
}
