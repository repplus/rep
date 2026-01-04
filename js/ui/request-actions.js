// Request Actions Module - Filtering, starring, colors, timeline
import { state, actions } from '../core/state.js';
import { formatTime } from '../core/utils/format.js';
import { getHostname } from '../core/utils/network.js';
import { events, EVENT_NAMES } from '../core/events.js';

// Set up event listeners for decoupled communication
events.on(EVENT_NAMES.REQUEST_ACTION_STAR, (data) => {
    if (data && data.request) {
        toggleStar(data.request);
    }
});

events.on(EVENT_NAMES.REQUEST_ACTION_GROUP_STAR, (data) => {
    if (data && data.type && data.hostname && data.btn) {
        toggleGroupStar(data.type, data.hostname, data.btn);
    }
});

events.on(EVENT_NAMES.REQUEST_ACTION_DELETE_GROUP, (data) => {
    if (data && data.type && data.hostname && data.groupElement) {
        deleteGroup(data.type, data.hostname, data.groupElement);
    }
});

// Note: REQUEST_ACTION_TIMELINE is emitted by UI components (like request-list.js) to trigger timeline filter
// The action itself (actions.timeline.setFilter) does NOT emit this event to avoid circular loops
// This listener is kept for backward compatibility if any code still emits this event
events.on(EVENT_NAMES.REQUEST_ACTION_TIMELINE, (data) => {
    if (data && typeof data.timestamp === 'number' && typeof data.requestIndex === 'number') {
        setTimelineFilter(data.timestamp, data.requestIndex);
    }
});

events.on(EVENT_NAMES.REQUEST_ACTION_COLOR, (data) => {
    if (data && typeof data.index === 'number') {
        setRequestColor(data.index, data.color);
    }
});

const STAR_ICON_FILLED = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
const STAR_ICON_OUTLINE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.01 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>';

// Helper to get request list element
function getRequestList() {
    return document.getElementById('request-list');
}

export function toggleStar(request) {
    const requestIndex = state.requests.indexOf(request);
    
    // Use action to update state (automatically emits events)
    actions.request.toggleStar(request, requestIndex);
    
    // Update UI directly (since we're in the UI layer)
    const requestList = getRequestList();
    if (requestIndex !== -1 && requestList) {
        const item = requestList.querySelector(`.request-item[data-index="${requestIndex}"]`);
        if (item) {
            item.classList.toggle('starred', request.starred);
            const starBtn = item.querySelector('.star-btn');
            if (starBtn) {
                starBtn.classList.toggle('active', request.starred);
                starBtn.innerHTML = request.starred ? STAR_ICON_FILLED : STAR_ICON_OUTLINE;
                starBtn.title = request.starred ? 'Unstar' : 'Star request';
            }
        }
    }
}

export function toggleGroupStar(type, hostname, btn) {
    const isPage = type === 'page';
    const set = isPage ? state.starredPages : state.starredDomains;
    const currentlyStarred = set.has(hostname);
    const newStatus = !currentlyStarred;

    // Use action to update state (automatically emits events)
    actions.request.toggleGroupStar(type, hostname, newStatus);
    
    // Update UI button
    if (newStatus) {
        btn.classList.add('active');
        btn.innerHTML = STAR_ICON_FILLED;
        btn.title = 'Unstar Group';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = STAR_ICON_OUTLINE;
        btn.title = 'Star Group';
    }
}

export function deleteGroup(type, hostname, groupElement) {
    // Use action to delete group (automatically handles state and events)
    const removedFromQueue = actions.request.deleteGroup(type, hostname);

    // Animate fade-out and remove the group element from DOM
    if (groupElement) {
        groupElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        groupElement.style.opacity = '0';
        groupElement.style.transform = 'translateX(-10px)';
        
        // Remove from DOM after animation completes
        setTimeout(() => {
            if (groupElement.parentNode) {
                groupElement.parentNode.removeChild(groupElement);
            }
        }, 300);
    }
}

