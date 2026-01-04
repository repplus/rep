// LLM Chat Feature - Interactive chat with LLM for request manipulation
import { getAISettings, streamChatWithMessages } from '../ai/core.js';
import { state, actions } from '../../core/state.js';
import { events, EVENT_NAMES } from '../../core/events.js';
import { formatRawResponse } from '../../network/response-parser.js';
import { highlightHTTP } from '../../core/utils/network.js';
import { elements } from '../../ui/main-ui.js';

let chatHistory = [];
let isStreaming = false;
let lastSelectedRequestIndex = -1; // Track last selected request to prevent duplicate messages
let responseHistory = []; // Track all responses for the current request (in chronological order)
let lastTrackedResponse = null; // Track the last response we've seen to detect new ones
let chatTokenEstimateElement = null; // Reference to token estimate element

// Per-request chat history storage
let chatHistoryByRequest = new Map(); // Map<requestIndex, chatHistory[]>
let referencedRequests = new Set(); // Set of request indices to include in context

// Token optimization constants
const MAX_RESPONSE_HISTORY = 2; // Only keep last 2 responses (original + 1 resend)
const MAX_RESPONSE_TOKENS = 1500; // ~6KB of text (roughly 1500 tokens)
const MAX_CHAT_HISTORY = 15; // Keep last 15 messages (reduced from 20)
const TOKEN_ESTIMATE_CHARS = 4; // Rough estimate: 1 token ≈ 4 characters

const SYSTEM_PROMPT = `You are a helpful assistant for working with HTTP requests and responses. You have access to the currently selected request and response, which will be provided in the conversation context.

You can help with:
- Security testing and penetration testing (identifying vulnerabilities, attack vectors, security improvements)
- Understanding and explaining requests/responses
- Modifying requests (headers, body, parameters)
- Debugging issues
- Testing different scenarios
- Any other questions about the HTTP request/response

When the user asks you to modify a request, provide the modified request in a code block using \`\`\`http or \`\`\`request format. 

Important technical requirements:
- Request line format: METHOD PATH HTTP/VERSION (use path only, not full URL)
  Example: POST /api/users HTTP/1.1 (not POST http://example.com/api/users HTTP/1.1)
- When providing a full request, include all headers and the body
- Preserve the existing request structure when making modifications

Be friendly, helpful, and clear in your explanations.`;

function formatRequestForContext(request) {
    if (!request || !request.request) return '';
    
    const req = request.request;
    let formatted = `${req.method} ${req.url} ${req.httpVersion || 'HTTP/1.1'}\n`;
    
    if (req.headers) {
        // Handle both array and object formats
        if (Array.isArray(req.headers)) {
            req.headers.forEach(h => {
                if (h && h.name) formatted += `${h.name}: ${h.value ?? ''}\n`;
            });
        } else {
            Object.entries(req.headers).forEach(([key, value]) => {
                formatted += `${key}: ${value}\n`;
            });
        }
    }
    
    formatted += '\n';
    
    if (req.postData && req.postData.text) {
        formatted += req.postData.text;
    }
    
    return formatted;
}

function formatResponseForContext(request) {
    if (!request || !request.response) return '';
    
    try {
        return formatRawResponse(request.response);
    } catch (e) {
        // Fallback to basic formatting
        const resp = request.response;
        if (!resp) return '';
        
        let formatted = `${resp.status} ${resp.statusText || ''}\n`;
        
        if (resp.headers) {
            Object.entries(resp.headers).forEach(([key, value]) => {
                formatted += `${key}: ${value}\n`;
            });
        }
        
        if (resp.content && resp.content.text) {
            formatted += `\n${resp.content.text}`;
        }
        
        return formatted;
    }
}

/**
 * Summarize previous chat history for context
 * @param {Array} prevChat - Previous chat history array
 * @returns {string} Summary of the previous investigation
 */
function summarizePreviousChat(prevChat) {
    if (!prevChat || prevChat.length === 0) return 'No previous conversation.';
    
    // Extract key findings from assistant messages
    const assistantMessages = prevChat.filter(msg => msg.role === 'assistant');
    if (assistantMessages.length === 0) return 'Previous conversation had no assistant responses.';
    
    // Get the last assistant message as summary (most relevant)
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    const summary = lastAssistant.content.substring(0, 200); // First 200 chars
    
    return summary + (lastAssistant.content.length > 200 ? '...' : '');
}

function buildUserPrompt(userMessage, request) {
    let prompt = userMessage;
    
    if (request && request.request) {
        // Add referenced previous requests if any
        if (referencedRequests.size > 0) {
            prompt += '\n\n--- Related Requests (from previous investigation) ---\n';
            const currentIndex = state.requests.indexOf(request);
            
            for (const reqIndex of referencedRequests) {
                if (reqIndex === currentIndex) continue; // Skip current request
                if (reqIndex < 0 || reqIndex >= state.requests.length) continue;
                
                const prevReq = state.requests[reqIndex];
                const prevChat = chatHistoryByRequest.get(reqIndex);
                
                if (prevReq && prevReq.request) {
                    const method = prevReq.request.method || 'GET';
                    const url = new URL(prevReq.request.url);
                    const path = url.pathname;
                    
                    prompt += `\nRequest #${reqIndex + 1}: ${method} ${path}\n`;
                    prompt += `Previous findings: ${summarizePreviousChat(prevChat || [])}\n`;
                }
            }
        }
        
        // Get the current request from the editor (may be modified)
        const currentRequestFromEditor = elements.rawRequestInput ? 
            (elements.rawRequestInput.innerText || elements.rawRequestInput.textContent || '').trim() : '';
        
        // Get the original captured request
        const originalRequest = formatRequestForContext(request);
        
        // Check if the request has been modified
        const isModified = currentRequestFromEditor && 
                          currentRequestFromEditor !== originalRequest &&
                          currentRequestFromEditor.length > 0;
        
        if (isModified) {
            // Show both original and modified request for comparison
            prompt += '\n\n--- Original Request (Captured) ---\n';
            prompt += originalRequest;
            prompt += '\n\n--- Current Request (Modified in Editor) ---\n';
            prompt += currentRequestFromEditor;
        } else {
            // Show only the current request (not modified or editor is empty)
            prompt += '\n\n--- Current Request ---\n';
            prompt += currentRequestFromEditor || originalRequest;
        }
        
        // Check if we have a new response that we haven't tracked yet
        if (state.currentResponse && state.currentResponse !== lastTrackedResponse) {
            // Only add to history if it's different from the last one we tracked
            // and it's not the same as the original response
            const originalResponse = request.response ? formatResponseForContext(request) : null;
            if (state.currentResponse !== originalResponse && !responseHistory.includes(state.currentResponse)) {
                responseHistory.push(state.currentResponse);
                lastTrackedResponse = state.currentResponse;
                
                // Limit response history to MAX_RESPONSE_HISTORY (keep most recent)
                if (responseHistory.length > MAX_RESPONSE_HISTORY) {
                    responseHistory = responseHistory.slice(-MAX_RESPONSE_HISTORY);
                }
            }
        }
        
        // Check if user is asking about responses (conditional inclusion)
        const asksAboutResponse = /response|status|error|body|header|returned|received|result|output|answer|reply/i.test(userMessage);
        
        // Build complete response history for context (only if relevant)
        const allResponses = [];
        
        // Always include original response (it's usually needed for context)
        if (request.response) {
            const originalContent = formatResponseForContext(request);
            allResponses.push({
                type: 'original',
                label: 'Response #1 (Original - Captured)',
                content: truncateResponse(originalContent, MAX_RESPONSE_TOKENS)
            });
        }
        
        // Only include response history if user is asking about responses OR if there's only 1-2 responses
        // This prevents token bloat when user is just modifying requests
        const shouldIncludeAllResponses = asksAboutResponse || responseHistory.length <= 1;
        
        if (shouldIncludeAllResponses) {
            // Add all responses from history (from resends) - already limited to MAX_RESPONSE_HISTORY
            responseHistory.forEach((response, index) => {
                allResponses.push({
                    type: 'resend',
                    label: `Response #${allResponses.length + 1} (After Resend ${index + 1})`,
                    content: truncateResponse(response, MAX_RESPONSE_TOKENS)
                });
            });
            
            // Add current response if it's new (not yet in history and different from original)
            if (state.currentResponse) {
                const originalContent = request.response ? formatResponseForContext(request) : null;
                const isInHistory = responseHistory.includes(state.currentResponse);
                const isOriginal = originalContent && state.currentResponse === originalContent;
                
                if (!isInHistory && !isOriginal) {
                    allResponses.push({
                        type: 'current',
                        label: `Response #${allResponses.length + 1} (Latest)`,
                        content: truncateResponse(state.currentResponse, MAX_RESPONSE_TOKENS)
                    });
                }
            }
        } else {
            // User not asking about responses - only include the latest one if available
            const latestResponse = state.currentResponse || 
                                 (responseHistory.length > 0 ? responseHistory[responseHistory.length - 1] : null);
            if (latestResponse) {
                allResponses.push({
                    type: 'latest',
                    label: 'Latest Response',
                    content: truncateResponse(latestResponse, MAX_RESPONSE_TOKENS)
                });
            }
        }
        
        // Show responses in sequence (only if we have any)
        if (allResponses.length > 0) {
            if (allResponses.length === 1) {
                prompt += `\n\n--- ${allResponses[0].label} ---\n`;
                prompt += allResponses[0].content;
            } else {
                prompt += '\n\n--- Response History (in chronological order) ---\n';
                allResponses.forEach((resp, index) => {
                    prompt += `\n${resp.label}:\n${resp.content}`;
                    if (index < allResponses.length - 1) {
                        prompt += '\n---\n';
                    }
                });
            }
        }
    }
    
    return prompt;
}

