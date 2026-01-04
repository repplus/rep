// Event Bus for decoupled module communication
// This eliminates circular dependencies and tight coupling between UI modules

class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} - Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Data to pass to listeners
     */
    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => {
            try {
                cb(data);
            } catch (error) {
                console.error(`Error in event listener for "${event}":`, error);
            }
        });
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     */
    off(event, callback) {
        const callbacks = this.listeners.get(event) || [];
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * Remove all listeners for an event
     * @param {string} event - Event name (optional, removes all if not provided)
     */
    removeAllListeners(event) {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number} - Number of listeners
     */
    listenerCount(event) {
        return (this.listeners.get(event) || []).length;
    }
}

// Export singleton instance
export const events = new EventBus();

// Event name constants for type safety and discoverability
export const EVENT_NAMES = {
    // Request events
    REQUEST_SELECTED: 'request:selected',
    REQUEST_STARRED: 'request:starred',
    REQUEST_COLOR_CHANGED: 'request:color-changed',
    REQUEST_FILTERED: 'request:filtered',
    REQUEST_RENDERED: 'request:rendered',
    REQUEST_STAR_UPDATED: 'request:star-updated',
    REQUEST_ACTION_STAR: 'request:action:star',
    REQUEST_ACTION_GROUP_STAR: 'request:action:group-star',
    REQUEST_ACTION_DELETE_GROUP: 'request:action:delete-group',
    REQUEST_ACTION_TIMELINE: 'request:action:timeline',
    REQUEST_ACTION_COLOR: 'request:action:color',
    
    // UI events
    UI_RESIZE: 'ui:resize',
    UI_THEME_CHANGED: 'ui:theme-changed',
    UI_VIEW_SWITCHED: 'ui:view-switched',
    UI_LAYOUT_TOGGLED: 'ui:layout-toggled',
    UI_REQUEST_SELECTED: 'ui:request-selected',
    UI_UPDATE_REQUEST_CONTENT: 'ui:update-request-content',
    UI_GET_REQUEST_CONTENT: 'ui:get-request-content',
    UI_UPDATE_REQUEST_LIST: 'ui:update-request-list',
    UI_UPDATE_HISTORY_BUTTONS: 'ui:update-history-buttons',
    UI_UPDATE_RAW_REQUEST: 'ui:update-raw-request',
    UI_UPDATE_RESPONSE_VIEW: 'ui:update-response-view',
    UI_UPDATE_REGEX_TOGGLE: 'ui:update-regex-toggle',
    UI_UPDATE_DIFF_TOGGLE_VISIBILITY: 'ui:update-diff-toggle-visibility',
    UI_CLEAR_ALL: 'ui:clear-all',
    
    // Network events
    NETWORK_REQUEST_CAPTURED: 'network:request-captured',
    NETWORK_RESPONSE_RECEIVED: 'network:response-received',
    NETWORK_ERROR: 'network:error',
    
    // State events
    STATE_REQUESTS_CLEARED: 'state:requests-cleared',
    STATE_FILTER_CHANGED: 'state:filter-changed',
    STATE_SEARCH_CHANGED: 'state:search-changed',
    
    // History events
    HISTORY_UPDATED: 'history:updated',
    HISTORY_NAVIGATED: 'history:navigated',
    
    // Export/Import events
    REQUESTS_EXPORTED: 'requests:exported',
    REQUESTS_IMPORTED: 'requests:imported',
};