export function toggleAllGroups() {
    const requestList = getRequestList();
    if (!requestList) return;
    
    const pageGroups = requestList.querySelectorAll('.page-group');
    const domainGroups = requestList.querySelectorAll('.domain-group');
    const categoryGroups = requestList.querySelectorAll('.attack-surface-category');
    const allGroups = [...pageGroups, ...domainGroups, ...categoryGroups];

    // Check ALL groups to determine if we should collapse or expand
    // This ensures that if a category is expanded (even inside a collapsed group), we trigger collapse
    const anyExpanded = allGroups.some(g => {
        if (g.classList.contains('attack-surface-category')) {
            const content = g.querySelector('.category-content');
            // If display is empty (default) or block, it's expanded
            return content && content.style.display !== 'none';
        }
        return g.classList.contains('expanded');
    });

    const shouldExpand = !anyExpanded;

    // Set a flag to prevent auto-expand from overriding this manual action
    state.manuallyCollapsed = !shouldExpand;

    allGroups.forEach(group => {
        if (group.classList.contains('attack-surface-category')) {
            const content = group.querySelector('.category-content');
            const toggle = group.querySelector('.category-toggle');

            if (content && toggle) {
                if (shouldExpand) {
                    content.style.display = 'block';
                    toggle.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    toggle.textContent = '▶';
                }
            }
        } else {
            // Toggle class on group
            if (shouldExpand) {
                group.classList.add('expanded');
            } else {
                group.classList.remove('expanded');
            }

            // Clean up any inline styles that might have been set previously
            const pageContent = group.querySelector('.page-content');
            const domainContent = group.querySelector('.domain-content');

            if (pageContent) pageContent.style.display = '';
            if (domainContent) domainContent.style.display = '';

            // Update toggle icons
            const pageToggle = group.querySelector('.page-toggle-btn');
            const domainToggle = group.querySelector('.domain-toggle-btn');

            if (shouldExpand) {
                if (pageToggle) pageToggle.style.transform = 'rotate(90deg)';
                if (domainToggle) domainToggle.style.transform = 'rotate(90deg)';
            } else {
                if (pageToggle) pageToggle.style.transform = 'rotate(0deg)';
                if (domainToggle) domainToggle.style.transform = 'rotate(0deg)';
            }
        }
    });
}

export function setTimelineFilter(timestamp, requestIndex) {
    if (state.timelineFilterTimestamp === timestamp && state.timelineFilterRequestIndex === requestIndex) {
        // Clear filter if clicking the same timestamp
        actions.timeline.clear();
        // Restore grouped view by re-rendering all requests
        restoreGroupedView();
    } else {
        // Use action to set timeline filter (automatically emits events)
        actions.timeline.setFilter(timestamp, requestIndex);
        // Re-sort requests chronologically when timeline filter is active
        sortRequestsChronologically();
    }

    // Update UI indicator
    updateTimelineFilterIndicator();
}

function restoreGroupedView() {
    // Clear and rebuild the entire request list
    const requestList = getRequestList();
    if (requestList) {
        requestList.innerHTML = '';
    }
    // Emit event to re-render all requests
    events.emit('request:restore-grouped-view');
}

