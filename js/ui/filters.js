// Filters Module - Handles search, regex, method, star, and color filtering
import { state, actions } from '../core/state.js';
import { elements } from './main-ui.js';
import { events, EVENT_NAMES } from '../core/events.js';

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'XHR'];

/**
 * Sets up search and regex filter controls
 */
function setupSearchFilter() {
    if (elements.searchBar) {
        elements.searchBar.addEventListener('input', (e) => {
            // Use action to set search (automatically emits events)
            actions.filter.setSearch(e.target.value.toLowerCase(), state.useRegex);
        });
    }

    if (elements.regexToggle) {
        elements.regexToggle.addEventListener('click', () => {
            const newUseRegex = !state.useRegex;
            // Use action to set search with new regex flag
            actions.filter.setSearch(state.currentSearchTerm, newUseRegex);
            elements.regexToggle.classList.toggle('active', newUseRegex);
            elements.regexToggle.title = newUseRegex
                ? 'Regex mode enabled (click to disable)'
                : 'Toggle Regex Mode (enable to use regex patterns)';
        });
    }
}

/**
 * Sets up method filter dropdown (multi-select)
 */
function setupMethodFilter() {
    if (!elements.methodFilterBtn || !elements.methodFilterMenu) return;
    
    const methodCheckboxes = elements.methodFilterMenu ? Array.from(elements.methodFilterMenu.querySelectorAll('.method-checkbox')) : [];
    const methodItems = elements.methodFilterMenu ? Array.from(elements.methodFilterMenu.querySelectorAll('.method-filter-item')) : [];

    const updateMethodFilterUI = () => {
        // Update checkboxes
        methodCheckboxes.forEach(checkbox => {
            const method = checkbox.dataset.filter;
            checkbox.checked = state.selectedMethods.has(method);
        });

        // Update item active state
        methodItems.forEach(item => {
            const method = item.dataset.filter;
            item.classList.toggle('active', state.selectedMethods.has(method));
        });

        // Update label
        if (elements.methodFilterLabel) {
            if (state.selectedMethods.size === 0) {
                elements.methodFilterLabel.textContent = 'All';
            } else if (state.selectedMethods.size === ALL_METHODS.length) {
                elements.methodFilterLabel.textContent = 'All';
            } else if (state.selectedMethods.size <= 3) {
                elements.methodFilterLabel.textContent = Array.from(state.selectedMethods).join(', ');
            } else {
                elements.methodFilterLabel.textContent = `${state.selectedMethods.size} methods`;
            }
        }

        // Visual cue on the pill when filter is active
        if (elements.methodFilterBtn) {
            elements.methodFilterBtn.classList.toggle('active', state.selectedMethods.size > 0 && state.selectedMethods.size < ALL_METHODS.length);
        }

        // Use action to set selected methods (automatically updates currentFilter and emits events)
        actions.filter.setSelectedMethods(new Set(state.selectedMethods));
    };

    const toggleMethod = (method) => {
        const newMethods = new Set(state.selectedMethods);
        if (newMethods.has(method)) {
            newMethods.delete(method);
        } else {
            newMethods.add(method);
        }
        // Use action to set methods (automatically emits events)
        actions.filter.setSelectedMethods(newMethods);
        // Update UI (filter action already emitted UI_UPDATE_REQUEST_LIST, but we need to update checkboxes)
        updateMethodFilterUI();
    };

    const selectAllMethods = () => {
        const allMethods = new Set(ALL_METHODS);
        // Use action to set methods
        actions.filter.setSelectedMethods(allMethods);
        updateMethodFilterUI();
    };

    const clearAllMethods = () => {
        // Use action to set methods
        actions.filter.setSelectedMethods(new Set());
        updateMethodFilterUI();
    };

    elements.methodFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.methodFilterMenu.classList.toggle('open');
    });

        // Handle checkbox clicks
        methodCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const method = checkbox.dataset.filter;
                toggleMethod(method);
            });
        });

        // Handle item clicks (clicking anywhere on the item toggles the checkbox)
        methodItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't toggle if clicking directly on the checkbox (it handles its own event)
                if (e.target.type === 'checkbox') return;
                e.stopPropagation();
                const checkbox = item.querySelector('.method-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    toggleMethod(checkbox.dataset.filter);
                }
            });
        });

    // Select all button
    if (elements.methodSelectAllBtn) {
        elements.methodSelectAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAllMethods();
        });
    }

    // Clear all button
    if (elements.methodClearAllBtn) {
        elements.methodClearAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearAllMethods();
        });
    }

    document.addEventListener('click', (e) => {
        if (elements.methodFilterMenu.contains(e.target) || elements.methodFilterBtn.contains(e.target)) return;
        elements.methodFilterMenu.classList.remove('open');
    });

    // Initialize UI
    updateMethodFilterUI();
}

