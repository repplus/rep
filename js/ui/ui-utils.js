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
    updateHistoryButtons();
}

export function setupResizeHandle() {
    const resizeHandle = document.querySelector('.pane-resize-handle');
    const requestPane = document.querySelector('.request-pane');
    const responsePane = document.querySelector('.response-pane');
    const container = document.querySelector('.main-content');

    if (!resizeHandle || !requestPane || !responsePane) return;

    if (!requestPane.style.flex || requestPane.style.flex === '') {
        requestPane.style.flex = '1';
        responsePane.style.flex = '1';
    }

    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('resizing');
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
            let percentage = (offsetX / containerWidth) * 100;
            percentage = Math.max(20, Math.min(80, percentage));

            requestPane.style.flex = `0 0 ${percentage}%`;
            responsePane.style.flex = `0 0 ${100 - percentage}%`;
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
        if (item) {
            e.stopPropagation();
            const action = item.dataset.action;
            if (action && action !== 'mark-payload') {
                handleEncodeDecode(action);
                hideContextMenu();
            }
        }
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
    elements.contextMenu.dataset.target = targetElement === elements.rawRequestInput ? 'request' : 'response';

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
        wrapper.style.flexDirection = 'row'; // side by side
        wrapper.style.gap = '16px';
        wrapper.style.fontFamily = getComputedStyle(document.body).fontFamily || 'monospace';

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

            // Explicitly preserve multi-line layout and font from the original,
            // even after we remove the id (so id-based CSS no longer applies).
            const srcStyles = getComputedStyle(sourceNode);
            clone.style.whiteSpace = srcStyles.whiteSpace || 'pre-wrap';
            clone.style.wordBreak = srcStyles.wordBreak || 'break-all';
            clone.style.overflowWrap = srcStyles.overflowWrap || 'break-word';
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

        // Let layout settle
        const canvas = await html2canvas(wrapper, {
            backgroundColor: wrapper.style.background,
            scrollX: 0,
            scrollY: 0,
        });

        document.body.removeChild(wrapper);

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
    } catch (error) {
        console.error('Screenshot capture failed:', error);
        alert(`Screenshot failed: ${error.message}`);
    }
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