/**
 * Truncate large text to limit token usage
 * @param {string} text - Text to truncate
 * @param {number} maxTokens - Maximum tokens (default: MAX_RESPONSE_TOKENS)
 * @returns {string} Truncated text with indicator
 */
function truncateResponse(text, maxTokens = MAX_RESPONSE_TOKENS) {
    if (!text || typeof text !== 'string') return text;
    
    // Rough estimate: 1 token ≈ 4 characters
    const maxChars = maxTokens * TOKEN_ESTIMATE_CHARS;
    
    if (text.length <= maxChars) return text;
    
    // Try to truncate at a logical point (newline, space, etc.)
    const truncated = text.substring(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    const lastSpace = truncated.lastIndexOf(' ');
    
    // Prefer newline if it's within 80% of max, otherwise use space
    const cutoff = lastNewline > maxChars * 0.8 ? lastNewline : 
                   (lastSpace > maxChars * 0.8 ? lastSpace : maxChars);
    
    return truncated.substring(0, cutoff) + '\n\n[... response truncated for token efficiency ...]';
}

/**
 * Estimate token count for text
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / TOKEN_ESTIMATE_CHARS);
}

/**
 * Update token estimate display
 * @param {number} tokenCount - Estimated token count
 */
function updateTokenEstimate(tokenCount) {
    if (!chatTokenEstimateElement) return;
    
    if (tokenCount > 0) {
        chatTokenEstimateElement.textContent = `~${tokenCount.toLocaleString()} tokens`;
        chatTokenEstimateElement.style.display = 'inline-block';
        
        // Add warning class for high token usage
        if (tokenCount > 10000) {
            chatTokenEstimateElement.classList.add('token-warning');
            chatTokenEstimateElement.classList.remove('token-medium');
        } else if (tokenCount > 5000) {
            chatTokenEstimateElement.classList.add('token-medium');
            chatTokenEstimateElement.classList.remove('token-warning');
        } else {
            chatTokenEstimateElement.classList.remove('token-warning', 'token-medium');
        }
    } else {
        chatTokenEstimateElement.style.display = 'none';
    }
}

function addMessageToHistory(role, content) {
    chatHistory.push({ role, content, timestamp: Date.now() });
    
    // Keep last N messages to avoid token limits
    if (chatHistory.length > MAX_CHAT_HISTORY) {
        chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY);
    }
    
    // Also save to per-request history
    if (state.selectedRequest) {
        const requestIndex = state.requests.indexOf(state.selectedRequest);
        if (requestIndex !== -1) {
            if (!chatHistoryByRequest.has(requestIndex)) {
                chatHistoryByRequest.set(requestIndex, []);
            }
            const requestHistory = chatHistoryByRequest.get(requestIndex);
            requestHistory.push({ role, content, timestamp: Date.now() });
            
            // Limit per-request history too
            if (requestHistory.length > MAX_CHAT_HISTORY) {
                requestHistory.splice(0, requestHistory.length - MAX_CHAT_HISTORY);
            }
        }
    }
}

function clearChatHistory() {
    chatHistory = [];
    // Don't clear per-request history, just current session
}

function loadChatHistoryForRequest(requestIndex) {
    if (requestIndex === -1 || !chatHistoryByRequest.has(requestIndex)) {
        chatHistory = [];
        return;
    }
    
    // Load the stored history for this request
    const storedHistory = chatHistoryByRequest.get(requestIndex);
    chatHistory = storedHistory.map(msg => ({ ...msg })); // Deep copy
}

/**
 * Compress old conversation history to reduce tokens
 * Keeps first 2 messages (context) and last N messages (recent)
 */
function compressChatHistory() {
    if (chatHistory.length <= MAX_CHAT_HISTORY) {
        return chatHistory;
    }
    
    // Keep first 2 messages for context, last (MAX_CHAT_HISTORY - 3) for recent
    // Middle messages get summarized
    const keepRecent = MAX_CHAT_HISTORY - 3;
    const oldest = chatHistory.slice(0, 2);
    const recent = chatHistory.slice(-keepRecent);
    const middle = chatHistory.slice(2, -keepRecent);
    
    if (middle.length > 0) {
        // Create a summary message for the middle section
        const summary = {
            role: 'system',
            content: `[Previous conversation: ${middle.length} messages about request modification, testing, and analysis]`,
            timestamp: Date.now()
        };
        
        return [...oldest, summary, ...recent];
    }
    
    return chatHistory;
}

function getConversationMessages() {
    // Build conversation from history, starting with system prompt
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    
    // Compress history if needed
    const compressedHistory = compressChatHistory();
    
    // Add conversation history
    compressedHistory.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
    });
    
    return messages;
}

