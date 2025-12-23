// UI Utilities Module - Setup functions, resize, context menu, undo/redo, export/import
import { state, clearRequests } from '../core/state.js';
import { highlightHTTP } from '../core/utils/network.js';
import { decodeJWT } from '../core/utils/misc.js';
import { events } from '../core/events.js';
import { elements } from './main-ui.js'; // Keep for context menu and undo/redo which need direct element access
import { renderRequestItem } from './request-list.js';

export function updateHistoryButtons() {
    const historyBackBtn = document.getElementById('history-back');
    const historyFwdBtn = document.getElementById('history-fwd');
    if (historyBackBtn) {
        historyBackBtn.disabled = state.historyIndex <= 0;
    }
    if (historyFwdBtn) {
        historyFwdBtn.disabled = state.historyIndex >= state.requestHistory.length - 1;
    }
}

export function toggleAllObjects() {
    const container = document.querySelector('.json-formatter-container');
    if (!container || !container.innerHTML) return;

    const nodes = container.querySelectorAll('.json-object, .json-array');
    if (nodes.length == 0) return;

    const hasAnyExpanded = Array.from(nodes).slice(1).some(node =>
        node.classList.contains('expanded')
    );

    nodes.forEach((node, index) => {
        if (index === 0) {
            // Always keep root expanded (looks better)
            node.classList.remove('collapsed');
            node.classList.add('expanded');
        } else {
            // Toggle other nodes
            if (hasAnyExpanded) {
                node.classList.remove('expanded');
                node.classList.add('collapsed');
            } else {
                node.classList.remove('collapsed');
                node.classList.add('expanded');
            }
        }
    });

}


export function clearAllRequestsUI() {
    clearRequests();
    state.blockedQueue = [];
    const requestList = document.getElementById('request-list');
    if (requestList) {
        requestList.innerHTML = '';

        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'Listening for requests...';
        requestList.appendChild(emptyState);
    }

    // Emit event to clear UI elements
    events.emit('ui:clear-all'); // Using string literal since EVENT_NAMES import would add coupling
    events.emit('block-queue:updated');
    updateHistoryButtons();
}

