// Multi-tab Capture Module
import { actions } from '../core/state.js';
import { events, EVENT_NAMES } from '../core/events.js';

export function initMultiTabCapture() {
    const multiTabBtn = document.getElementById('multi-tab-btn');
    let backgroundPort = null;
    let isConnecting = false;

    function updateMultiTabIcon(enabled) {
        if (!multiTabBtn) return;
        if (enabled) {
            multiTabBtn.classList.add('active');
            multiTabBtn.title = "Multi-tab Capture Enabled (Click to disable)";
            multiTabBtn.style.color = 'var(--accent-color)';
        } else {
            multiTabBtn.classList.remove('active');
            multiTabBtn.title = "Enable Multi-tab Capture";
            multiTabBtn.style.color = '';
        }
    }

    function connectToBackground() {
        if (backgroundPort || isConnecting) return;
        isConnecting = true;

        try {
            backgroundPort = chrome.runtime.connect({ name: "rep-panel" });
            console.log("Connected to background service worker");
            isConnecting = false;

            backgroundPort.onMessage.addListener((msg) => {
                if (msg.type === 'captured_request') {
                    const req = msg.data;

                    // Skip requests from the current inspected tab (handled by setupNetworkListener)
                    if (chrome.devtools && chrome.devtools.inspectedWindow && req.tabId === chrome.devtools.inspectedWindow.tabId) return;

                    // Convert to HAR-like format
                    const harEntry = {
                        request: {
                            method: req.method,
                            url: req.url,
                            headers: req.requestHeaders || [],
                            postData: req.requestBody ? { text: req.requestBody } : undefined
                        },
                        response: {
                            status: req.statusCode,
                            statusText: req.statusLine || '',
                            headers: req.responseHeaders || [],
                            content: {
                                mimeType: (req.responseHeaders || []).find(h => h.name.toLowerCase() === 'content-type')?.value || '',
                                text: '' // Response body not available for background requests
                            }
                        },
                        capturedAt: req.timeStamp,
                        fromOtherTab: true, // Flag to indicate source
                        pageUrl: req.initiator || req.url // Use initiator as pageUrl for grouping
                    };

                    // Filter static resources
                    const url = req.url.toLowerCase();
                    const staticExtensions = [
                        '.css', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
                        '.woff', '.woff2', '.ttf', '.eot', '.otf',
                        '.mp4', '.webm', '.mp3', '.wav',
                        '.pdf'
                    ];

                    const isStatic = staticExtensions.some(ext => url.endsWith(ext) || url.includes(ext + '?'));
                    if (isStatic) return;

                    // Use action to add request (automatically emits events)
                    const index = actions.request.add(harEntry);
                }
            });

            backgroundPort.onDisconnect.addListener(() => {
                console.log("Disconnected from background");
                backgroundPort = null;
                isConnecting = false;

                // Only retry if permissions are still granted
                chrome.permissions.contains({
                    permissions: ['webRequest'],
                    origins: ['<all_urls>']
                }, (result) => {
                    if (result) {
                        console.log("Retrying connection in 2s...");
                        setTimeout(connectToBackground, 2000);
                    } else {
                        updateMultiTabIcon(false);
                    }
                });
            });

        } catch (e) {
            console.error('Failed to connect to background script:', e);
            backgroundPort = null;
            isConnecting = false;
            setTimeout(connectToBackground, 2000);
        }
    }

    function disconnectBackground() {
        if (backgroundPort) {
            backgroundPort.disconnect();
            backgroundPort = null;
        }
    }

    // Check initial status
    chrome.permissions.contains({
        permissions: ['webRequest'],
        origins: ['<all_urls>']
    }, (result) => {
        if (result) {
            updateMultiTabIcon(true);
            connectToBackground();
        } else {
            updateMultiTabIcon(false);
        }
    });

    // Toggle button handler
    if (multiTabBtn) {
        multiTabBtn.addEventListener('click', () => {
            chrome.permissions.contains({
                permissions: ['webRequest'],
                origins: ['<all_urls>']
            }, (result) => {
                if (result) {
                    // Disable: Remove permissions
                    chrome.permissions.remove({
                        permissions: ['webRequest'],
                        origins: ['<all_urls>']
                    }, (removed) => {
                        if (removed) {
                            updateMultiTabIcon(false);
                            disconnectBackground();
                        }
                    });
                } else {
                    // Enable: Request permissions
                    chrome.permissions.request({
                        permissions: ['webRequest'],
                        origins: ['<all_urls>']
                    }, (granted) => {
                        if (granted) {
                            updateMultiTabIcon(true);
                            connectToBackground();
                        }
                    });
                }
            });
        });
    }
}