async function sendChatMessage(userMessage, loadingElement, onUpdate, onComplete, onError) {
    if (isStreaming) {
        onError('Please wait for the current message to complete.');
        return;
    }
    
    const request = state.selectedRequest;
    if (!request) {
        onError('No request selected. Please select a request first.');
        return;
    }
    
    const settings = getAISettings();
    if (!settings.apiKey) {
        onError('AI API key not configured. Please configure it in settings.');
        return;
    }
    
    isStreaming = true;
    
    try {
        // Build the full user prompt with request context
        const fullUserPrompt = buildUserPrompt(userMessage, request);
        
        // Build proper message array for rolling context
        // Start with system prompt
        const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
        
        // Compress and add conversation history (previous turns)
        const compressedHistory = compressChatHistory();
        compressedHistory.forEach(msg => {
            messages.push({ role: msg.role, content: msg.content });
        });
        
        // Add current user message with full context
        messages.push({ role: 'user', content: fullUserPrompt });
        
        // Calculate and display token estimate
        const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
        updateTokenEstimate(totalTokens);
        
        // Add user message to history (for next turn) - use original message, not full prompt
        addMessageToHistory('user', userMessage);
        
        let assistantResponse = '';
        
        // Use proper message array for rolling context
        await streamChatWithMessages(
            settings.apiKey,
            settings.model,
            messages,
            (text) => {
                assistantResponse = text;
                // Update the loading element with markdown if available
                if (loadingElement) {
                    if (window.marked && window.marked.parse) {
                        try {
                            // Prepare markdown for streaming (handle incomplete code blocks)
                            const preparedText = prepareMarkdownForStreaming(text);
                            // Always parse markdown during streaming to show rendered content
                            const parsed = window.marked.parse(preparedText);
                            if (parsed && typeof parsed === 'string') {
                                loadingElement.innerHTML = parsed;
                                // Apply syntax highlighting to code blocks if highlight.js is available
                                if (window.hljs) {
                                    loadingElement.querySelectorAll('pre code').forEach((block) => {
                                        if (!block.classList.contains('hljs')) {
                                            try {
                                                window.hljs.highlightElement(block);
                                            } catch (e) {
                                                // Ignore highlighting errors during streaming
                                            }
                                        }
                                    });
                                }
                            } else {
                                // If parsing returns something unexpected, try direct parse
                                loadingElement.innerHTML = window.marked.parse(text);
                                if (window.hljs) {
                                    loadingElement.querySelectorAll('pre code').forEach((block) => {
                                        if (!block.classList.contains('hljs')) {
                                            try {
                                                window.hljs.highlightElement(block);
                                            } catch (e) {
                                                // Ignore highlighting errors
                                            }
                                        }
                                    });
                                }
                            }
                        } catch (e) {
                            // If parsing fails, try without preparation
                            try {
                                loadingElement.innerHTML = window.marked.parse(text);
                                if (window.hljs) {
                                    loadingElement.querySelectorAll('pre code').forEach((block) => {
                                        if (!block.classList.contains('hljs')) {
                                            try {
                                                window.hljs.highlightElement(block);
                                            } catch (e) {
                                                // Ignore highlighting errors
                                            }
                                        }
                                    });
                                }
                            } catch (e2) {
                                // Even on error, try to escape and show as HTML to avoid raw markdown
                                const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                loadingElement.innerHTML = escaped.replace(/\n/g, '<br>');
                            }
                        }
                    } else {
                        // Marked not available - escape and show as HTML
                        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        loadingElement.innerHTML = escaped.replace(/\n/g, '<br>');
                    }
                }
                onUpdate(text);
            },
            settings.provider
        );
        
        // Add assistant response to history
        addMessageToHistory('assistant', assistantResponse);
        
        onComplete(assistantResponse);
    } catch (error) {
        console.error('Chat error:', error);
        onError(error.message || 'Failed to send message. Please check your API key and try again.');
    } finally {
        isStreaming = false;
    }
}