function sortRequestsChronologically() {
    // When timeline filter is active, show a flat chronological view
    // Build from state.requests array to ensure correct order

    // Filter and sort requests that should be shown
    const filteredRequests = state.requests
        .map((request, index) => ({ request, index }))
        .filter(({ request }) => {
            // Only include requests that pass the timeline filter
            if (state.timelineFilterTimestamp !== null) {
                return request.capturedAt <= state.timelineFilterTimestamp;
            }
            return true;
        })
        .sort((a, b) => {
            // Primary sort: by timestamp (DESCENDING - newest first)
            const timeA = a.request.capturedAt || 0;
            const timeB = b.request.capturedAt || 0;
            if (timeA !== timeB) {
                return timeB - timeA; // Reversed: newer timestamps first
            }
            // Secondary sort: by request index (DESCENDING - higher index first)
            return b.index - a.index; // Reversed: clicked request at top
        });

    // Clear the request list
    const requestList = getRequestList();
    if (!requestList) return;
    
    requestList.innerHTML = '';

    // Create a flat container
    const flatContainer = document.createElement('div');
    flatContainer.id = 'flat-timeline-view';
    flatContainer.style.cssText = 'display: flex; flex-direction: column;';

    // Add a header
    const header = document.createElement('div');
    header.style.cssText = 'padding: 8px 12px; background: rgba(138, 180, 248, 0.1); border-bottom: 1px solid var(--border-color); font-size: 11px; color: var(--accent-color); font-weight: 500;';
    header.textContent = `📋 Timeline View (${filteredRequests.length} requests)`;
    flatContainer.appendChild(header);

    // Render each request in order using the existing renderRequestItem logic
    filteredRequests.forEach(({ request, index }) => {
        // Create request item inline (similar to renderRequestItem but without grouping)
        const item = document.createElement('div');
        item.className = 'request-item';
        if (request.starred) item.classList.add('starred');
        if (request.color) item.classList.add(`color-${request.color}`);
        item.dataset.index = index;
        item.dataset.method = request.request.method;

        const methodSpan = document.createElement('span');
        methodSpan.className = `req-method ${request.request.method}`;
        methodSpan.textContent = request.request.method;

        // Add domain badge in timeline view
        const domainBadge = document.createElement('span');
        domainBadge.className = 'domain-badge';
        const hostname = getHostname(request.request.url);
        domainBadge.textContent = hostname;
        domainBadge.title = `Domain: ${hostname}`;

        // Generate a consistent color based on hostname
        const hashCode = hostname.split('').reduce((acc, char) => {
            return char.charCodeAt(0) + ((acc << 5) - acc);
        }, 0);
        const hue = Math.abs(hashCode % 360);
        domainBadge.style.backgroundColor = `hsla(${hue}, 60%, 50%, 0.15)`;
        domainBadge.style.color = `hsl(${hue}, 60%, 70%)`;

        const urlSpan = document.createElement('span');
        urlSpan.className = 'req-url';

        if (request.fromOtherTab) {
            const globeIcon = document.createElement('span');
            globeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" style="vertical-align: -2px; margin-right: 4px; opacity: 0.7;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>';
            globeIcon.title = "Captured from another tab";
            urlSpan.appendChild(globeIcon);
        }

        try {
            const urlObj = new URL(request.request.url);
            urlSpan.appendChild(document.createTextNode(urlObj.pathname + urlObj.search));
        } catch (e) {
            urlSpan.appendChild(document.createTextNode(request.request.url));
        }
        urlSpan.title = request.request.url;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'req-time';
        timeSpan.textContent = formatTime(request.capturedAt);
        if (request.capturedAt) {
            const date = new Date(request.capturedAt);
            timeSpan.title = date.toLocaleTimeString();
        }

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';

        const starBtn = document.createElement('button');
        starBtn.className = `star-btn ${request.starred ? 'active' : ''}`;
        starBtn.innerHTML = request.starred ? STAR_ICON_FILLED : STAR_ICON_OUTLINE;
        starBtn.title = request.starred ? 'Unstar' : 'Star request';
        starBtn.onclick = (e) => {
            e.stopPropagation();
            toggleStar(request);
        };

        // Color Picker Button
        const colorBtn = document.createElement('button');
        colorBtn.className = 'color-btn';
        colorBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>';
        colorBtn.title = 'Tag with color';

        colorBtn.onclick = (e) => {
            e.stopPropagation();
            // Close any existing popovers
            document.querySelectorAll('.color-picker-popover').forEach(el => el.remove());

            const popover = document.createElement('div');
            popover.className = 'color-picker-popover';

            const colors = ['none', 'red', 'green', 'blue', 'yellow', 'purple', 'orange'];
            const colorValues = {
                'red': '#ff6b6b', 'green': '#51cf66', 'blue': '#4dabf7',
                'yellow': '#ffd43b', 'purple': '#b197fc', 'orange': '#ff922b'
            };

            colors.forEach(color => {
                const swatch = document.createElement('div');
                swatch.className = `color-swatch ${color === 'none' ? 'none' : ''}`;
                if (color !== 'none') swatch.style.backgroundColor = colorValues[color];
                swatch.title = color.charAt(0).toUpperCase() + color.slice(1);

                swatch.onclick = (e) => {
                    e.stopPropagation();
                    setRequestColor(index, color === 'none' ? null : color);
                    popover.remove();
                };
                popover.appendChild(swatch);
            });

            colorBtn.appendChild(popover);

            // Close on click outside
            const closeHandler = (e) => {
                if (!popover.contains(e.target) && e.target !== colorBtn) {
                    popover.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        };

        const timelineBtn = document.createElement('button');
        timelineBtn.className = 'timeline-btn';
        if (index === state.timelineFilterRequestIndex) {
            timelineBtn.classList.add('active');
        }
        timelineBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor"/>
        </svg>`;
        timelineBtn.title = 'Show requests before this one';
        timelineBtn.onclick = (e) => {
            e.stopPropagation();
            setTimelineFilter(request.capturedAt, index);
        };

        const numberSpan = document.createElement('span');
        numberSpan.className = 'req-number';
        numberSpan.textContent = `#${index + 1}`;
        numberSpan.style.cssText = 'margin-right: 8px; color: var(--text-secondary); font-size: 11px; min-width: 30px; display: inline-block; text-align: right;';

        actionsDiv.appendChild(starBtn);
        actionsDiv.appendChild(colorBtn);
        actionsDiv.appendChild(timelineBtn);

        item.appendChild(numberSpan);
        item.appendChild(methodSpan);
        item.appendChild(domainBadge);
        item.appendChild(urlSpan);
        item.appendChild(timeSpan);
        item.appendChild(actionsDiv);

        item.addEventListener('click', () => {
            events.emit(EVENT_NAMES.REQUEST_SELECTED, index);
        });
        item.style.paddingLeft = '12px';

        flatContainer.appendChild(item);
    });

    requestList.appendChild(flatContainer);
}

function updateTimelineFilterIndicator() {
    const requestList = getRequestList();
    if (!requestList) return;
    
    const allTimelineButtons = requestList.querySelectorAll('.timeline-btn');
    allTimelineButtons.forEach(btn => {
        const item = btn.closest('.request-item');
        if (item) {
            const index = parseInt(item.dataset.index);

            if (index === state.timelineFilterRequestIndex) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

export function getFilteredRequests() {
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

export function setRequestColor(index, color) {
    // Use action to set color (automatically emits events)
    actions.request.setColor(index, color);

    // Update DOM elements (both grouped and timeline view)
    const requestList = getRequestList();
    if (!requestList) return;
    
    const items = requestList.querySelectorAll(`.request-item[data-index="${index}"]`);
    items.forEach(item => {
        // Remove all color classes
        item.classList.remove('color-red', 'color-green', 'color-blue', 'color-yellow', 'color-purple', 'color-orange');
        if (color) {
            item.classList.add(`color-${color}`);
        }
    });
}

// Note: filterRequests is defined in request-list.js to avoid circular dependency