/**
 * Sets up star filter toggle
 */
function setupStarFilter() {
    const starFilterBtn = document.querySelector('.filter-btn[data-filter="starred"]');

    if (starFilterBtn) {
        // Initialize button state
        starFilterBtn.classList.toggle('active', state.starFilterActive);
        
        starFilterBtn.addEventListener('click', () => {
            const currentlyActive = starFilterBtn.classList.contains('active');
            const newActive = !currentlyActive;
            
            // Use action to set star filter (automatically emits events)
            actions.filter.setStarFilter(newActive);
            
            // Update UI
            starFilterBtn.classList.toggle('active', newActive);
            if (elements.methodFilterMenu) elements.methodFilterMenu.classList.remove('open');
        });
    }
}

/**
 * Sets up color filter picker
 */
function setupColorFilter() {
    if (!elements.colorFilterBtn) return;

    elements.colorFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close any existing popovers
        document.querySelectorAll('.color-picker-popover').forEach(el => el.remove());

        const popover = document.createElement('div');
        popover.className = 'color-picker-popover';
        popover.style.top = '100%';
        popover.style.left = '0'; // Align left
        popover.style.right = 'auto';

        const colors = ['all', 'red', 'green', 'blue', 'yellow', 'purple', 'orange'];
        const colorValues = {
            'all': 'transparent',
            'red': '#ff6b6b', 'green': '#51cf66', 'blue': '#4dabf7',
            'yellow': '#ffd43b', 'purple': '#b197fc', 'orange': '#ff922b'
        };

        colors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = `color-swatch ${color === 'all' ? 'none' : ''}`;
            if (color !== 'all') swatch.style.backgroundColor = colorValues[color];
            swatch.title = color === 'all' ? 'Show All' : color.charAt(0).toUpperCase() + color.slice(1);

            // Highlight active filter
            if (state.currentColorFilter === color) {
                swatch.style.border = '2px solid var(--accent-color)';
                swatch.style.transform = 'scale(1.1)';
            }

            swatch.onclick = (e) => {
                e.stopPropagation();
                // Use action to set color filter (automatically emits events)
                actions.filter.setColorFilter(color);

                // Update button style
                if (color === 'all') {
                    elements.colorFilterBtn.classList.remove('active');
                    elements.colorFilterBtn.style.color = '';
                } else {
                    elements.colorFilterBtn.classList.add('active');
                    elements.colorFilterBtn.style.color = colorValues[color];
                }

                events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
                popover.remove();
            };
            popover.appendChild(swatch);
        });

        elements.colorFilterBtn.appendChild(popover);
        elements.colorFilterBtn.style.position = 'relative'; // Ensure popover positions correctly

        // Close on click outside
        const closeHandler = (e) => {
            if (!popover.contains(e.target) && e.target !== elements.colorFilterBtn) {
                popover.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    });
}

/**
 * Initializes all filter controls
 */
export function setupFilters() {
    setupSearchFilter();
    setupMethodFilter();
    setupStarFilter();
    setupColorFilter();
}

