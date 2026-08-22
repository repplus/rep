// State Actions - Centralized state mutations with automatic event emissions
// This module provides action creators that wrap state mutations and ensure
// events are always emitted when state changes.

import { state } from './index.js';
import { events, EVENT_NAMES } from '../events.js';
import { getHostname } from '../utils/network.js';

/**
 * Action creators for state mutations
 * All state changes should go through these functions to ensure:
 * 1. Events are automatically emitted
 * 2. Changes are logged for debugging
 * 3. State mutations are centralized
 */

// Request Actions
export const requestActions = {
    /**
     * Check if a request is a duplicate of an existing request
     * @param {Object} newRequest - New request to check
     * @param {Array} existingRequests - Array of existing requests
     * @returns {boolean} True if duplicate found
     */
    isDuplicate(newRequest, existingRequests) {
        if (!newRequest || !newRequest.request) return false;
        
        const newReq = newRequest.request;
        const newMethod = (newReq.method || 'GET').toUpperCase().trim();
        const newUrl = (newReq.url || '').trim();
        const newBody = (newReq.postData && newReq.postData.text) ? String(newReq.postData.text).trim() : '';
        const newHeaders = this.normalizeHeaders(newReq.headers);
        const newPageUrl = (newRequest.pageUrl || '').trim();
        const newSignature = `${newMethod}|${newUrl}|${newHeaders}|${newBody}|${newPageUrl}`;
        
        // Check against existing requests
        for (const existing of existingRequests) {
            if (!existing || !existing.request) continue;
            
            const existingReq = existing.request;
            const existingMethod = (existingReq.method || 'GET').toUpperCase().trim();
            const existingUrl = (existingReq.url || '').trim();
            const existingBody = (existingReq.postData && existingReq.postData.text) ? String(existingReq.postData.text).trim() : '';
            const existingHeaders = this.normalizeHeaders(existingReq.headers);
            const existingPageUrl = (existing.pageUrl || '').trim();
            const existingSignature = `${existingMethod}|${existingUrl}|${existingHeaders}|${existingBody}|${existingPageUrl}`;
            
            // Compare signatures
            if (newSignature === existingSignature) {
                return true;
            }
        }
        
        return false;
    },
    
    /**
     * Normalize headers for comparison
     * @param {Array|Object} headers - Headers in array or object format
     * @returns {string} Normalized header string
     */
    normalizeHeaders(headers) {
        if (!headers) return '';
        
        let headerArray = [];
        if (Array.isArray(headers)) {
            headerArray = headers;
        } else if (typeof headers === 'object') {
            headerArray = Object.entries(headers);
        } else {
            return '';
        }
        
        // Filter out pseudo-headers (HTTP/2) and normalize
        const normalized = headerArray
            .filter(h => {
                const name = (h.name || h[0] || '').toLowerCase();
                // Skip HTTP/2 pseudo-headers
                return name && !name.startsWith(':');
            })
            .map(h => {
                const name = (h.name || h[0] || '').toLowerCase().trim();
                const value = (h.value || h[1] || '').toLowerCase().trim();
                return `${name}:${value}`;
            })
            .sort()
            .join('|');
        
        return normalized;
    },
    
    /**
     * Remove duplicate requests from state
     * @returns {number} Number of duplicates removed
     */
    removeDuplicates() {
        const originalLength = state.requests.length;
        if (originalLength === 0) return 0;
        
        const uniqueRequests = [];
        const removedRequests = [];
        const seen = new Set();
        
        for (const request of state.requests) {
            if (!request || !request.request) {
                // Invalid request, keep it but don't check for duplicates
                uniqueRequests.push(request);
                continue;
            }
            
            const req = request.request;
            const method = (req.method || 'GET').toUpperCase().trim();
            const url = (req.url || '').trim();
            const body = (req.postData && req.postData.text) ? String(req.postData.text).trim() : '';
            
            // Normalize headers using the helper method
            const headers = this.normalizeHeaders(req.headers);
            
            // Include pageUrl in signature to differentiate requests from different websites/tabs
            // This ensures requests from different contexts are not treated as duplicates
            const pageUrl = (request.pageUrl || '').trim();
            
            // Create signature (includes pageUrl to preserve context)
            const signature = `${method}|${url}|${headers}|${body}|${pageUrl}`;
            
            // Debug: log first few signatures to diagnose issues
            if (seen.size < 3) {
                console.log(`Signature ${seen.size + 1}:`, signature.substring(0, 100) + '...');
            }
            
            if (!seen.has(signature)) {
                seen.add(signature);
                uniqueRequests.push(request);
            } else {
                console.log('Duplicate found:', signature.substring(0, 100) + '...');
                removedRequests.push(request);
            }
        }
        
        console.log(`removeDuplicates: ${originalLength} total, ${seen.size} unique, ${originalLength - seen.size} duplicates`);
        
        const removedCount = originalLength - uniqueRequests.length;
        
        if (removedCount > 0) {
            // Store selected request reference before clearing
            const selectedRequestRef = state.selectedRequest;
            
            state.requests = uniqueRequests;
            
            // Clear selection if selected request was removed
            if (selectedRequestRef && !uniqueRequests.includes(selectedRequestRef)) {
                state.selectedRequest = null;
                // Clear UI elements since selected request was removed
                events.emit(EVENT_NAMES.UI_CLEAR_ALL);
            } else if (selectedRequestRef) {
                // Selected request still exists, but we need to update its reference
                // in case the array was recreated (though in this case it's the same object)
                state.selectedRequest = selectedRequestRef;
            }
            
            // Clear the request list UI
            const requestList = document.getElementById('request-list');
            if (requestList) {
                requestList.innerHTML = '';
            }
            
            // Re-render all unique requests from scratch
            // We need to emit REQUEST_RENDERED for each request to rebuild the DOM
            uniqueRequests.forEach((request, index) => {
                events.emit(EVENT_NAMES.REQUEST_RENDERED, { request, index });
            });
            
            // Also trigger filterRequests to handle grouping and filtering
            events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
            events.emit(EVENT_NAMES.REQUESTS_REMOVED, removedRequests);
        }
        
        return removedCount;
    },
    
    /**
     * Add a new request to state
     * @param {Object} request - Request object to add
     * @returns {number|null} Index of the added request, or null if duplicate was skipped
     */
    add(request) {
        // Initialize defaults
        request.starred = false;
        request.color = null;
        if (typeof request.name !== 'string') {
            request.name = null;
        }
        
        // Check for duplicates if enabled (default: true)
        const removeDuplicatesEnabled = localStorage.getItem('rep_remove_duplicates') !== 'false';
        if (removeDuplicatesEnabled && this.isDuplicate(request, state.requests)) {
            // Skip adding duplicate
            return null;
        }
        
        state.requests.push(request);
        const index = state.requests.length - 1;
        
        // Emit event automatically
        events.emit(EVENT_NAMES.REQUEST_RENDERED, { request, index });
        
        return index;
    },
    
    /**
     * Select a request
     * @param {Object|null} request - Request object to select, or null to deselect
     * @param {number} index - Index of the request
     */
    select(request, index) {
        state.selectedRequest = request;
        
        // Emit event automatically
        events.emit(EVENT_NAMES.REQUEST_SELECTED, { request, index });
    },
    
    /**
     * Clear all requests and reset related state
     */
    clearAll() {
        const removedRequests = [...state.requests];
        state.requests = [];
        state.selectedRequest = null;
        state.requestHistory = [];
        state.historyIndex = -1;
        state.regularRequestBaseline = null;
        state.currentResponse = null;
        state.timelineFilterTimestamp = null;
        state.timelineFilterRequestIndex = null;
        state.attackSurfaceCategories = {};
        state.domainsWithAttackSurface.clear();
        
        // Emit events
        events.emit(EVENT_NAMES.REQUESTS_REMOVED, removedRequests);
        events.emit(EVENT_NAMES.STATE_REQUESTS_CLEARED);
        events.emit(EVENT_NAMES.UI_CLEAR_ALL);
    },
    
    /**
     * Toggle star status of a request
     * @param {Object} request - Request object to toggle
     * @param {number} index - Index of the request
     */
    toggleStar(request, index) {
        request.starred = !request.starred;
        
        // Emit result event (not action event - action events are for triggering actions, not results)
        events.emit(EVENT_NAMES.REQUEST_STAR_UPDATED, { request, index });
        
        // If star filter is active, trigger filter update
        if (state.starFilterActive) {
            const requestList = document.getElementById('request-list');
            const scrollTop = requestList ? requestList.scrollTop : 0;
            events.emit('request:filtered', { preserveScroll: true, scrollTop });
        }
    },
    
    /**
     * Toggle star for all requests in a group
     * @param {string} type - 'page' or 'domain'
     * @param {string} hostname - Hostname to match
     * @param {boolean} starred - Whether to star or unstar
     */
    toggleGroupStar(type, hostname, starred) {
        const isPage = type === 'page';
        
        // Update starring state
        if (isPage) {
            if (starred) {
                state.starredPages.add(hostname);
            } else {
                state.starredPages.delete(hostname);
            }
        } else {
            if (starred) {
                state.starredDomains.add(hostname);
            } else {
                state.starredDomains.delete(hostname);
            }
        }
        
        // Update all matching requests
        state.requests.forEach((req, index) => {
            const reqPageHostname = req.pageUrl ? new URL(req.pageUrl).hostname : null;
            const reqHostname = new URL(req.request.url).hostname;
            
            let shouldUpdate = false;
            if (isPage) {
                // Only update if it belongs to the page AND is first-party (same hostname)
                if (reqPageHostname === hostname && reqHostname === hostname) shouldUpdate = true;
            } else {
                if (reqHostname === hostname) shouldUpdate = true;
            }
            
            if (shouldUpdate && req.starred !== starred) {
                req.starred = starred;
                events.emit('request:star-updated', { index, starred });
            }
        });
        
        // Emit events
        events.emit(EVENT_NAMES.REQUEST_FILTERED);
    },
    
    /**
     * Set color for a request
     * @param {number} index - Index of the request
     * @param {string|null} color - Color to set, or null to remove
     */
    setColor(index, color) {
        if (index >= 0 && index < state.requests.length) {
            state.requests[index].color = color;
            
            // Emit event
            events.emit(EVENT_NAMES.REQUEST_COLOR_CHANGED, { index, color });
        }
    },
    
    /**
     * Delete a request
     * @param {number} index - Index of the request to delete
     */
    delete(index) {
        if (index >= 0 && index < state.requests.length) {
            const request = state.requests[index];
            state.requests.splice(index, 1);
            
            // If deleted request was selected, clear selection
            if (state.selectedRequest === request) {
                state.selectedRequest = null;
                events.emit(EVENT_NAMES.REQUEST_SELECTED, { request: null, index: -1 });
            }
            
            // Emit event
            events.emit(EVENT_NAMES.REQUESTS_REMOVED, [request]);
            events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
        }
    },
    
    /**
     * Delete all requests in a group
     * @param {string} type - 'page' or 'domain'
     * @param {string} hostname - Hostname to match
     * @returns {number} Number of requests removed from blocked queue
     */
    deleteGroup(type, hostname) {
        const isPage = type === 'page';
        
        // Find requests to remove
        const requestsToRemove = [];
        const removedRequests = [];
        state.requests.forEach((req, index) => {
            const reqPageHostname = getHostname(req.pageUrl || req.request.url);
            const reqHostname = getHostname(req.request.url);
            
            let shouldRemove = false;
            if (isPage) {
                shouldRemove = reqPageHostname === hostname;
            } else {
                shouldRemove = reqHostname === hostname;
            }
            
            if (shouldRemove) {
                requestsToRemove.push(index);
                removedRequests.push(req);
            }
        });
        
        // Remove requests in reverse order to maintain correct indices
        requestsToRemove.reverse().forEach(index => {
            state.requests.splice(index, 1);
        });
        
        // Also drop any blocked (queued) requests belonging to this group
        const beforeQueue = state.blockedQueue.length;
        state.blockedQueue = state.blockedQueue.filter(req => {
            const reqPageHostname = getHostname(req.pageUrl || req.request.url);
            const reqHostname = getHostname(req.request.url);
            if (isPage) {
                return reqPageHostname !== hostname;
            }
            return reqHostname !== hostname;
        });
        const removedFromQueue = beforeQueue - state.blockedQueue.length;
        
        // Clear starred state for this group
        if (isPage) {
            state.starredPages.delete(hostname);
        } else {
            state.starredDomains.delete(hostname);
        }
        state.domainsWithAttackSurface.delete(hostname);
        
        // Clear attack surface categories for deleted requests
        Object.keys(state.attackSurfaceCategories).forEach(key => {
            const reqIndex = parseInt(key);
            if (reqIndex < state.requests.length) {
                const req = state.requests[reqIndex];
                const reqPageHostname = getHostname(req.pageUrl || req.request.url);
                const reqHostname = getHostname(req.request.url);
                if (isPage) {
                    if (reqPageHostname === hostname) {
                        delete state.attackSurfaceCategories[key];
                    }
                } else {
                    if (reqHostname === hostname) {
                        delete state.attackSurfaceCategories[key];
                    }
                }
            } else {
                // Request was deleted, remove its category entry
                delete state.attackSurfaceCategories[key];
            }
        });
        
        // Clear selected request if it was deleted
        if (state.selectedRequest && removedRequests.includes(state.selectedRequest)) {
            state.selectedRequest = null;
        }
        
        // Emit events
        events.emit(EVENT_NAMES.REQUESTS_REMOVED, removedRequests);
        events.emit(EVENT_NAMES.REQUEST_FILTERED);
        if (removedFromQueue > 0) {
            events.emit('block-queue:updated');
        }
        if (state.selectedRequest === null) {
            events.emit(EVENT_NAMES.UI_CLEAR_ALL);
        }
        
        return removedFromQueue;
    }
};

