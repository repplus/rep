// State Management

export const state = {
    requests: [],
    selectedRequest: null,
    currentFilter: 'all', // all, GET, POST, etc. (legacy, kept for compatibility)
    selectedMethods: new Set(), // Set of selected HTTP methods (e.g., ['GET', 'POST'])
    starFilterActive: false, // Whether star filter is active
    currentColorFilter: 'all', // all, red, green, blue, etc.
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
    // Group Starring
    starredPages: new Set(),
    starredDomains: new Set(),
    // Timeline Filter
    timelineFilterTimestamp: null,
    timelineFilterRequestIndex: null,
    // Group Collapse State
    manuallyCollapsed: false,
    // Attack Surface Grouping (per-domain)
    attackSurfaceCategories: {}, // { requestIndex: { category, confidence, reasoning, icon } }
    domainsWithAttackSurface: new Set(), // Track which domains have been analyzed
    isAnalyzingAttackSurface: false,
    // Request blocking/stepping
    blockRequests: false,
    blockedQueue: [],
    // postMessage Monitor
    pmMonitor: {
        enabled: false,
        listeners: [],
        messages: [],
        searchTerm: '',
        highlightTerms: ['token','auth','login','session','redirect','location','html','innerHTML','eval','action','event','success','challenge','retry'],
        selectedListenerId: null
    }
};

export function addRequest(request) {
    // Initialize defaults
    request.starred = false;
    request.color = null;
    // Optional human-friendly name for the request (used for inline rename & search)
    if (typeof request.name !== 'string') {
        request.name = null;
    }
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
    state.timelineFilterTimestamp = null;
    state.timelineFilterRequestIndex = null;
    state.attackSurfaceCategories = {};
    state.domainsWithAttackSurface.clear();
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
