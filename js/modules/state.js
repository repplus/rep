// State Management

export const state = {
    requests: [],
    selectedRequest: null,
    currentFilter: 'all',
    currentSearchTerm: '',
    useRegex: false,
    requestHistory: [],
    historyIndex: -1,
    undoStack: [],
    redoStack: [],
    // Bulk Replay State
    positionConfigs: [],
    currentAttackType: 'sniper',
    shouldStopBulk: false,
    shouldPauseBulk: false,
    // Diff State
    regularRequestBaseline: null,
    currentResponse: null,
    // Request numbering & sorting
    requestCounter: 0,
    sortColumn: 'num',
    sortOrder: 'asc',
    // OOS (Out-of-Scope) filtering - when true, OOS items are HIDDEN
    hideOOS: false
};

/**
 * OOS patterns for filtering out framework noise (Next.js, React, Webpack, etc.)
 * Default patterns - can be extended via settings
 */
export const oosPatterns = [
    // Next.js specific
    /^\/_next\//,
    /^\/__nextjs/,
    /^\/next\//,
    
    // SvelteKit
    /^\/_app\//,
    /^\/@svelte/,
    /^\/\.svelte-kit\//,
    
    // Nuxt.js
    /^\/_nuxt\//,
    /^\/__nuxt/,
    
    // React/Vite dev server
    /^\/@vite/,
    /^\/@react-refresh/,
    /^\/@id\//,
    /^\/node_modules\//,
    /^\/__vite_/,
    
    // Webpack
    /^\/webpack/,
    /\.hot-update\./,
    /^\/sockjs-node/,
    
    // Source maps
    /\.map$/,
    
    // WebSocket paths
    /^\/_ws$/,
    /^\/ws$/,
    /^\/socket\.io/,
    
    // Common framework assets
    /^\/static\/chunks\//,
    /^\/static\/development\//,
    /^\/static\/webpack\//,
    /^\/_buildManifest\.js/,
    /^\/_ssgManifest\.js/,
    
    // Analytics & tracking (often noise)
    /^\/gtm\.js/,
    /^\/gtag\//,
    /\/analytics/,
    /\/collect\?/,
    
    // CDN/RUM (Real User Monitoring)
    /^\/cdn-cgi\//,
    
    // HMR (Hot Module Replacement)
    /\?t=\d+$/,
    /^\/hmr$/
];

/**
 * Check if a URL path is out-of-scope (framework noise)
 * @param {string} url - Full URL or path
 * @returns {boolean} True if the path matches OOS patterns
 */
export function isOutOfScope(url) {
    try {
        const urlObj = new URL(url, 'http://dummy');
        const path = urlObj.pathname + urlObj.search;
        return oosPatterns.some(pattern => pattern.test(path));
    } catch {
        return oosPatterns.some(pattern => pattern.test(url));
    }
}

export function addRequest(request) {
    // Assign request number
    state.requestCounter++;
    request.num = state.requestCounter;
    // Mark if OOS - the URL is in request.request.url
    request.isOOS = isOutOfScope(request.request.url);
    state.requests.push(request);
    return state.requests.length - 1; // Return index
}

export function clearRequests() {
    state.requests = [];
    state.selectedRequest = null;
    state.requestHistory = [];
    state.historyIndex = -1;
    state.regularRequestBaseline = null;
    state.currentResponse = null;
    state.requestCounter = 0;
}

export function addToHistory(rawText, useHttps) {
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
}