// Filter Actions
export const filterActions = {
    /**
     * Set the current filter
     * @param {string} filter - Filter value ('all', 'GET', 'POST', 'starred', etc.)
     */
    setFilter(filter) {
        state.currentFilter = filter;
        
        // Emit event
        events.emit(EVENT_NAMES.STATE_FILTER_CHANGED, { filter });
        events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
    },
    
    /**
     * Set selected HTTP methods
     * @param {Set<string>} methods - Set of HTTP methods
     */
    setSelectedMethods(methods) {
        state.selectedMethods = methods;
        
        // Update currentFilter based on selection
        if (methods.size === 0) {
            state.currentFilter = 'all';
        } else if (methods.size === 1) {
            state.currentFilter = Array.from(methods)[0];
        } else {
            state.currentFilter = 'multiple';
        }
        
        // Emit events
        events.emit(EVENT_NAMES.STATE_FILTER_CHANGED, { methods });
        events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
    },
    
    /**
     * Toggle star filter
     * @param {boolean} active - Whether star filter is active
     */
    setStarFilter(active) {
        state.starFilterActive = active;
        
        if (active) {
            state.currentFilter = 'starred';
        } else {
            state.currentFilter = 'all';
        }
        
        // Emit events
        events.emit(EVENT_NAMES.STATE_FILTER_CHANGED, { starFilter: active });
        events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
    },
    
    /**
     * Set search term
     * @param {string} term - Search term
     * @param {boolean} useRegex - Whether to use regex
     */
    setSearch(term, useRegex = false) {
        state.currentSearchTerm = term;
        state.useRegex = useRegex;
        
        // Emit events
        events.emit(EVENT_NAMES.STATE_SEARCH_CHANGED, { term, useRegex });
        events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
    },
    
    /**
     * Set color filter
     * @param {string} color - Color to filter by, or 'all'
     */
    setColorFilter(color) {
        state.currentColorFilter = color;
        
        // Emit events
        events.emit(EVENT_NAMES.STATE_FILTER_CHANGED, { color });
        events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
    }
};