export function setupLLMChat(elements) {
    // Configure marked.js to use highlight.js for syntax highlighting
    if (window.marked && window.hljs) {
        window.marked.setOptions({
            highlight: function(code, lang) {
                if (lang && window.hljs.getLanguage(lang)) {
                    try {
                        return window.hljs.highlight(code, { language: lang }).value;
                    } catch (err) {
                        console.warn('Highlight.js error:', err);
                    }
                }
                // Fallback: auto-detect language or highlight as plain text
                try {
                    return window.hljs.highlightAuto(code).value;
                } catch (err) {
                    return window.hljs.highlight(code, { language: 'plaintext' }).value;
                }
            },
            langPrefix: 'hljs language-'
        });
    }
    
    const chatPane = document.getElementById('llm-chat-pane');
    const chatToggleBtn = document.getElementById('llm-chat-toggle-btn');
    const chatCloseBtn = document.getElementById('llm-chat-close-btn');
    const chatResizeHandle = document.querySelector('.chat-resize-handle');
    const chatMessages = document.getElementById('llm-chat-messages');
    const chatInput = document.getElementById('llm-chat-input');
    const chatTokenEstimate = document.getElementById('llm-chat-token-estimate');
    
    // Store reference at module level for updateTokenEstimate function
    chatTokenEstimateElement = chatTokenEstimate;
    const chatSendBtn = document.getElementById('llm-chat-send-btn');
    const chatClearBtn = document.getElementById('llm-chat-clear-btn');
    const chatRequestBadge = document.getElementById('llm-chat-request-badge');
    
    if (!chatPane) {
        console.error('LLM Chat: Chat pane not found');
        return;
    }
    
    if (!chatToggleBtn) {
        console.error('LLM Chat: Toggle button not found');
        return;
    }
    
    // Initialize chat pane to be hidden by default
    const responsePane = document.querySelector('.response-pane');
    const requestPane = document.querySelector('.request-pane');
    if (chatPane) {
        chatPane.style.display = 'none';
    }
    if (chatResizeHandle) {
        chatResizeHandle.style.display = 'none';
    }
    
    // Toggle chat pane visibility
    chatToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Check if pane is visible (not 'none' and not empty string)
        const currentDisplay = chatPane.style.display || window.getComputedStyle(chatPane).display;
        const isVisible = currentDisplay !== 'none';
        
        if (isVisible) {
            // Hide chat pane
            chatPane.style.display = 'none';
            if (chatResizeHandle) chatResizeHandle.style.display = 'none';
            // Remove active class (toggle off - no glow)
            chatToggleBtn.classList.remove('active');
            // Reset to 50/50 split between request and response
            if (requestPane && responsePane) {
                requestPane.style.flex = '1';
                responsePane.style.flex = '1';
            }
        } else {
            // Show chat pane
            chatPane.style.display = 'flex';
            if (chatResizeHandle) chatResizeHandle.style.display = 'block';
            // Add active class (toggle on - with glow)
            chatToggleBtn.classList.add('active');
            // Set equal widths for all three panes: 33.33% each
            if (requestPane && responsePane && chatPane) {
                requestPane.style.flex = '0 0 33.33%';
                responsePane.style.flex = '0 0 33.33%';
                chatPane.style.flex = '0 0 33.33%';
            }
            if (chatInput) {
                setTimeout(() => chatInput.focus(), 100);
            }
            // Clear chat when opening if no request is selected
            if (!state.selectedRequest) {
                clearChatHistory();
                if (chatMessages) {
                    chatMessages.innerHTML = '<div class="chat-message chat-message-system">Select a request to start chatting with the LLM about it.</div>';
                }
            }
        }
    });
    
    // Close chat pane
    if (chatCloseBtn) {
        chatCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chatPane.style.display = 'none';
            if (chatResizeHandle) chatResizeHandle.style.display = 'none';
            // Remove active class (toggle off - no glow)
            if (chatToggleBtn) chatToggleBtn.classList.remove('active');
            // Re-enable request/response resize handle when chat is closed
            const requestResponseResizeHandle = document.querySelector('.pane-resize-handle:not(.chat-resize-handle)');
            if (requestResponseResizeHandle) {
                requestResponseResizeHandle.style.pointerEvents = '';
                requestResponseResizeHandle.style.opacity = '';
            }
            // Reset to 50/50 split between request and response
            if (requestPane && responsePane) {
                requestPane.style.flex = '1';
                responsePane.style.flex = '1';
            }
        });
    }
    
    // Setup resize handle for chat pane
    if (chatResizeHandle && chatPane) {
        let isResizing = false;
        let requestPaneFixedWidth = null; // Store fixed request pane width when starting resize
        const responsePane = document.querySelector('.response-pane');
        const requestPane = document.querySelector('.request-pane');
        
        chatResizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent triggering request/response resize
            isResizing = true;
            chatResizeHandle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            
            // Store the current request pane width to keep it fixed during resize
            if (requestPane) {
                const requestRect = requestPane.getBoundingClientRect();
                requestPaneFixedWidth = requestRect.width;
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing || !responsePane || !chatPane || !requestPane) return;
            
            const container = document.querySelector('.split-view-container');
            if (!container) return;
            
            const containerRect = container.getBoundingClientRect();
            
            // Use stored fixed width (from when resize started) to keep request pane fixed
            const requestWidth = requestPaneFixedWidth || requestPane.getBoundingClientRect().width;
            
            // Calculate available width (container width minus request pane width and resize handles)
            const requestResponseResizeHandle = document.querySelector('.pane-resize-handle:not(.chat-resize-handle)');
            const requestResponseResizeHandleWidth = requestResponseResizeHandle ? (requestResponseResizeHandle.offsetWidth || 5) : 5;
            const chatResizeHandleWidth = chatResizeHandle.offsetWidth || 5;
            const availableWidth = containerRect.width - requestWidth - requestResponseResizeHandleWidth - chatResizeHandleWidth;
            
            // Mouse position relative to the start of response pane (after request pane and its resize handle)
            const requestRect = requestPane.getBoundingClientRect();
            const offsetX = e.clientX - requestRect.right - requestResponseResizeHandleWidth;
            
            // Calculate percentages based on available space (not full container)
            const minResponsePx = 200;
            const minChatPx = 300;
            const clampedOffsetX = Math.min(
                Math.max(offsetX, minResponsePx),
                Math.max(availableWidth - minChatPx, minResponsePx)
            );
            
            // Calculate percentages of available space
            const responsePercentage = (clampedOffsetX / availableWidth) * 100;
            const chatPercentage = 100 - responsePercentage;
            
            // Keep request pane fixed at its stored width, only adjust response and chat
            // Convert to container percentages
            const requestPercentage = (requestWidth / containerRect.width) * 100;
            const remainingPercentage = 100 - requestPercentage;
            const responseContainerPercentage = (responsePercentage / 100) * remainingPercentage;
            const chatContainerPercentage = (chatPercentage / 100) * remainingPercentage;
            
            // Keep request pane fixed, only adjust response and chat
            requestPane.style.flex = `0 0 ${requestPercentage}%`;
            responsePane.style.flex = `0 0 ${responseContainerPercentage}%`;
            chatPane.style.flex = `0 0 ${chatContainerPercentage}%`;
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                requestPaneFixedWidth = null; // Clear fixed width when done resizing
                chatResizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }
    
    // Auto-resize textarea
    function autoResizeTextarea() {
        if (!chatInput) return;
        // Reset height to auto to get accurate scrollHeight
        chatInput.style.height = 'auto';
        // Calculate new height, ensuring it doesn't exceed max-height
        const newHeight = Math.max(28, Math.min(chatInput.scrollHeight, 200));
        chatInput.style.height = newHeight + 'px';
        
        // Ensure wrapper maintains proper height (padding top + bottom = 16px)
        const wrapper = chatInput.closest('.llm-chat-input-wrapper');
        if (wrapper) {
            wrapper.style.minHeight = (newHeight + 16) + 'px';
        }
    }
    
    // Update send button state
    function updateSendButtonState() {
        if (!chatInput || !chatSendBtn) return;
        const hasText = chatInput.value.trim().length > 0;
        chatSendBtn.disabled = !hasText;
    }
    
    // Send message
    function handleSend() {
        if (!chatInput || !chatMessages) return;
        
        const message = chatInput.value.trim();
        if (!message) return;
        
        if (!state.selectedRequest) {
            addSystemMessage('Please select a request first.');
            return;
        }
        
        // Add user message to UI
        addUserMessage(message);
        chatInput.value = '';
        autoResizeTextarea();
        updateSendButtonState();
        
        // Show loading state
        const loadingId = addAssistantMessage('', true);
        const loadingElement = document.getElementById(loadingId);
        
        // Send to LLM
        sendChatMessage(
            message,
            loadingElement, // Pass loading element for updates
            (text) => {
                // Update streaming response - markdown is handled in sendChatMessage
                // Auto-scroll during streaming
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            },
            (fullText) => {
                // Complete - final markdown update
                if (loadingElement) {
                    loadingElement.classList.remove('loading');
                    // Clear any pending timeout from streaming
                    if (loadingElement._copyButtonTimeout) {
                        clearTimeout(loadingElement._copyButtonTimeout);
                        delete loadingElement._copyButtonTimeout;
                    }
                    if (window.marked) {
                        try {
                            loadingElement.innerHTML = window.marked.parse(fullText);
                            // Add copy buttons to code blocks after markdown is parsed (final update)
                            addCopyButtonsToCodeBlocks(loadingElement);
                        } catch (e) {
                            loadingElement.textContent = fullText;
                        }
                    } else {
                        loadingElement.textContent = fullText;
                    }
                    
                    // Parse and apply modifications after message is complete
                    // Use the raw text (fullText) before markdown conversion
                    const suggestions = parseModificationSuggestions(fullText);
                    console.log('LLM Chat: Parsed suggestions from fullText:', suggestions.length, suggestions);
                    
                    // Get the user's original message to understand intent
                    const lastUserMessage = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1]?.content : '';
                    
                    // Check for explicit modification intent (must be action-oriented)
                    // More specific patterns that indicate actual modification requests
                    const modificationKeywords = /(?:modif|chang|updat|add|set|edit|alter|replace|test|try|send|resend|apply|inject|insert|remove|delete|update the|change the|modify the|add to|set header|edit header|update header|bypass|sql|sqli|xss|csrf|payload)/i;
                    const hasModificationIntent = modificationKeywords.test(fullText);
                    
                    // Check if user explicitly asked to modify/test the request
                    const userWantsModification = lastUserMessage && /(?:modif|chang|updat|add|set|edit|alter|test|try|send|resend|inject|insert|remove|delete|update the|change the|modify the|add to|set header|edit header|update header|bypass|sql|sqli|xss|csrf|payload)/i.test(lastUserMessage);
                    
                    // Check for purely informational/documentation intent (exclude these ONLY if no modification intent)
                    // If user wants to modify AND explain, prioritize modification
                    const informationalKeywords = /(?:generat|creat|writ|show|display|report|explain|analyze|describe|document|outline|summar|list|provide|give me|tell me|what|how does|why)/i;
                    const isPurelyInformational = !userWantsModification && !hasModificationIntent && informationalKeywords.test(lastUserMessage || '');
                    
                    // Only show buttons if:
                    // 1. There are suggestions found
                    // 2. AND it's NOT a purely informational request (like reports without modifications)
                    // 3. AND (the LLM used modification language OR the user explicitly asked for modifications)
                    const shouldShowButtons = suggestions.length > 0 
                        && !isPurelyInformational 
                        && (hasModificationIntent || userWantsModification);
                    
                    if (shouldShowButtons) {
                        // Sort suggestions: full_request first, then headers, then body
                        suggestions.sort((a, b) => {
                            const order = { 'full_request': 0, 'header': 1, 'body': 2, 'structured': 3 };
                            return (order[a.type] || 99) - (order[b.type] || 99);
                        });
                        
                        // Show buttons for all suggestions (no auto-apply)
                        const messageContainer = loadingElement.closest('.chat-message');
                        if (messageContainer) {
                            const actionsDiv = document.createElement('div');
                            actionsDiv.className = 'llm-chat-actions';
                            actionsDiv.innerHTML = '<div class="llm-chat-actions-label">Apply modifications:</div>';
                            
                            suggestions.forEach((suggestion) => {
                                const button = document.createElement('button');
                                button.className = 'llm-chat-apply-btn';
                                button.textContent = suggestion.type === 'full_request' 
                                    ? 'Apply Request Changes' 
                                    : suggestion.type === 'header'
                                    ? `Apply Header: ${suggestion.name}`
                                    : suggestion.type === 'body'
                                    ? 'Apply Body Changes'
                                    : 'Apply Changes';
                                
                                button.onclick = () => {
                                    if (applyRequestModification(suggestion)) {
                                        button.textContent = '✓ Applied';
                                        button.disabled = true;
                                        button.classList.add('applied');
                                    } else {
                                        button.textContent = '✗ Failed';
                                        button.classList.add('error');
                                        setTimeout(() => {
                                            button.textContent = button.textContent.replace('✗ Failed', 'Apply Changes');
                                            button.classList.remove('error');
                                        }, 2000);
                                    }
                                };
                                
                                actionsDiv.appendChild(button);
                            });
                            
                            messageContainer.appendChild(actionsDiv);
                        }
                    }
                }
                // Scroll to bottom
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            },
            (error) => {
                // Error
                if (loadingElement) {
                    loadingElement.classList.remove('loading');
                    loadingElement.textContent = `Error: ${error}`;
                    loadingElement.classList.add('error');
                }
                // Scroll to bottom to show error
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        );
    }
    
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', handleSend);
    }
    
    if (chatInput) {
        // Auto-resize on input
        chatInput.addEventListener('input', () => {
            autoResizeTextarea();
            updateSendButtonState();
        });
        
        // Handle Enter key (Shift+Enter for new line)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatInput.value.trim()) {
                    handleSend();
                }
            }
        });
        
        // Initial state
        updateSendButtonState();
    }
    
    // Clear chat
    if (chatClearBtn) {
        chatClearBtn.addEventListener('click', () => {
            // Save current chat history before clearing
            if (state.selectedRequest && lastSelectedRequestIndex !== -1) {
                chatHistoryByRequest.set(lastSelectedRequestIndex, [...chatHistory]);
            }
            
            clearChatHistory();
            referencedRequests.clear();
            updateReferenceUI();
            
            if (chatMessages) {
                chatMessages.innerHTML = '';
            }
            if (state.selectedRequest) {
                addSystemMessage('Chat cleared. How can I help you with this request?');
            } else {
                addSystemMessage('Select a request to start chatting. I can help you understand, modify, or debug HTTP requests and responses.');
            }
        });
    }
    
    // Function to update request badge in header
    function updateRequestBadge() {
        if (!chatRequestBadge) return;
        
        if (state.selectedRequest) {
            const request = state.selectedRequest.request;
            const method = request.method || 'GET';
            const url = new URL(request.url);
            const path = url.pathname.length > 30 
                ? url.pathname.substring(0, 27) + '...' 
                : url.pathname;
            const index = state.requests.indexOf(state.selectedRequest);
            
            chatRequestBadge.textContent = `#${index + 1} ${method} ${path}`;
            chatRequestBadge.style.display = 'inline-block';
        } else {
            chatRequestBadge.style.display = 'none';
        }
    }
    
    // Function to show a subtle context change notification
    function showFreshChatNotice() {
        if (!chatMessages) return;
        
        // Create a subtle notice that chat is fresh for this request
        const notice = document.createElement('div');
        notice.className = 'llm-chat-fresh-notice';
        notice.innerHTML = `
            <span>💬 Starting fresh chat for this request</span>
            <button class="llm-chat-notification-dismiss" onclick="this.parentElement.remove()">×</button>
        `;
        
        // Insert at the top of messages
        chatMessages.insertBefore(notice, chatMessages.firstChild);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (notice.parentElement) {
                notice.remove();
            }
        }, 5000);
    }
    
    function updateReferenceUI() {
        const referenceContainer = document.getElementById('llm-chat-reference-container');
        if (!referenceContainer) return;
        
        const currentIndex = state.requests.indexOf(state.selectedRequest);
        if (currentIndex === -1) {
            referenceContainer.style.display = 'none';
            return;
        }
        
        // Get all requests that have chat history (excluding current)
        const availableRequests = [];
        for (let i = 0; i < state.requests.length; i++) {
            if (i !== currentIndex && chatHistoryByRequest.has(i)) {
                const req = state.requests[i];
                const history = chatHistoryByRequest.get(i);
                if (req && req.request && history && history.length > 0) {
                    const method = req.request.method || 'GET';
                    const url = new URL(req.request.url);
                    const path = url.pathname.length > 40 ? url.pathname.substring(0, 37) + '...' : url.pathname;
                    availableRequests.push({
                        index: i,
                        method,
                        path,
                        messageCount: history.length
                    });
                }
            }
        }
        
        if (availableRequests.length === 0) {
            referenceContainer.style.display = 'none';
            return;
        }
        
        // Show the reference UI
        referenceContainer.style.display = 'block';
        const checkboxContainer = referenceContainer.querySelector('.llm-chat-reference-checkboxes');
        if (!checkboxContainer) return;
        
        // Clear existing checkboxes
        checkboxContainer.innerHTML = '';
        
        // Add checkboxes for each available request
        availableRequests.forEach(req => {
            const label = document.createElement('label');
            label.className = 'llm-chat-reference-item';
            label.innerHTML = `
                <input type="checkbox" value="${req.index}" ${referencedRequests.has(req.index) ? 'checked' : ''}>
                <span>#${req.index + 1} ${req.method} ${req.path} (${req.messageCount} msgs)</span>
            `;
            checkboxContainer.appendChild(label);
        });
        
        // Update checkboxes event listeners
        checkboxContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const reqIndex = parseInt(e.target.value, 10);
                if (e.target.checked) {
                    referencedRequests.add(reqIndex);
                } else {
                    referencedRequests.delete(reqIndex);
                }
            });
        });
        
        // Set up collapse/expand toggle
        const toggleBtn = document.getElementById('llm-chat-reference-toggle');
        if (toggleBtn) {
            // Remove existing listeners to avoid duplicates
            const newToggleBtn = toggleBtn.cloneNode(true);
            toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
            
            // Default to collapsed if there are more than 2 requests
            const shouldCollapse = availableRequests.length > 2;
            if (shouldCollapse) {
                checkboxContainer.style.display = 'none';
                referenceContainer.classList.add('collapsed');
                newToggleBtn.querySelector('svg').style.transform = 'rotate(-90deg)';
            }
            
            newToggleBtn.addEventListener('click', () => {
                const isCollapsed = checkboxContainer.style.display === 'none';
                checkboxContainer.style.display = isCollapsed ? 'block' : 'none';
                referenceContainer.classList.toggle('collapsed', !isCollapsed);
                const svg = newToggleBtn.querySelector('svg');
                if (svg) {
                    svg.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
                }
            });
        }
    }
    
    function showContextChangeNotification() {
        if (!chatMessages) return;
        
        // Check if there's existing conversation history
        const hasHistory = chatHistory.length > 0;
        if (!hasHistory) return; // No need to notify if no conversation yet
        
        // Create a dismissible notification banner
        const notification = document.createElement('div');
        notification.className = 'llm-chat-context-notification';
        notification.innerHTML = `
            <span>Context updated to new request</span>
            <button class="llm-chat-notification-dismiss" onclick="this.parentElement.remove()">×</button>
        `;
        
        // Insert at the top of messages (after any existing notifications)
        const firstChild = chatMessages.firstChild;
        if (firstChild && firstChild.classList && firstChild.classList.contains('llm-chat-context-notification')) {
            firstChild.replaceWith(notification);
        } else {
            chatMessages.insertBefore(notification, firstChild);
        }
        
        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(-10px)';
                setTimeout(() => notification.remove(), 300);
            }
        }, 3000);
    }
    
    // Listen for request selection changes
    events.on(EVENT_NAMES.REQUEST_SELECTED, (data) => {
        if (!chatPane) return;
        
        // Get the current request index from the event data
        // Event can be emitted as: { request, index } or just index (number)
        let currentIndex = -1;
        if (typeof data === 'number') {
            currentIndex = data;
        } else if (data && typeof data === 'object' && 'index' in data) {
            currentIndex = data.index;
        } else if (state.selectedRequest) {
            // Fallback: find index in state
            currentIndex = state.requests.indexOf(state.selectedRequest);
        }
        
        // Update request badge in header
        updateRequestBadge();
        
        // Check if request actually changed
        if (currentIndex !== -1 && currentIndex !== lastSelectedRequestIndex) {
            const wasChanged = lastSelectedRequestIndex !== -1; // Had a previous selection
            
            // Save current chat history before switching
            if (wasChanged && lastSelectedRequestIndex !== -1) {
                chatHistoryByRequest.set(lastSelectedRequestIndex, [...chatHistory]);
            }
            
            lastSelectedRequestIndex = currentIndex;
            
            // Clear response history when switching to a different request
            responseHistory = [];
            lastTrackedResponse = null;
            
            // Load chat history for the new request (or start fresh)
            loadChatHistoryForRequest(currentIndex);
            
            // Clear referenced requests when switching
            referencedRequests.clear();
            updateReferenceUI();
            
            // Show subtle notification only if there's existing conversation
            if (wasChanged && chatMessages) {
                const isChatVisible = chatPane.style.display !== 'none' && 
                                     window.getComputedStyle(chatPane).display !== 'none';
                if (isChatVisible) {
                    showContextChangeNotification();
                    // Show fresh chat notice
                    showFreshChatNotice();
                }
            }
        } else if (currentIndex !== -1) {
            // Update tracked index even if no change
            lastSelectedRequestIndex = currentIndex;
        }
    });
    
    // Initial badge update
    updateRequestBadge();
    
    // Initial reference UI update
    updateReferenceUI();
    
    function addUserMessage(text) {
        if (!chatMessages) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message chat-message-user';
        messageDiv.textContent = text;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Parse LLM response for modification suggestions
    function parseModificationSuggestions(text) {
        const suggestions = [];
        
        if (!text || typeof text !== 'string') {
            return suggestions;
        }
        
        // Look for code blocks with HTTP requests
        // Match: ```http, ```request, ```, or just code blocks that contain HTTP requests
        const codeBlockRegex = /```(?:http|request|text|plain|bash|shell)?\n?([\s\S]*?)```/gi;
        let match;
        
        while ((match = codeBlockRegex.exec(text)) !== null) {
            let codeContent = match[1].trim();
            
            // Remove any leading/trailing whitespace and normalize line endings
            codeContent = codeContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            
            // Check if it looks like an HTTP request (starts with HTTP method)
            if (codeContent.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i)) {
                // Validate it has more than just the request line
                const lines = codeContent.split('\n').filter(l => l.trim());
                if (lines.length > 1) {
                    // Store the full content - make sure we have everything
                    const fullContent = codeContent;
                    
                    suggestions.push({
                        type: 'full_request',
                        content: fullContent, // Keep the full content including headers and body
                        description: 'Full request modification'
                    });
                    console.log('LLM Chat: Found full request in code block, lines:', lines.length, 'content length:', fullContent.length);
                    console.log('LLM Chat: Content preview (first 300 chars):', fullContent.substring(0, 300));
                    console.log('LLM Chat: Content preview (last 200 chars):', fullContent.substring(Math.max(0, fullContent.length - 200)));
                }
            }
        }
        
        // Also look for HTTP requests without code blocks (sometimes LLMs don't use them)
        // But only if we haven't found any in code blocks (to avoid duplicates)
        // Prefer code block suggestions as they're more reliable
        if (suggestions.length === 0) {
            // More flexible regex to catch HTTP requests in various formats
            const directRequestRegex = /(?:^|\n)(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+[^\s]+\s+HTTP\/[\d.]+/gim;
            let directMatch;
            while ((directMatch = directRequestRegex.exec(text)) !== null) {
                const startIndex = directMatch.index;
                
                // Find where this request ends - look for next code block start, blank line with text after, or end of text
                let endIndex = text.length;
                
                // Check for next code block
                const nextCodeBlock = text.indexOf('```', startIndex + 50);
                if (nextCodeBlock !== -1 && nextCodeBlock < endIndex) {
                    endIndex = nextCodeBlock;
                }
                
                // Check for double newline followed by text (likely end of request)
                const doubleNewline = text.indexOf('\n\n', startIndex + 50);
                if (doubleNewline !== -1 && doubleNewline < endIndex) {
                    // Make sure there's actual text after (not just whitespace)
                    const afterNewline = text.substring(doubleNewline + 2).trim();
                    if (afterNewline.length > 10 && !afterNewline.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i)) {
                        endIndex = doubleNewline;
                    }
                }
                
                // Extract the full request content
                let requestContent = text.substring(startIndex, endIndex).trim();
                
                // Clean up: remove trailing code block markers, explanations, etc.
                requestContent = requestContent.replace(/\n```\s*$/, '').trim();
                // Remove trailing explanations that start with common words
                requestContent = requestContent.replace(/\n(?:This|Here|The|Note|Important|Explanation|Change|Modification|Update)[:\.].*$/i, '').trim();
                
                // Normalize line endings
                requestContent = requestContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                
                // Validate it has more than just the request line and substantial content
                const lines = requestContent.split('\n').filter(l => l.trim());
                if (lines.length >= 2 && requestContent.length > 50) {
                    suggestions.push({
                        type: 'full_request',
                        content: requestContent,
                        description: 'Full request modification (direct)'
                    });
                    console.log('LLM Chat: Found direct request, lines:', lines.length, 'content length:', requestContent.length);
                    console.log('LLM Chat: Direct request preview:', requestContent.substring(0, 200));
                } else {
                    console.log('LLM Chat: Skipped incomplete direct request, lines:', lines.length, 'length:', requestContent.length);
                }
            }
        }
        
        // Look for structured modification blocks
        const modBlockRegex = /(?:modification|change|suggestion):\s*\{([\s\S]*?)\}/gi;
        while ((match = modBlockRegex.exec(text)) !== null) {
            try {
                const modData = JSON.parse(`{${match[1]}}`);
                suggestions.push({
                    type: 'structured',
                    data: modData
                });
            } catch (e) {
                // Not valid JSON, skip
            }
        }
        
        // Look for header modifications
        const headerRegex = /(?:add|set|update|change)\s+header[:\s]+([^\n:]+):\s*([^\n]+)/gi;
        while ((match = headerRegex.exec(text)) !== null) {
            suggestions.push({
                type: 'header',
                name: match[1].trim(),
                value: match[2].trim()
            });
        }
        
        // Look for body modifications
        const bodyRegex = /(?:set|update|change)\s+body[:\s]+([\s\S]+?)(?:\n\n|\n```|$)/i;
        const bodyMatch = bodyRegex.exec(text);
        if (bodyMatch) {
            suggestions.push({
                type: 'body',
                content: bodyMatch[1].trim()
            });
        }
        
        // Deduplicate and validate suggestions
        // Only keep ONE full_request suggestion (the best one)
        const validatedSuggestions = [];
        const seenContents = new Set();
        let bestFullRequest = null;
        let bestFullRequestScore = 0;
        
        for (const suggestion of suggestions) {
            if (suggestion.type === 'full_request') {
                // Validate the content has headers and body
                const lines = suggestion.content.split('\n').filter(l => l.trim());
                if (lines.length >= 2 && suggestion.content.length > 50) {
                    // Score: prefer longer content and code block suggestions
                    const score = lines.length * 10 + suggestion.content.length;
                    const isFromCodeBlock = suggestion.description === 'Full request modification';
                    const adjustedScore = isFromCodeBlock ? score * 2 : score;
                    
                    // Keep only the best one
                    if (!bestFullRequest || adjustedScore > bestFullRequestScore) {
                        bestFullRequest = suggestion;
                        bestFullRequestScore = adjustedScore;
                        console.log('LLM Chat: New best full request, lines:', lines.length, 'length:', suggestion.content.length, 'score:', adjustedScore);
                    }
                } else {
                    console.warn('LLM Chat: Rejected incomplete suggestion, lines:', lines.length, 'length:', suggestion.content.length);
                }
            } else {
                // For other types, deduplicate by type+name/content
                const key = `${suggestion.type}:${suggestion.name || suggestion.content || ''}`;
                if (!seenContents.has(key)) {
                    validatedSuggestions.push(suggestion);
                    seenContents.add(key);
                }
            }
        }
        
        // Add the best full request suggestion (only one)
        if (bestFullRequest) {
            validatedSuggestions.push(bestFullRequest);
            console.log('LLM Chat: Selected best full request suggestion');
        }
        
        console.log('LLM Chat: Validated suggestions:', validatedSuggestions.length, 'out of', suggestions.length);
        return validatedSuggestions;
    }
    
    // Safely apply request modifications
    function applyRequestModification(suggestion) {
        console.log('LLM Chat: applyRequestModification called with:', suggestion);
        
        if (!state.selectedRequest) {
            console.warn('LLM Chat: No request selected');
            return false;
        }
        
        if (!elements.rawRequestInput) {
            console.warn('LLM Chat: rawRequestInput element not found');
            return false;
        }
        
        try {
            const currentContent = elements.rawRequestInput.innerText || elements.rawRequestInput.textContent;
            console.log('LLM Chat: Current content length:', currentContent.length);
            
            const lines = currentContent.split('\n');
            
            let newContent = '';
            let modified = false;
            
            if (suggestion.type === 'full_request') {
                // Replace entire request
                // Get the raw content - ensure it exists and is valid
                if (!suggestion.content || typeof suggestion.content !== 'string') {
                    console.error('LLM Chat: Suggestion content is invalid:', suggestion);
                    return false;
                }
                
                let rawContent = suggestion.content;
                console.log('LLM Chat: Raw suggestion content length:', rawContent.length);
                console.log('LLM Chat: Raw suggestion content preview:', rawContent.substring(0, 200));
                
                newContent = rawContent.trim();
                
                // Ensure proper line endings
                newContent = newContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                
                // Remove any trailing markdown code block markers
                newContent = newContent.replace(/\n```\s*$/, '').trim();
                
                // Validate the request has headers (at least one line after request line)
                const allLines = newContent.split('\n');
                const nonEmptyLines = allLines.filter(l => l.trim());
                
                if (nonEmptyLines.length < 2) {
                    console.error('LLM Chat: Invalid request - only has request line, missing headers/body');
                    console.error('LLM Chat: Processed content length:', newContent.length);
                    console.error('LLM Chat: Processed content:', newContent);
                    console.error('LLM Chat: Original suggestion content length:', rawContent.length);
                    console.error('LLM Chat: Original suggestion content:', rawContent);
                    console.error('LLM Chat: Full suggestion object:', JSON.stringify(suggestion, null, 2));
                    return false;
                }
                
                // Fix the request line: extract path from URL if needed
                // Format should be: METHOD PATH HTTP/VERSION (not METHOD FULL_URL HTTP/VERSION)
                const reqLine = allLines[0].trim();
                const reqLineParts = reqLine.split(/\s+/);
                
                if (reqLineParts.length >= 3) {
                    const method = reqLineParts[0];
                    const urlOrPath = reqLineParts[1];
                    const version = reqLineParts[2];
                    
                    // Check if the second part is a full URL (contains :// or starts with http)
                    let path = urlOrPath;
                    if (urlOrPath.includes('://') || urlOrPath.startsWith('http')) {
                        try {
                            const urlObj = new URL(urlOrPath);
                            path = urlObj.pathname + urlObj.search;
                            console.log('LLM Chat: Extracted path from URL:', path);
                        } catch (e) {
                            // If URL parsing fails, try to extract path manually
                            const pathMatch = urlOrPath.match(/\/\/[^\/]+(\/.*)/);
                            if (pathMatch) {
                                path = pathMatch[1];
                                console.log('LLM Chat: Extracted path manually:', path);
                            } else {
                                // If we can't parse it, just use the original
                                console.warn('LLM Chat: Could not extract path from URL, using as-is:', urlOrPath);
                            }
                        }
                    }
                    
                    // Reconstruct the request line with just the path
                    allLines[0] = `${method} ${path} ${version}`;
                    newContent = allLines.join('\n');
                    console.log('LLM Chat: Normalized request line:', allLines[0]);
                }
                
                // Log for debugging
                console.log('LLM Chat: Full request replacement successful');
                console.log('LLM Chat: Total lines:', allLines.length, 'Non-empty lines:', nonEmptyLines.length);
                console.log('LLM Chat: Content length:', newContent.length);
                console.log('LLM Chat: First 5 lines:', allLines.slice(0, 5));
                console.log('LLM Chat: Last 3 lines:', allLines.slice(-3));
                
                modified = true;
            } else if (suggestion.type === 'header') {
                // Modify or add header
                const headerLine = `${suggestion.name}: ${suggestion.value}`;
                let headerFound = false;
                let bodyStartIndex = -1;
                
                // Find body start
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '') {
                        bodyStartIndex = i;
                        break;
                    }
                }
                
                // Build new content
                newContent = lines[0] + '\n'; // Request line
                
                // Update or add header
                for (let i = 1; i < (bodyStartIndex > 0 ? bodyStartIndex : lines.length); i++) {
                    const line = lines[i];
                    if (line.trim() === '') continue;
                    
                    const colonIndex = line.indexOf(':');
                    if (colonIndex > 0) {
                        const headerName = line.substring(0, colonIndex).trim();
                        if (headerName.toLowerCase() === suggestion.name.toLowerCase()) {
                            newContent += headerLine + '\n';
                            headerFound = true;
                            modified = true;
                        } else {
                            newContent += line + '\n';
                        }
                    } else {
                        newContent += line + '\n';
                    }
                }
                
                // Add header if not found
                if (!headerFound) {
                    newContent += headerLine + '\n';
                    modified = true;
                }
                
                // Add body if exists
                if (bodyStartIndex > 0) {
                    newContent += '\n';
                    for (let i = bodyStartIndex + 1; i < lines.length; i++) {
                        newContent += lines[i] + (i < lines.length - 1 ? '\n' : '');
                    }
                }
            } else if (suggestion.type === 'body') {
                // Modify body
                let bodyStartIndex = -1;
                
                // Find body start
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '') {
                        bodyStartIndex = i;
                        break;
                    }
                }
                
                // Build new content - headers and request line
                for (let i = 0; i <= (bodyStartIndex > 0 ? bodyStartIndex : lines.length - 1); i++) {
                    newContent += lines[i];
                    if (i < (bodyStartIndex > 0 ? bodyStartIndex : lines.length - 1)) {
                        newContent += '\n';
                    }
                }
                
                // Add new body
                if (bodyStartIndex <= 0) {
                    newContent += '\n';
                }
                newContent += '\n' + suggestion.content;
                modified = true;
            }
            
            if (modified && newContent) {
                // Apply with animation
                applyRequestWithAnimation(newContent);
                return true;
            }
        } catch (error) {
            console.error('Error applying request modification:', error);
            return false;
        }
        
        return false;
    }
    
    // Apply request modification with animation
    function applyRequestWithAnimation(newContent) {
        console.log('LLM Chat: applyRequestWithAnimation called with content length:', newContent.length);
        
        if (!elements.rawRequestInput) {
            console.error('LLM Chat: rawRequestInput not found');
            return;
        }
        
        // Store original content for diff
        const originalContent = elements.rawRequestInput.innerText || elements.rawRequestInput.textContent;
        
        // Add highlight class for animation
        elements.rawRequestInput.classList.add('request-modifying');
        
        // Parse to get useHttps
        const urlObj = new URL(state.selectedRequest.request.url);
        const useHttps = urlObj.protocol === 'https:';
        
        // Update content with highlighting
        const highlightedContent = highlightHTTP(newContent);
        elements.rawRequestInput.innerHTML = highlightedContent;
        console.log('LLM Chat: Updated rawRequestInput innerHTML');
        
        // Also sync with raw textarea if it exists
        const rawTextarea = document.getElementById('raw-request-textarea');
        if (rawTextarea) {
            rawTextarea.value = newContent;
            console.log('LLM Chat: Updated raw textarea');
        }
        
        // Add to history
        actions.history.add(newContent, useHttps);
        
        // Update undo stack
        if (!state.undoStack) {
            state.undoStack = [];
        }
        state.undoStack.push(newContent);
        state.redoStack = [];
        
        // Animate the change with magic effect
        setTimeout(() => {
            elements.rawRequestInput.classList.remove('request-modifying');
            elements.rawRequestInput.classList.add('request-modified');
            
            // Remove animation class after animation completes
            setTimeout(() => {
                elements.rawRequestInput.classList.remove('request-modified');
            }, 1500);
        }, 100);
        
        // Emit event for UI updates
        events.emit(EVENT_NAMES.UI_UPDATE_HISTORY_BUTTONS);
        
        console.log('LLM Chat: Request modification applied successfully');
    }
    
    /**
     * Prepare markdown text for parsing during streaming
     * Handles incomplete code blocks by temporarily closing them for proper rendering
     */
    function prepareMarkdownForStreaming(text) {
        if (!text) return text;
        
        // Count code block markers (```)
        const codeBlockMatches = text.match(/```/g);
        if (!codeBlockMatches) return text;
        
        const codeBlockCount = codeBlockMatches.length;
        
        // If odd number of ```, we have an unclosed code block
        if (codeBlockCount % 2 === 1) {
            // Find the last opening code block
            const lastBacktickIndex = text.lastIndexOf('```');
            const afterLastBacktick = text.substring(lastBacktickIndex + 3);
            
            // Check if there's no closing ``` after the last opening
            // This handles both cases:
            // 1. Code block just started: ```javascript (no content yet)
            // 2. Code block with content: ```javascript\nconst x = 1;
            if (!afterLastBacktick.includes('```')) {
                // Temporarily close the code block for rendering
                // This ensures the markdown parser recognizes it as a code block
                // Add a newline before closing if the content doesn't end with one
                const needsNewline = afterLastBacktick.length > 0 && !afterLastBacktick.endsWith('\n');
                return text + (needsNewline ? '\n' : '') + '```';
            }
        }
        
        return text;
    }

    /**
     * Add copy buttons to all code blocks in a container
     * Also applies syntax highlighting if highlight.js is available
     */
    function addCopyButtonsToCodeBlocks(container) {
        if (!container) return;
        
        // Find all pre elements (code blocks)
        const preElements = container.querySelectorAll('pre');
        
        preElements.forEach((preElement) => {
            // Skip if already has a copy button
            if (preElement.querySelector('.code-copy-btn')) {
                return;
            }
            
            // Get the code element (might be nested or direct)
            const codeElement = preElement.querySelector('code') || preElement;
            
            // Apply syntax highlighting if highlight.js is available and not already highlighted
            if (window.hljs && codeElement && !codeElement.classList.contains('hljs')) {
                // Check if there's a language class (from marked.js with langPrefix)
                const langMatch = codeElement.className.match(/language-(\w+)/);
                const lang = langMatch ? langMatch[1] : null;
                
                if (lang && window.hljs.getLanguage(lang)) {
                    try {
                        window.hljs.highlightElement(codeElement);
                    } catch (err) {
                        // Fallback to auto-detect
                        try {
                            window.hljs.highlightElement(codeElement);
                        } catch (e) {
                            console.warn('Highlight.js error:', e);
                        }
                    }
                } else {
                    // Auto-detect language
                    try {
                        window.hljs.highlightElement(codeElement);
                    } catch (e) {
                        console.warn('Highlight.js error:', e);
                    }
                }
            }
            
            // Get the code text
            const codeText = codeElement.textContent || codeElement.innerText;
            
            // Create copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-copy-btn';
            copyBtn.setAttribute('aria-label', 'Copy code');
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 1.5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 1.5h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            
            // Copy functionality
            copyBtn.onclick = async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(codeText);
                    copyBtn.classList.add('copied');
                    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 1.5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 1.5h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy code:', err);
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = codeText;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        copyBtn.classList.add('copied');
                        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                        setTimeout(() => {
                            copyBtn.classList.remove('copied');
                            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 1.5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 1.5h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                        }, 2000);
                    } catch (fallbackErr) {
                        console.error('Fallback copy failed:', fallbackErr);
                    }
                    document.body.removeChild(textArea);
                }
            };
            
            // Make pre element relative for absolute positioning of button
            if (getComputedStyle(preElement).position === 'static') {
                preElement.style.position = 'relative';
            }
            preElement.appendChild(copyBtn);
        });
    }

    function addAssistantMessage(text, isLoading = false) {
        if (!chatMessages) return '';
        const messageDiv = document.createElement('div');
        const messageId = `chat-msg-${Date.now()}-${Math.random()}`;
        messageDiv.id = messageId;
        messageDiv.className = `chat-message chat-message-assistant ${isLoading ? 'loading' : ''}`;
        
        // Support markdown rendering if marked is available
        if (window.marked && text && !isLoading) {
            try {
                messageDiv.innerHTML = window.marked.parse(text);
                // Add copy buttons to code blocks after markdown is parsed
                addCopyButtonsToCodeBlocks(messageDiv);
            } catch (e) {
                messageDiv.textContent = text;
            }
        } else {
            messageDiv.textContent = text || (isLoading ? 'Thinking...' : '');
        }
        
        chatMessages.appendChild(messageDiv);
        // Scroll to bottom after a brief delay to ensure DOM is updated
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 10);
        return messageId;
    }
    
    function addSystemMessage(text) {
        if (!chatMessages) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message chat-message-system';
        messageDiv.textContent = text;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Initialize with a helpful message
    if (chatMessages) {
        if (state.selectedRequest) {
            // Let the LLM introduce itself naturally when a request is selected
            // We'll add a system message that prompts the LLM to introduce itself
            addSystemMessage('Hi! I can help you with this request. Ask me anything about it, or I can help modify it, explain it, or test different scenarios.');
        } else {
            addSystemMessage('Select a request to start chatting. I can help you understand, modify, or debug HTTP requests and responses.');
        }
    }
}

