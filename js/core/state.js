// State Management - Backward Compatibility Wrapper
// This file re-exports from the new namespaced state structure
// All existing imports continue to work without changes

export { state, addRequest, clearRequests, addToHistory, actions } from './state/index.js';

// Re-export individual state objects for direct access if needed
export {
    requestState,
    filterState,
    historyState,
    undoRedoState,
    bulkReplayState,
    diffState,
    starringState,
    timelineState,
    uiState,
    attackSurfaceState,
    blockingState
} from './state/index.js';

// Re-export action creators for convenience
export {
    requestActions,
    filterActions,
    starringActions,
    blockingActions,
    timelineActions,
    historyActions,
    diffActions,
    attackSurfaceActions
} from './state/index.js';