// Starring Actions
export const starringActions = {
    /**
     * Toggle star for a page
     * @param {string} hostname - Page hostname
     * @param {boolean} starred - Whether to star or unstar
     */
    togglePageStar(hostname, starred) {
        if (starred) {
            state.starredPages.add(hostname);
        } else {
            state.starredPages.delete(hostname);
        }
        
        // Emit event
        events.emit(EVENT_NAMES.REQUEST_STAR_UPDATED);
    },
    
    /**
     * Toggle star for a domain
     * @param {string} hostname - Domain hostname
     * @param {boolean} starred - Whether to star or unstar
     */
    toggleDomainStar(hostname, starred) {
        if (starred) {
            state.starredDomains.add(hostname);
        } else {
            state.starredDomains.delete(hostname);
        }
        
        // Emit event
        events.emit(EVENT_NAMES.REQUEST_STAR_UPDATED);
    }
};

// Blocking Actions
export const blockingActions = {
    /**
     * Toggle request blocking
     * @param {boolean} enabled - Whether blocking is enabled
     */
    setBlocking(enabled) {
        state.blockRequests = enabled;
        
        if (enabled) {
            // Clear queue when starting new blocking session
            state.blockedQueue = [];
        }
        
        // Emit event
        events.emit('block-queue:updated');
    },
    
    /**
     * Add request to blocked queue
     * @param {Object} request - Request to add to queue
     */
    addToBlockedQueue(request) {
        state.blockedQueue.push(request);
        
        // Emit event
        events.emit('block-queue:updated');
    },
    
    /**
     * Clear blocked queue
     */
    clearBlockedQueue() {
        state.blockedQueue = [];
        
        // Emit event
        events.emit('block-queue:updated');
    }
};