export function setupResizeHandle() {
    const resizeHandle = document.querySelector('.pane-resize-handle');
    const requestPane = document.querySelector('.request-pane');
    const responsePane = document.querySelector('.response-pane');
    const container = document.querySelector('.main-content');
    const previewIframe = document.getElementById('response-preview-iframe');

    if (!resizeHandle || !requestPane || !responsePane) return;

    if (!requestPane.style.flex || requestPane.style.flex === '') {
        requestPane.style.flex = '1';
        responsePane.style.flex = '1';
    }

    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('resizing');
        // Prevent iframe from swallowing mouseup when preview is visible
        if (previewIframe) {
            previewIframe.dataset.prevPointerEvents = previewIframe.style.pointerEvents || '';
            previewIframe.style.pointerEvents = 'none';
        }
        const isVertical = document.querySelector('.split-view-container').classList.contains('vertical-layout');
        document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const containerRect = container.getBoundingClientRect();
        const isVertical = document.querySelector('.split-view-container').classList.contains('vertical-layout');

        if (isVertical) {
            const offsetY = e.clientY - containerRect.top;
            const containerHeight = containerRect.height;
            let percentage = (offsetY / containerHeight) * 100;
            percentage = Math.max(20, Math.min(80, percentage));

            requestPane.style.flex = `0 0 ${percentage}%`;
            responsePane.style.flex = `0 0 ${100 - percentage}%`;
        } else {
            const offsetX = e.clientX - containerRect.left;
            const containerWidth = containerRect.width;

            // Enforce minimum pixel widths to avoid layout cracking
            const minLeftPx = 250;
            const minRightPx = 250;
            const clampedOffsetX = Math.min(
                Math.max(offsetX, minLeftPx),
                Math.max(containerWidth - minRightPx, minLeftPx)
            );

            let percentage = (clampedOffsetX / containerWidth) * 100;
            percentage = Math.max(20, Math.min(80, percentage));

            requestPane.style.flex = `0 0 ${percentage}%`;
            responsePane.style.flex = `0 0 ${100 - percentage}%`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('resizing');
            if (previewIframe) {
                previewIframe.style.pointerEvents = previewIframe.dataset.prevPointerEvents || '';
                delete previewIframe.dataset.prevPointerEvents;
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

export function setupSidebarResize() {
    const resizeHandle = document.querySelector('.sidebar-resize-handle');
    const sidebar = document.querySelector('.sidebar');

    if (!resizeHandle || !sidebar) return;

    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const newWidth = e.clientX;
        if (newWidth >= 150 && newWidth <= 600) {
            sidebar.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

export function setupUndoRedo() {
    elements.rawRequestInput.addEventListener('input', () => {
        if (elements.rawRequestInput._undoDisabled) return;

        clearTimeout(elements.rawRequestInput.undoTimeout);
        elements.rawRequestInput.undoTimeout = setTimeout(() => {
            if (!elements.rawRequestInput._undoDisabled) {
                saveUndoState();
            }
        }, 500);
    });

    // Update syntax highlighting on blur
    elements.rawRequestInput.addEventListener('blur', () => {
        const content = elements.rawRequestInput.innerText;
        elements.rawRequestInput.innerHTML = highlightHTTP(content);
    });

    elements.rawRequestInput.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? e.metaKey : e.ctrlKey;

        // Hotkey: Ctrl/Cmd + Enter → Send request
        if (modKey && e.key === 'Enter') {
            e.preventDefault();
            if (elements.sendBtn) {
                elements.sendBtn.click();
            }
            return;
        }

        // Hotkeys: Undo / Redo
        if (modKey && e.key === 'z' && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            undo();
        } else if (modKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
    });
}

function saveUndoState() {
    if (elements.rawRequestInput._undoDisabled) return;

    const currentContent = elements.rawRequestInput.innerText || elements.rawRequestInput.textContent;
    if (state.undoStack.length > 0 && state.undoStack[state.undoStack.length - 1] === currentContent) {
        return;
    }
    state.undoStack.push(currentContent);
    if (state.undoStack.length > 50) {
        state.undoStack.shift();
    }
    state.redoStack = [];
}

function undo() {
    if (state.undoStack.length <= 1) return;

    const currentContent = elements.rawRequestInput.innerText || elements.rawRequestInput.textContent;
    state.redoStack.push(currentContent);

    state.undoStack.pop();
    const previousContent = state.undoStack[state.undoStack.length - 1];

    if (previousContent !== undefined) {
        elements.rawRequestInput.textContent = previousContent;
        elements.rawRequestInput.innerHTML = highlightHTTP(previousContent);
    }
}

function redo() {
    if (state.redoStack.length === 0) return;

    const nextContent = state.redoStack.pop();
    if (nextContent !== undefined) {
        state.undoStack.push(nextContent);
        elements.rawRequestInput.textContent = nextContent;
        elements.rawRequestInput.innerHTML = highlightHTTP(nextContent);
    }
}

// Global variable to store the current selection and range
let currentSelection = null;
let currentRange = null;
let storedRangeInfo = null; // Store range info for better recovery

// Helper to escape strings for single-quoted shell contexts (curl/bash)
function shellEscapeSingle(str) {
    if (str == null) return '';
    // Replace ' with '\'' pattern for POSIX shells
    return String(str).replace(/'/g, `'\\''`);
}

export function setupContextMenu() {
    // Right-click on editors
    [elements.rawRequestInput, elements.rawResponseDisplay].forEach(editor => {
        if (!editor) return;

        editor.addEventListener('contextmenu', (e) => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            if (!selectedText) return;

            e.preventDefault();
            // Store selected text and range in context menu dataset for later use
            elements.contextMenu.dataset.selectedText = selectedText;
            currentSelection = selection; // Store the selection object
            
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                currentRange = range.cloneRange(); // Clone the range to preserve it
                
                // Calculate character offset from start of editor for reliable positioning
                // Get plain text first (this strips HTML)
                const editorText = editor.textContent || editor.innerText || '';
                
                // Create a range from start of editor to selection start to count characters
                // This method works even when editor has HTML content
                try {
                    // Use a helper function to count characters from start of editor to a given point
                    function getCharacterOffset(container, offset) {
                        const range = document.createRange();
                        // Find first text node in editor
                        const walker = document.createTreeWalker(
                            editor,
                            NodeFilter.SHOW_TEXT,
                            null
                        );
                        const firstTextNode = walker.nextNode();
                        
                        if (firstTextNode) {
                            range.setStart(firstTextNode, 0);
                        } else {
                            // No text nodes, editor is empty
                            return 0;
                        }
                        range.setEnd(container, offset);
                        return range.toString().length;
                    }
                    
                    const startOffset = getCharacterOffset(range.startContainer, range.startOffset);
                    const endOffset = getCharacterOffset(range.endContainer, range.endOffset);
                    
                    // Verify the offsets make sense and match the selected text
                    if (startOffset >= 0 && endOffset >= startOffset && endOffset <= editorText.length) {
                        const selectedTextFromRange = editorText.substring(startOffset, endOffset);
                        if (selectedTextFromRange === selectedText) {
                            // Store range information for fallback
                            storedRangeInfo = {
                                startContainer: range.startContainer,
                                startOffset: range.startOffset,
                                endContainer: range.endContainer,
                                endOffset: range.endOffset,
                                editor: editor,
                                charStart: startOffset,  // Character offset from start
                                charEnd: endOffset,       // Character offset from start
                                contextBefore: editorText.substring(Math.max(0, startOffset - 20), startOffset), // Context for verification
                                contextAfter: editorText.substring(endOffset, Math.min(editorText.length, endOffset + 20))
                            };
                        } else {
                            // Text mismatch
                            console.warn('Text mismatch in stored range', {
                                expected: selectedText,
                                found: selectedTextFromRange,
                                startOffset,
                                endOffset
                            });
                            storedRangeInfo = null;
                        }
                    } else {
                        // Invalid offsets
                        console.warn('Invalid range offsets', {
                            startOffset,
                            endOffset,
                            editorTextLength: editorText.length
                        });
                        storedRangeInfo = null;
                    }
                } catch (e) {
                    console.warn('Failed to calculate character offsets:', e);
                    storedRangeInfo = null;
                }
            } else {
                currentRange = null;
                storedRangeInfo = null;
            }

            // Determine if full editor content is selected (only relevant for request editor)
            const editorText = editor.textContent || editor.innerText || '';
            const isRequestEditor = editor === elements.rawRequestInput;
            let isFullSelection = false;
            if (isRequestEditor && storedRangeInfo && editorText.length > 0) {
                isFullSelection =
                    storedRangeInfo.charStart === 0 &&
                    storedRangeInfo.charEnd === editorText.length;
            }

            elements.contextMenu.dataset.fullSelection = isFullSelection ? 'true' : 'false';
            
            showContextMenu(e.clientX, e.clientY, editor);
        });
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!elements.contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });

    // Handle menu item clicks (encode/decode actions only).
    // The "Mark Payload (§)" action is handled in the Bulk Replay feature,
    // so we explicitly ignore it here to avoid clearing the stored selection
    // before the bulk replay handler runs.
    elements.contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item[data-action]');
        if (!item) return;

        // Ignore clicks on disabled items
        if (item.classList.contains('disabled')) {
            e.stopPropagation();
            return;
        }

            e.stopPropagation();
            const action = item.dataset.action;
        if (!action) return;

        // "Mark Payload (§)" is handled elsewhere
        if (action === 'mark-payload') {
                hideContextMenu();
            return;
        }

        // Copy-as actions (curl, bash, etc.)
        if (action.startsWith('copy-as-')) {
            handleCopyAs(action);
            hideContextMenu();
            return;
        }

        // Default: encode/decode actions
        handleEncodeDecode(action);
        hideContextMenu();
    });

    // Handle submenu positioning
    const submenuItems = elements.contextMenu.querySelectorAll('.context-menu-item.has-submenu');
    submenuItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            const submenu = item.querySelector('.context-submenu');
            if (!submenu) return;

            // Reset first
            item.classList.remove('submenu-align-bottom');

            // Measure height
            submenu.style.display = 'block';
            submenu.style.visibility = 'hidden';
            const submenuHeight = submenu.offsetHeight;
            submenu.style.display = '';
            submenu.style.visibility = '';

            const rect = item.getBoundingClientRect();
            const windowHeight = window.innerHeight;

            // Check overflow with buffer
            if (rect.top + submenuHeight + 10 > windowHeight) {
                item.classList.add('submenu-align-bottom');
            }
        });
    });
}

function showContextMenu(x, y, targetElement) {
    const isRequest = targetElement === elements.rawRequestInput;
    elements.contextMenu.dataset.target = isRequest ? 'request' : 'response';

    // Configure visibility and enabled state for "Copy as" group
    const copyAsGroup = elements.contextMenu.querySelector('#ctx-copy-as-group');
    if (copyAsGroup) {
        if (!isRequest) {
            // Hide entirely for response editor
            copyAsGroup.style.display = 'none';
        } else {
            copyAsGroup.style.display = '';
            const requiresFullItems = copyAsGroup.querySelectorAll('[data-requires-full-selection="true"]');
            const isFull =
                elements.contextMenu.dataset.fullSelection &&
                elements.contextMenu.dataset.fullSelection === 'true';
            requiresFullItems.forEach(item => {
                if (isFull) {
                    item.classList.remove('disabled');
                } else {
                    item.classList.add('disabled');
                }
            });
        }
    }

    // Show first to measure, but keep invisible
    elements.contextMenu.style.visibility = 'hidden';
    elements.contextMenu.classList.add('show');
    elements.contextMenu.classList.remove('open-left');

    const menuWidth = elements.contextMenu.offsetWidth;
    const menuHeight = elements.contextMenu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let left = x;
    let top = y;

    // Horizontal positioning
    if (x + menuWidth > windowWidth) {
        left = x - menuWidth;
        elements.contextMenu.classList.add('open-left');
    }

    // Vertical positioning
    if (y + menuHeight > windowHeight) {
        top = y - menuHeight;
    }

    elements.contextMenu.style.left = `${left}px`;
    elements.contextMenu.style.top = `${top}px`;
    elements.contextMenu.style.bottom = 'auto';
    elements.contextMenu.style.right = 'auto';

    elements.contextMenu.style.visibility = 'visible';
}

function hideContextMenu() {
    elements.contextMenu.classList.remove('show');
    // Clear stored selected text and range
    if (elements.contextMenu.dataset.selectedText) {
        delete elements.contextMenu.dataset.selectedText;
    }
    if (elements.contextMenu.dataset.fullSelection) {
        delete elements.contextMenu.dataset.fullSelection;
    }
    currentSelection = null;
    currentRange = null;
    storedRangeInfo = null;
}

function handleEncodeDecode(action) {
    const targetType = elements.contextMenu.dataset.target;
    const editor = targetType === 'request' ? elements.rawRequestInput : elements.rawResponseDisplay;

    if (!editor) return;

    // Get stored selected text from context menu dataset
    let selectedText = elements.contextMenu.dataset.selectedText;
    let rangeToUse = currentRange; // Use the stored range

    // Fallback to current selection if stored text or range not available
    if (!selectedText || !selectedText.trim() || !rangeToUse) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        rangeToUse = selection.getRangeAt(0);
        selectedText = rangeToUse.toString();
        if (!selectedText.trim()) return;
    }

    selectedText = selectedText.trim();
    if (!selectedText) return;

    const isRequestEditor = editor === elements.rawRequestInput;
    if (isRequestEditor) {
        saveUndoState();
        if (elements.rawRequestInput.undoTimeout) {
            clearTimeout(elements.rawRequestInput.undoTimeout);
        }
        elements.rawRequestInput._undoDisabled = true;
    }

    let transformedText = '';

    try {
        switch (action) {
            case 'base64-encode':
                transformedText = btoa(unescape(encodeURIComponent(selectedText)));
                break;
            case 'base64-decode':
                transformedText = decodeURIComponent(escape(atob(selectedText)));
                break;
            case 'url-decode':
                transformedText = decodeURIComponent(selectedText);
                break;
            case 'url-encode-key':
                transformedText = encodeURIComponent(selectedText);
                break;
            case 'url-encode-all':
                transformedText = selectedText.split('').map(char => {
                    return '%' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
                }).join('');
                break;
            case 'url-encode-unicode':
                transformedText = selectedText.split('').map(char => {
                    const code = char.charCodeAt(0);
                    if (code > 127) {
                        return encodeURIComponent(char);
                    } else {
                        return '%' + code.toString(16).toUpperCase().padStart(2, '0');
                    }
                }).join('');
                break;
            case 'jwt-decode':
                transformedText = decodeJWT(selectedText);
                break;
            default:
                return;
        }

        // Replace the selected text in the editor
        // Strategy: Try to use the range directly first (fastest and most accurate)
        // If that fails, use stored character offsets
        // Last resort: text search
        
        const editorText = editor.textContent || editor.innerText || '';
        let replacementDone = false;
        let startIndex = -1;
        
        // First, try to use the stored range directly (most reliable if still valid)
        if (editor.contentEditable === 'true' && rangeToUse) {
            try {
                // Check if range is still valid
                const rangeContainer = rangeToUse.commonAncestorContainer;
                if (editor.contains(rangeContainer) || rangeContainer === editor) {
                    const rangeText = rangeToUse.toString().trim();
                    if (rangeText === selectedText.trim()) {
                        // Range is valid and text matches - use it directly
                        rangeToUse.deleteContents();
                        const textNode = document.createTextNode(transformedText);
                        rangeToUse.insertNode(textNode);
                        rangeToUse.setStartAfter(textNode);
                        rangeToUse.collapse(true);
                        const selection = window.getSelection();
                        if (selection) {
                            selection.removeAllRanges();
                            selection.addRange(rangeToUse);
                        }
                        replacementDone = true;
                    }
                }
            } catch (e) {
                // Range is invalid, will fall through to other methods
                console.warn('Range invalid, using fallback:', e);
            }
        }
        
        // If range didn't work, use stored character offset
        if (!replacementDone && storedRangeInfo && storedRangeInfo.editor === editor && storedRangeInfo.charStart !== undefined) {
            startIndex = storedRangeInfo.charStart;
            
            // Verify the text at this position matches
            if (startIndex >= 0 && startIndex < editorText.length) {
                const textAtPosition = editorText.substring(startIndex, startIndex + selectedText.length);
                if (textAtPosition !== selectedText) {
                    // Text doesn't match, try to find it using context
                    if (storedRangeInfo.contextBefore && storedRangeInfo.contextAfter) {
                        const contextPattern = storedRangeInfo.contextBefore + selectedText + storedRangeInfo.contextAfter;
                        const contextIndex = editorText.indexOf(contextPattern);
                        if (contextIndex !== -1) {
                            startIndex = contextIndex + storedRangeInfo.contextBefore.length;
                        } else {
                            // Search near stored position
                            const searchStart = Math.max(0, startIndex - 100);
                            const searchEnd = Math.min(editorText.length, startIndex + selectedText.length + 100);
                            const searchArea = editorText.substring(searchStart, searchEnd);
                            const localIndex = searchArea.indexOf(selectedText);
                            if (localIndex !== -1) {
                                startIndex = searchStart + localIndex;
                            } else {
                                startIndex = -1; // Will trigger fallback
                            }
                        }
                    } else {
                        // Search near stored position
                        const searchStart = Math.max(0, startIndex - 100);
                        const searchEnd = Math.min(editorText.length, startIndex + selectedText.length + 100);
                        const searchArea = editorText.substring(searchStart, searchEnd);
                        const localIndex = searchArea.indexOf(selectedText);
                        if (localIndex !== -1) {
                            startIndex = searchStart + localIndex;
                        } else {
                            startIndex = -1; // Will trigger fallback
                        }
                    }
                }
            } else {
                startIndex = -1; // Invalid offset
            }
        }
        
        // Last resort: try to recreate range from stored info, or use indexOf
        if (!replacementDone && startIndex === -1) {
            if (storedRangeInfo && storedRangeInfo.editor === editor) {
                try {
                    // Try to recreate range
                    const range = document.createRange();
                    range.setStart(storedRangeInfo.startContainer, storedRangeInfo.startOffset);
                    range.setEnd(storedRangeInfo.endContainer, storedRangeInfo.endOffset);
                    
                    if (editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor) {
                        const rangeText = range.toString().trim();
                        if (rangeText === selectedText.trim()) {
                            range.deleteContents();
                            const textNode = document.createTextNode(transformedText);
                            range.insertNode(textNode);
                            range.setStartAfter(textNode);
                            range.collapse(true);
                            const selection = window.getSelection();
                            if (selection) {
                                selection.removeAllRanges();
                                selection.addRange(range);
                            }
                            replacementDone = true;
                        }
                    }
                } catch (e) {
                    // Failed to recreate range
                }
            }
            
            // Final fallback: use indexOf (but warn if text appears multiple times)
            if (!replacementDone) {
                startIndex = editorText.indexOf(selectedText);
                if (startIndex === -1) {
                    // Try without trimming
                    startIndex = editorText.indexOf(selectedText.trim());
                }
            }
        }
        
        // Perform the replacement using text-based method if range didn't work
        if (!replacementDone && startIndex !== -1 && startIndex >= 0 && startIndex < editorText.length) {
            // Verify the text at this position matches what we expect
            const textAtPosition = editorText.substring(startIndex, startIndex + selectedText.length);
            if (textAtPosition !== selectedText) {
                console.warn('Text mismatch at calculated position', {
                    expected: selectedText,
                    found: textAtPosition,
                    startIndex,
                    editorTextLength: editorText.length
                });
                // Try to find the text near the calculated position
                const searchStart = Math.max(0, startIndex - 100);
                const searchEnd = Math.min(editorText.length, startIndex + selectedText.length + 100);
                const searchArea = editorText.substring(searchStart, searchEnd);
                const localIndex = searchArea.indexOf(selectedText);
                if (localIndex !== -1) {
                    startIndex = searchStart + localIndex;
                } else {
                    alert('Selected text not found in editor. It may have been modified.');
                    if (isRequestEditor) {
                        elements.rawRequestInput._undoDisabled = false;
                    }
                    return;
                }
            }
            
            // Extra validation: if startIndex is 0, make sure we have context or stored info
            if (startIndex === 0 && (!storedRangeInfo || storedRangeInfo.charStart !== 0)) {
                // Position 0 without stored confirmation - this might be wrong
                // Check if selected text appears elsewhere
                const otherOccurrences = [];
                let searchIndex = 0;
                while ((searchIndex = editorText.indexOf(selectedText, searchIndex + 1)) !== -1) {
                    otherOccurrences.push(searchIndex);
                }
                if (otherOccurrences.length > 0) {
                    // Text appears elsewhere, warn user
                    console.warn('Selected text found at position 0, but also appears at:', otherOccurrences);
                    // If we have stored info with a different position, use that instead
                    if (storedRangeInfo && storedRangeInfo.charStart > 0) {
                        startIndex = storedRangeInfo.charStart;
                        // Re-verify
                        const textAtNewPos = editorText.substring(startIndex, startIndex + selectedText.length);
                        if (textAtNewPos !== selectedText) {
                            // Still wrong, abort
                            alert('Unable to determine exact position of selected text. Please try selecting the text again.');
                            if (isRequestEditor) {
                                elements.rawRequestInput._undoDisabled = false;
                            }
                            return;
                        }
                    }
                }
            }
            
            const before = editorText.substring(0, startIndex);
            const after = editorText.substring(startIndex + selectedText.length);
            const newText = before + transformedText + after;
            
            // Replace the text content (this removes HTML, which is fine - we'll re-apply highlighting)
            editor.textContent = newText;
        } else if (!replacementDone) {
            alert('Selected text not found in editor. It may have been modified.');
            if (isRequestEditor) {
                elements.rawRequestInput._undoDisabled = false;
            }
            return;
        }

        // Re-highlight if it's the request editor
        if (targetType === 'request' && editor === elements.rawRequestInput) {
            const currentContent = editor.innerText || editor.textContent;
            editor.innerHTML = highlightHTTP(currentContent);

            setTimeout(() => {
                if (isRequestEditor) {
                    elements.rawRequestInput._undoDisabled = false;
                    saveUndoState();
                }
            }, 0);
        } else {
            if (isRequestEditor) {
                elements.rawRequestInput._undoDisabled = false;
            }
        }

    } catch (error) {
        console.error('Encode/decode error:', error);
        if (isRequestEditor) {
            elements.rawRequestInput._undoDisabled = false;
        }
        alert(`Error: ${error.message}`);
    }
}

/**
 * Handle "Copy as ..." actions from the context menu.
 * These operate only on the request editor and require full selection of the request.
 */
function handleCopyAs(action) {
    // Ensure we're on the request editor and full selection is active
    const targetType = elements.contextMenu.dataset.target;
    const isFull = elements.contextMenu.dataset.fullSelection === 'true';
    if (targetType !== 'request' || !isFull) {
        return;
    }

    if (!state.selectedRequest || !state.selectedRequest.request) {
        console.warn('No selected request to copy as curl/bash');
        return;
    }

    const req = state.selectedRequest.request;
    const method = (req.method || 'GET').toUpperCase();
    const headers = (req.headers || []).filter(h => !h.name.startsWith(':'));
    const body = req.postData && typeof req.postData.text === 'string' ? req.postData.text : '';

    // Build base curl command
    const parts = [`curl '${shellEscapeSingle(req.url)}'`];
    if (method !== 'GET') {
        parts.push(`-X ${method}`);
    }
    headers.forEach(h => {
        parts.push(`-H '${shellEscapeSingle(`${h.name}: ${h.value}`)}'`);
    });
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
        parts.push(`--data-raw '${shellEscapeSingle(body)}'`);
    }
    const curlCommand = parts.join(' \\\n  ');

    let textToCopy = '';
    if (action === 'copy-as-curl') {
        textToCopy = curlCommand;
    } else if (action === 'copy-as-bash') {
        // PowerShell snippet using Invoke-WebRequest with headers and body
        const psLines = [];
        psLines.push(`$headers = @{`);
        headers.forEach(h => {
            const key = h.name.replace(/'/g, "''");
            const val = String(h.value).replace(/'/g, "''");
            psLines.push(`    '${key}' = '${val}'`);
        });
        psLines.push('}');
        psLines.push('');
        const methodPs = method === 'GET' ? '' : `-Method '${method}' `;
        const bodyPs = body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
            ? `-Body '${body.replace(/'/g, "''")}' `
            : '';
        psLines.push(`Invoke-WebRequest -Uri '${req.url.replace(/'/g, "''")}' ${methodPs}-Headers $headers ${bodyPs}| Select-Object -ExpandProperty Content`);
        textToCopy = psLines.join('\n');
    } else if (action === 'copy-as-python') {
        // Python requests snippet
        const pyLines = [];
        pyLines.push('import requests');
        pyLines.push('');
        pyLines.push(`url = '${req.url.replace(/'/g, "\\'")}'`);
        pyLines.push('');
        pyLines.push('headers = {');
        headers.forEach(h => {
            const key = h.name.replace(/'/g, "\\'");
            const val = String(h.value).replace(/'/g, "\\'");
            pyLines.push(`    '${key}': '${val}',`);
        });
        pyLines.push('}');
        const methodLower = method.toLowerCase();
        const canUseShortcut = ['get', 'post', 'put', 'patch', 'delete'].includes(methodLower);
        const hasBody = body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE');
        if (hasBody) {
            const bodyEsc = body.replace(/'/g, "\\'");
            pyLines.push('');
            pyLines.push(`data = '${bodyEsc}'`);
            pyLines.push('');
            if (canUseShortcut) {
                pyLines.push(`response = requests.${methodLower}(url, headers=headers, data=data)`);
            } else {
                pyLines.push(`response = requests.request('${method}', url, headers=headers, data=data)`);
            }
        } else {
            pyLines.push('');
            if (canUseShortcut) {
                pyLines.push(`response = requests.${methodLower}(url, headers=headers)`);
            } else {
                pyLines.push(`response = requests.request('${method}', url, headers=headers)`);
            }
        }
        pyLines.push('');
        pyLines.push('print(response.status_code)');
        pyLines.push('print(response.text)');
        textToCopy = pyLines.join('\n');
    } else if (action === 'copy-as-fetch') {
        // JavaScript fetch snippet (clean, browser-like)
        const urlEsc = req.url.replace(/'/g, "\\'");
        const ignoreHeaders = ['host', 'connection', 'content-length'];
        const filteredHeaders = headers.filter(h => !ignoreHeaders.includes(h.name.toLowerCase()));
        const hasBody = body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE');
        const hasCookie = headers.some(h => h.name.toLowerCase() === 'cookie');
        const refererHeader = headers.find(h => h.name.toLowerCase() === 'referer');

        const jsLines = [];
        jsLines.push(`fetch('${urlEsc}', {`);
        jsLines.push(`  method: '${method}',`);

        // Headers
        if (filteredHeaders.length > 0) {
            jsLines.push('  headers: {');
            filteredHeaders.forEach(h => {
                const key = h.name.toLowerCase().replace(/'/g, "\\'");
                const val = String(h.value).replace(/'/g, "\\'");
                jsLines.push(`    '${key}': '${val}',`);
            });
            jsLines.push('  },');
        }

        // Body (if any)
        if (hasBody) {
            // Prefer JSON-style literal if content-type is JSON
            const ct = headers.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
            if (ct.toLowerCase().includes('application/json')) {
                jsLines.push(`  body: ${JSON.stringify(body)},`);
            } else {
                const bodyEsc = body.replace(/'/g, "\\'");
                jsLines.push(`  body: '${bodyEsc}',`);
            }
        } else {
            jsLines.push('  body: null,');
        }

        // Referrer
        if (refererHeader) {
            const refEsc = String(refererHeader.value).replace(/'/g, "\\'");
            jsLines.push(`  referrer: '${refEsc}',`);
        }

        // Credentials based on presence of cookies
        if (hasCookie) {
            jsLines.push(`  credentials: 'include',`);
        }

        // Mode (reasonable default)
        jsLines.push(`  mode: 'cors',`);
        jsLines.push('})');
        jsLines.push('  .then(res => res.text())');
        jsLines.push('  .then(console.log)');
        jsLines.push('  .catch(console.error);');
        textToCopy = jsLines.join('\n');
    } else {
        return;
    }

    // Copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(err => {
            console.warn('Failed to write to clipboard via navigator.clipboard, falling back:', err);
            fallbackCopyText(textToCopy);
        });
    } else {
        fallbackCopyText(textToCopy);
    }
}

// Fallback copy implementation for older environments
function fallbackCopyText(text) {
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    } catch (e) {
        console.warn('Fallback copy failed:', e);
    }
}

export async function captureScreenshot() {
    // Capture only the full request and response content (no headers/search bars),
    // and make sure the entire text is visible in the image.
    try {
    if (typeof html2canvas === 'undefined') {
        alert('html2canvas library not loaded');
        return;
    }

        const requestEditor = document.querySelector('#raw-request-input');
        const responseActiveView = document.querySelector('.response-pane .view-content.active');
        const responseContentNode = responseActiveView
            ? responseActiveView.querySelector('#raw-response-display, #raw-response-text, #res-hex-display, pre, textarea') || responseActiveView
            : null;

        if (!requestEditor || !responseContentNode) {
            alert('Unable to find request/response content for screenshot.');
            return;
        }

        // Build an off-screen container that holds only the editors' content.
        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.left = '-99999px';
        wrapper.style.top = '0';
        wrapper.style.zIndex = '-1';
        wrapper.style.background = getComputedStyle(document.body).backgroundColor || '#1e1e1e';
        wrapper.style.padding = '16px';
        wrapper.style.display = 'flex';
        // Match the current layout (horizontal vs vertical) of the main split view
        const splitView = document.querySelector('.split-view-container');
        const isVerticalLayout = splitView && splitView.classList.contains('vertical-layout');
        wrapper.style.flexDirection = isVerticalLayout ? 'column' : 'row';
        wrapper.style.gap = '16px';
        wrapper.style.fontFamily = getComputedStyle(document.body).fontFamily || 'monospace';
        // Constrain the logical width so long tokens can't create a giant canvas
        const maxWrapperWidth = Math.min(window.innerWidth - 80, 1400);
        if (Number.isFinite(maxWrapperWidth) && maxWrapperWidth > 0) {
            wrapper.style.width = `${maxWrapperWidth}px`;
        }

        // Helper to clone a node (keeping syntax highlighting / colors) into a section
        const makeSection = (title, sourceNode) => {
            const section = document.createElement('div');
            section.style.display = 'flex';
            section.style.flexDirection = 'column';
            section.style.gap = '8px';
            section.style.flex = '1 1 0';
            section.style.minWidth = '0'; // allow flex shrink without overflow

            const heading = document.createElement('div');
            heading.textContent = title;
            heading.style.fontWeight = '600';
            heading.style.fontSize = '14px';
            section.appendChild(heading);

            const contentWrapper = document.createElement('div');
            contentWrapper.style.margin = '0';
            contentWrapper.style.padding = '8px 10px';
            contentWrapper.style.borderRadius = '6px';
            contentWrapper.style.background = getComputedStyle(sourceNode).backgroundColor || 'rgba(0,0,0,0.4)';
            contentWrapper.style.overflow = 'visible';

            const clone = sourceNode.cloneNode(true);
            // Avoid duplicate IDs in the document
            clone.removeAttribute('id');
            // Ensure cloned content can expand fully
            clone.style.maxHeight = 'none';
            clone.style.overflow = 'visible';
            clone.style.width = '100%';

            // Explicitly enforce a wrapped, readable layout for the screenshot,
            // so long tokens (e.g. JWTs) don't make the canvas extremely wide.
            const srcStyles = getComputedStyle(sourceNode);
            clone.style.whiteSpace = 'pre-wrap';
            clone.style.wordBreak = 'break-word';
            clone.style.overflowWrap = 'break-word';
            clone.style.fontFamily = srcStyles.fontFamily || 'Consolas, Monaco, monospace';
            clone.style.fontSize = srcStyles.fontSize || '13px';
            clone.style.lineHeight = srcStyles.lineHeight || '1.5';

            contentWrapper.appendChild(clone);
            section.appendChild(contentWrapper);
            return section;
        };

        const reqSection = makeSection('Request', requestEditor);
        const resSection = makeSection('Response', responseContentNode);

        wrapper.appendChild(reqSection);
        wrapper.appendChild(resSection);
        document.body.appendChild(wrapper);

        // Let layout settle and render to a canvas
        const canvas = await html2canvas(wrapper, {
            backgroundColor: wrapper.style.background,
            scrollX: 0,
            scrollY: 0,
        });

        document.body.removeChild(wrapper);

        // Open the annotation editor so user can highlight/redact before exporting
        openScreenshotEditor(canvas);
    } catch (error) {
        console.error('Screenshot capture failed:', error);
        alert(`Screenshot failed: ${error.message}`);
    }
}

function openScreenshotEditor(imageCanvas) {
    const modal = document.getElementById('screenshot-editor-modal');
    const canvas = document.getElementById('screenshot-editor-canvas');
    const highlightBtn = document.getElementById('screenshot-tool-highlight');
    const redactBtn = document.getElementById('screenshot-tool-redact');
    const undoBtn = document.getElementById('screenshot-tool-undo');
    const redoBtn = document.getElementById('screenshot-tool-redo');
    const downloadBtn = document.getElementById('screenshot-download-btn');
    const closeBtn = document.getElementById('screenshot-editor-close');
    const zoomInBtn = document.getElementById('screenshot-zoom-in');
    const zoomOutBtn = document.getElementById('screenshot-zoom-out');
    const zoomValueEl = document.getElementById('screenshot-zoom-value');

    if (!modal || !canvas || !highlightBtn || !redactBtn || !undoBtn || !downloadBtn || !closeBtn) {
        console.warn('Screenshot editor elements missing');
        // Fallback: just download the raw screenshot
        imageCanvas.toBlob((blob) => {
            if (!blob) {
                alert('Failed to generate screenshot image.');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `rep-request-response-${timestamp}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        alert('Canvas context not available.');
        return;
    }

    // Resize canvas to match the captured image (internal resolution)
    canvas.width = imageCanvas.width;
    canvas.height = imageCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageCanvas, 0, 0);

    // Annotation state
    let currentTool = 'highlight'; // 'highlight' | 'redact'
    let isDragging = false;
    let dragMode = null; // 'draw' | 'move' | 'resize'
    let dragStartX = 0;
    let dragStartY = 0;
    let lastX = 0;
    let lastY = 0;
    let currentDraftShape = null;
    let selectedShape = null;
    let activeHandle = null; // which corner/edge is being resized

    // Shapes are stored as logical rectangles over the base image
    const shapes = [];
    const undoStack = [];
    const redoStack = [];

    let currentZoom = 1;

    const cloneShape = (shape) => ({
        type: shape.type,
        x: shape.x,
        y: shape.y,
        w: shape.w,
        h: shape.h,
    });

    const pushUndoSnapshot = () => {
        try {
            undoStack.push(shapes.map(cloneShape));
            // New action invalidates redo history
            redoStack.length = 0;
        } catch (e) {
            console.warn('Unable to save state for undo', e);
        }
    };

    // Seed undo stack with empty shapes list
    pushUndoSnapshot();

    const setActiveTool = (tool) => {
        currentTool = tool;
        highlightBtn.classList.toggle('active', tool === 'highlight');
        redactBtn.classList.toggle('active', tool === 'redact');
    };

    const applyZoom = (zoom) => {
        currentZoom = Math.max(0.5, Math.min(3, zoom));
        canvas.style.transform = `scale(${currentZoom})`;
        canvas.style.transformOrigin = 'top left';
        if (zoomValueEl) {
            zoomValueEl.textContent = `${Math.round(currentZoom * 100)}%`;
        }
    };

    const drawShape = (shape, opts = {}) => {
        const { isDraft = false, isSelected = false } = opts;
        const x = shape.x;
        const y = shape.y;
        const w = shape.w;
        const h = shape.h;

        if (shape.type === 'highlight') {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.35)';
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
            ctx.lineWidth = 2;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        } else if (shape.type === 'redact') {
            ctx.fillStyle = '#000000';
            ctx.fillRect(x, y, w, h);
        }

        // Selection outline and resize handles
        if (isSelected && !isDraft) {
            ctx.save();
            ctx.strokeStyle = 'rgba(138, 180, 248, 0.9)';
            ctx.setLineDash([4, 2]);
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
            ctx.setLineDash([]);

            const handleSize = 6;
            const half = handleSize / 2;
            const points = [
                [x, y],                 // tl
                [x + w / 2, y],         // t
                [x + w, y],             // tr
                [x + w, y + h / 2],     // r
                [x + w, y + h],         // br
                [x + w / 2, y + h],     // b
                [x, y + h],             // bl
                [x, y + h / 2],         // l
            ];
            ctx.fillStyle = 'rgba(138, 180, 248, 1)';
            points.forEach(([px, py]) => {
                ctx.fillRect(px - half, py - half, handleSize, handleSize);
            });
            ctx.restore();
        }
    };

    const renderAll = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageCanvas, 0, 0);

        shapes.forEach((shape) => {
            const isSel = selectedShape && shape === selectedShape;
            drawShape(shape, { isSelected: isSel });
        });

        if (currentDraftShape) {
            drawShape(currentDraftShape, { isDraft: true });
        }
    };

    const getHandleAtPoint = (shape, x, y) => {
        const handleSize = 8;
        const half = handleSize / 2;
        const { x: sx, y: sy, w, h } = shape;
        const points = [
            { key: 'tl', x: sx, y: sy },
            { key: 't', x: sx + w / 2, y: sy },
            { key: 'tr', x: sx + w, y: sy },
            { key: 'r', x: sx + w, y: sy + h / 2 },
            { key: 'br', x: sx + w, y: sy + h },
            { key: 'b', x: sx + w / 2, y: sy + h },
            { key: 'bl', x: sx, y: sy + h },
            { key: 'l', x: sx, y: sy + h / 2 },
        ];
        for (const p of points) {
            if (Math.abs(x - p.x) <= half && Math.abs(y - p.y) <= half) {
                return p.key;
            }
        }
        return null;
    };

    const normalizeRect = (shape) => {
        let { x, y, w, h } = shape;
        if (w < 0) {
            x = x + w;
            w = -w;
        }
        if (h < 0) {
            y = y + h;
            h = -h;
        }
        return { ...shape, x, y, w, h };
    };

    const hitTestShape = (x, y) => {
        // Iterate from topmost shape
        for (let i = shapes.length - 1; i >= 0; i--) {
            const s = shapes[i];
            if (
                x >= s.x &&
                x <= s.x + s.w &&
                y >= s.y &&
                y <= s.y + s.h
            ) {
                return s;
            }
        }
        return null;
    };

    // Assign handlers (overwrite any previous ones)
    highlightBtn.onclick = () => setActiveTool('highlight');
    redactBtn.onclick = () => setActiveTool('redact');

    if (zoomInBtn) {
        zoomInBtn.onclick = () => applyZoom(currentZoom + 0.25);
    }
    if (zoomOutBtn) {
        zoomOutBtn.onclick = () => applyZoom(currentZoom - 0.25);
    }

    undoBtn.onclick = () => {
        if (undoStack.length > 1) {
            const current = undoStack.pop();
            // Save current state to redo stack
            try {
                redoStack.push(current);
            } catch (e) {
                console.warn('Unable to save state for redo', e);
            }
            const last = undoStack[undoStack.length - 1];
            shapes.length = 0;
            last.forEach((s) => shapes.push(cloneShape(s)));
            selectedShape = null;
            renderAll();
        }
    };

    if (redoBtn) {
        redoBtn.onclick = () => {
            if (redoStack.length > 0) {
                const state = redoStack.pop();
                if (state) {
                    try {
                        undoStack.push(state);
                    } catch (e) {
                        console.warn('Unable to save state for undo during redo', e);
                    }
                    shapes.length = 0;
                    state.forEach((s) => shapes.push(cloneShape(s)));
                    selectedShape = null;
                    renderAll();
                }
            }
        };
    }

    // Keyboard handler for deleting selected annotation with Delete / Backspace
    const onKeyDown = (event) => {
        if (!selectedShape) return;
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            const idx = shapes.indexOf(selectedShape);
            if (idx !== -1) {
                shapes.splice(idx, 1);
                selectedShape = null;
                pushUndoSnapshot();
                renderAll();
            }
        }
    };

    const closeModal = () => {
        modal.style.display = 'none';
        // Clean up handlers so they don't leak references
        canvas.onmousedown = null;
        canvas.onmousemove = null;
        canvas.onmouseup = null;
        canvas.onmouseleave = null;
        highlightBtn.onclick = null;
        redactBtn.onclick = null;
        undoBtn.onclick = null;
        if (redoBtn) redoBtn.onclick = null;
        downloadBtn.onclick = null;
        closeBtn.onclick = null;
        if (zoomInBtn) zoomInBtn.onclick = null;
        if (zoomOutBtn) zoomOutBtn.onclick = null;
        document.removeEventListener('keydown', onKeyDown);
    };

    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };

    downloadBtn.onclick = () => {
        // Ensure we render the latest shapes into the canvas before export
        renderAll();
        canvas.toBlob((blob) => {
            if (!blob) {
                alert('Failed to generate screenshot image.');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `rep-request-response-${timestamp}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
        closeModal();
    };

    const getCanvasCoords = (event) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    };

    const onMouseDown = (event) => {
        const { x, y } = getCanvasCoords(event);
        dragStartX = x;
        dragStartY = y;
        lastX = x;
        lastY = y;
        isDragging = true;
        activeHandle = null;
        currentDraftShape = null;

        const hitShape = hitTestShape(x, y);
        if (hitShape) {
            selectedShape = hitShape;
            // Check if near a resize handle
            const handle = getHandleAtPoint(hitShape, x, y);
            if (handle) {
                dragMode = 'resize';
                activeHandle = handle;
            } else {
                dragMode = 'move';
            }
        } else {
            // Start drawing a new shape
            dragMode = 'draw';
            const shape = {
                type: currentTool,
                x,
                y,
                w: 0,
                h: 0,
            };
            currentDraftShape = shape;
            selectedShape = null;
        }

        renderAll();
    };

    const onMouseMove = (event) => {
        if (!isDragging) return;
        const { x, y } = getCanvasCoords(event);
        const dx = x - lastX;
        const dy = y - lastY;
        lastX = x;
        lastY = y;

        if (dragMode === 'draw' && currentDraftShape) {
            currentDraftShape.w = x - dragStartX;
            currentDraftShape.h = y - dragStartY;
        } else if (dragMode === 'move' && selectedShape) {
            selectedShape.x += dx;
            selectedShape.y += dy;
        } else if (dragMode === 'resize' && selectedShape && activeHandle) {
            const s = selectedShape;
            const right = s.x + s.w;
            const bottom = s.y + s.h;
            let newX = s.x;
            let newY = s.y;
            let newRight = right;
            let newBottom = bottom;

            if (activeHandle.includes('l')) {
                newX = x;
            }
            if (activeHandle.includes('r')) {
                newRight = x;
            }
            if (activeHandle.includes('t')) {
                newY = y;
            }
            if (activeHandle.includes('b')) {
                newBottom = y;
            }

            s.x = Math.min(newX, newRight);
            s.y = Math.min(newY, newBottom);
            s.w = Math.abs(newRight - newX);
            s.h = Math.abs(newBottom - newY);
        }

        renderAll();
    };

    const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;

        if (dragMode === 'draw' && currentDraftShape) {
            const normalized = normalizeRect(currentDraftShape);
            // Ignore tiny shapes
            if (normalized.w > 2 && normalized.h > 2) {
                shapes.push(normalized);
                selectedShape = shapes[shapes.length - 1];
                pushUndoSnapshot();
            }
            currentDraftShape = null;
        } else if ((dragMode === 'move' || dragMode === 'resize') && selectedShape) {
            pushUndoSnapshot();
        }

        dragMode = null;
        activeHandle = null;
        renderAll();
    };

    canvas.onmousedown = onMouseDown;
    canvas.onmousemove = onMouseMove;
    canvas.onmouseup = onMouseUp;
    canvas.onmouseleave = onMouseUp;

    document.addEventListener('keydown', onKeyDown);

    setActiveTool('highlight');
    applyZoom(1);
    renderAll();
    modal.style.display = 'block';
}

function getFilteredRequests() {
    return state.requests.filter(request => {
        const url = request.request.url;
        const urlLower = url.toLowerCase();
        const method = request.request.method.toUpperCase();

        let headersText = '';
        let headersTextLower = '';
        if (request.request.headers) {
            request.request.headers.forEach(header => {
                const headerLine = `${header.name}: ${header.value} `;
                headersText += headerLine;
                headersTextLower += headerLine.toLowerCase();
            });
        }

        let bodyText = '';
        let bodyTextLower = '';
        if (request.request.postData && request.request.postData.text) {
            bodyText = request.request.postData.text;
            bodyTextLower = bodyText.toLowerCase();
        }

        let matchesSearch = false;
        if (state.currentSearchTerm === '') {
            matchesSearch = true;
        } else if (state.useRegex) {
            try {
                const regex = new RegExp(state.currentSearchTerm);
                matchesSearch =
                    regex.test(url) ||
                    regex.test(method) ||
                    regex.test(headersText) ||
                    regex.test(bodyText);
            } catch (e) {
                matchesSearch = false;
            }
        } else {
            matchesSearch =
                urlLower.includes(state.currentSearchTerm) ||
                method.includes(state.currentSearchTerm.toUpperCase()) ||
                headersTextLower.includes(state.currentSearchTerm) ||
                bodyTextLower.includes(state.currentSearchTerm);
        }

        let matchesFilter = true;
        if (state.currentFilter !== 'all') {
            if (state.currentFilter === 'starred') {
                matchesFilter = request.starred;
            } else {
                matchesFilter = method === state.currentFilter;
            }
        }

        return matchesSearch && matchesFilter;
    });
}

export function exportRequests() {
    const requestsToExport = getFilteredRequests();

    if (requestsToExport.length === 0) {
        alert('No requests to export (check your filters).');
        return;
    }

    const exportData = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        requests: requestsToExport.map((req, index) => {
            const headersObj = {};
            req.request.headers.forEach(h => headersObj[h.name] = h.value);

            const resHeadersObj = {};
            if (req.response.headers) {
                req.response.headers.forEach(h => resHeadersObj[h.name] = h.value);
            }

            return {
                id: `req_${index + 1}`,
                method: req.request.method,
                url: req.request.url,
                headers: headersObj,
                body: req.request.postData ? req.request.postData.text : "",
                response: {
                    status: req.response.status,
                    headers: resHeadersObj,
                    body: req.response.content ? req.response.content.text : ""
                },
                timestamp: req.capturedAt
            };
        })
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rep_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function importRequests(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (!data.requests || !Array.isArray(data.requests)) {
                throw new Error('Invalid format: "requests" array missing.');
            }

            data.requests.forEach(item => {
                const headersArr = [];
                if (item.headers) {
                    for (const [key, value] of Object.entries(item.headers)) {
                        headersArr.push({ name: key, value: value });
                    }
                }

                const resHeadersArr = [];
                if (item.response && item.response.headers) {
                    for (const [key, value] of Object.entries(item.response.headers)) {
                        resHeadersArr.push({ name: key, value: value });
                    }
                }

                const newReq = {
                    request: {
                        method: item.method || 'GET',
                        url: item.url || '',
                        headers: headersArr,
                        postData: { text: item.body || '' }
                    },
                    response: {
                        status: item.response ? item.response.status : 0,
                        statusText: '',
                        headers: resHeadersArr,
                        content: { text: item.response ? item.response.body : '' }
                    },
                    capturedAt: item.timestamp || Date.now(),
                    starred: false
                };

                state.requests.push(newReq);
                renderRequestItem(newReq, state.requests.length - 1);
            });

            alert(`Imported ${data.requests.length} requests.`);

        } catch (error) {
            console.error('Import error:', error);
            alert('Failed to import: ' + error.message);
        }
    };
    reader.readAsText(file);
}

