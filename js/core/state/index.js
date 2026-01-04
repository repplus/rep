// State Management - Main Entry Point
// This module provides a unified state object for backward compatibility
// while organizing state into logical namespaces internally

import { requestState } from './requests.js';
import { filterState } from './filters.js';
import { historyState } from './history.js';
import { undoRedoState } from './undo-redo.js';
import { bulkReplayState } from './bulk-replay.js';
import { diffState } from './diff.js';
import { starringState } from './starring.js';
import { timelineState } from './timeline.js';
import { uiState } from './ui.js';
import { attackSurfaceState } from './attack-surface.js';
import { blockingState } from './blocking.js';

// Unified state object for backward compatibility
// All existing code can continue using state.requests, state.currentFilter, etc.
export const state = {
    // Request state
    ...requestState,
    
    // Filter state
    ...filterState,
    
    // History state
    ...historyState,
    
    // Undo/Redo state
    ...undoRedoState,
    
    // Bulk Replay state
    ...bulkReplayState,
    
    // Diff state
    ...diffState,
    
    // Starring state
    ...starringState,
    
    // Timeline state
    ...timelineState,
    
    // UI state
    ...uiState,
    
    // Attack Surface state
    ...attackSurfaceState,
    
    // Blocking state
    ...blockingState
};

// Re-export individual state objects for direct access if needed
export { requestState, filterState, historyState, undoRedoState, bulkReplayState };
export { diffState, starringState, timelineState, uiState };
export { attackSurfaceState, blockingState };

// Re-export actions (new centralized state mutations)
export { actions, requestActions, filterActions, starringActions, blockingActions, timelineActions, historyActions, diffActions, attackSurfaceActions } from './actions.js';

// Import actions for use in legacy functions
import { requestActions, historyActions } from './actions.js';

// Legacy helper functions (kept for backward compatibility, now use actions)
// These now delegate to actions to ensure events are emitted
export function addRequest(request) {
    return requestActions.add(request);
}

export function clearRequests() {
    requestActions.clearAll();
}

export function addToHistory(rawText, useHttps) {
    historyActions.add(rawText, useHttps);
}