// Timeline Actions
export const timelineActions = {
    /**
     * Set timeline filter
     * @param {number} timestamp - Timestamp to filter by
     * @param {number} requestIndex - Request index at that timestamp
     */
    setFilter(timestamp, requestIndex) {
        state.timelineFilterTimestamp = timestamp;
        state.timelineFilterRequestIndex = requestIndex;
        
        // Emit UI update event (not action event - action events are for triggering actions, not results)
        events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
    },
    
    /**
     * Clear timeline filter
     */
    clear() {
        state.timelineFilterTimestamp = null;
        state.timelineFilterRequestIndex = null;
        
        // Emit event
        events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
    }
};

// History Actions
export const historyActions = {
    /**
     * Add entry to request history
     * @param {string} rawText - Raw request text
     * @param {boolean} useHttps - Whether to use HTTPS
     */
    add(rawText, useHttps) {
        // Don't add if same as current
        if (state.historyIndex >= 0) {
            const current = state.requestHistory[state.historyIndex];
            if (current.rawText === rawText && current.useHttps === useHttps) {
                return;
            }
        }
        
        // If we are in the middle of history and make a change, discard future history
        if (state.historyIndex < state.requestHistory.length - 1) {
            state.requestHistory = state.requestHistory.slice(0, state.historyIndex + 1);
        }
        
        state.requestHistory.push({ rawText, useHttps });
        state.historyIndex = state.requestHistory.length - 1;
        
        // Emit event
        events.emit(EVENT_NAMES.HISTORY_UPDATED);
        events.emit(EVENT_NAMES.UI_UPDATE_HISTORY_BUTTONS);
    },
    
    /**
     * Navigate history backward
     */
    goBack() {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            events.emit(EVENT_NAMES.HISTORY_NAVIGATED, { 
                index: state.historyIndex,
                entry: state.requestHistory[state.historyIndex]
            });
            events.emit(EVENT_NAMES.UI_UPDATE_HISTORY_BUTTONS);
        }
    },
    
    /**
     * Navigate history forward
     */
    goForward() {
        if (state.historyIndex < state.requestHistory.length - 1) {
            state.historyIndex++;
            events.emit(EVENT_NAMES.HISTORY_NAVIGATED, { 
                index: state.historyIndex,
                entry: state.requestHistory[state.historyIndex]
            });
            events.emit(EVENT_NAMES.UI_UPDATE_HISTORY_BUTTONS);
        }
    }
};

// Diff Actions
export const diffActions = {
    /**
     * Set baseline for diff view
     * @param {string} baseline - Baseline response text
     */
    setBaseline(baseline) {
        state.regularRequestBaseline = baseline;
    },
    
    /**
     * Set current response for diff
     * @param {string} response - Current response text
     */
    setCurrentResponse(response) {
        state.currentResponse = response;
    }
};

// Attack Surface Actions
export const attackSurfaceActions = {
    /**
     * Set attack surface category for a request
     * @param {number} requestIndex - Index of the request
     * @param {Object} categoryData - Category data
     */
    setCategory(requestIndex, categoryData) {
        state.attackSurfaceCategories[requestIndex] = categoryData;
    },
    
    /**
     * Mark domain as having attack surface
     * @param {string} domain - Domain name
     */
    markDomain(domain) {
        state.domainsWithAttackSurface.add(domain);
    },
    
    /**
     * Set analyzing flag
     * @param {boolean} analyzing - Whether analysis is in progress
     */
    setAnalyzing(analyzing) {
        state.isAnalyzingAttackSurface = analyzing;
    }
};

// Unified actions export (for convenience)
export const actions = {
    request: requestActions,
    filter: filterActions,
    starring: starringActions,
    blocking: blockingActions,
    timeline: timelineActions,
    history: historyActions,
    diff: diffActions,
    attackSurface: attackSurfaceActions
};
