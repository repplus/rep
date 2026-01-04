// Request List Rendering Module
import { state } from '../core/state.js';
import { formatTime } from '../core/utils/format.js';
import { escapeHtml } from '../core/utils/dom.js';
import { getHostname } from '../core/utils/network.js';
import { events, EVENT_NAMES } from '../core/events.js';

const STAR_ICON_FILLED = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
const STAR_ICON_OUTLINE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.01 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>';

export function createPageGroup(pageUrl) {
    const pageHostname = getHostname(pageUrl);
    const group = document.createElement('div');
    group.className = 'page-group';
    group.id = `page-${pageHostname.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    group.dataset.pageUrl = pageUrl;

    const header = document.createElement('div');
    header.className = 'page-header';

    const hasAnalysis = state.domainsWithAttackSurface.has(pageHostname);

    header.innerHTML = `
        <span class="page-toggle-btn">▶</span>
        <span class="page-icon">📄</span>
        <span class="page-name">${escapeHtml(pageHostname)}</span>
        <span class="page-count">(0)</span>
        <button class="group-ai-btn ${hasAnalysis ? 'analyzed' : ''}" title="${hasAnalysis ? 'Show Normal View' : 'Analyze Attack Surface'}">
            ${hasAnalysis ? '📋' : '⚡'}
        </button>
        <button class="group-star-btn ${state.starredPages.has(pageHostname) ? 'active' : ''}" title="${state.starredPages.has(pageHostname) ? 'Unstar Group' : 'Star Group'}">
            ${state.starredPages.has(pageHostname) ? STAR_ICON_FILLED : STAR_ICON_OUTLINE}
        </button>
        <button class="group-delete-btn" title="Delete Group">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
    `;

    const content = document.createElement('div');
    content.className = 'page-content';

    header.addEventListener('click', (e) => {
        // Don't toggle if clicking on buttons
        if (e.target.closest('.group-ai-btn') || e.target.closest('.group-star-btn') || e.target.closest('.group-delete-btn')) return;

        group.classList.toggle('expanded');

        // If collapsing the page, also collapse third-party domain groups for cleanliness
        if (!group.classList.contains('expanded')) {
            const domainGroups = group.querySelectorAll('.domain-group');
            domainGroups.forEach(domainGroup => {
                domainGroup.classList.remove('expanded');
                const toggle = domainGroup.querySelector('.group-toggle');
                if (toggle) toggle.textContent = '▶';
            });
        }
    });

    // AI button handler
    const aiBtn = header.querySelector('.group-ai-btn');
    aiBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        const hasAnalysis = state.domainsWithAttackSurface.has(pageHostname);

        if (hasAnalysis) {
            // Toggle back to normal view
            state.domainsWithAttackSurface.delete(pageHostname);
            aiBtn.classList.remove('analyzed');
            aiBtn.title = 'Analyze Attack Surface';
            aiBtn.textContent = '⚡';

            // Re-render requests for this domain
            reRenderDomainRequests(pageHostname);
            events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
        } else {
            // Analyze - use window function to avoid circular dependency
            if (window.analyzeDomainAttackSurface) {
                await window.analyzeDomainAttackSurface(pageHostname, group);
            }
        }
    });

    const starBtn = header.querySelector('.group-star-btn');
    starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        events.emit(EVENT_NAMES.REQUEST_ACTION_GROUP_STAR, { type: 'page', hostname: pageHostname, btn: starBtn });
    });

    const deleteBtn = header.querySelector('.group-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        events.emit(EVENT_NAMES.REQUEST_ACTION_DELETE_GROUP, { type: 'page', hostname: pageHostname, groupElement: group });
    });

    group.appendChild(header);
    group.appendChild(content);

    return group;
}

// Root path group for first-party requests under a page
function createPathGroup() {
    const group = document.createElement('div');
    group.className = 'path-group expanded'; // default expanded
    group.id = 'path-root';

    const header = document.createElement('div');
    header.className = 'path-header';
    header.innerHTML = `
        <span class="group-toggle">▼</span>
        <span class="path-icon">🗂️</span>
        <span class="path-name">/</span>
        <span class="path-count">(0)</span>
    `;

    const content = document.createElement('div');
    content.className = 'path-content';

    header.addEventListener('click', (e) => {
        // No buttons to skip; entire header toggles
        group.classList.toggle('expanded');
        const toggle = header.querySelector('.group-toggle');
        const isExpanded = group.classList.contains('expanded');
        if (toggle) toggle.textContent = isExpanded ? '▼' : '▶';
    });

    group.appendChild(header);
    group.appendChild(content);
    return group;
}

export function createDomainGroup(hostname, isThirdParty = false) {
    const group = document.createElement('div');
    group.className = `domain-group${isThirdParty ? ' third-party' : ''}`;
    group.id = `domain-${hostname.replace(/[^a-zA-Z0-9-]/g, '-')}`;

    const header = document.createElement('div');
    header.className = 'domain-header';
    header.innerHTML = `
        <span class="group-toggle">▶</span>
        <span class="domain-icon">🌐</span>
        <span class="domain-name">${escapeHtml(hostname)}</span>
        <span class="domain-count">(0)</span>
        <button class="group-star-btn ${state.starredDomains.has(hostname) ? 'active' : ''}" title="${state.starredDomains.has(hostname) ? 'Unstar Group' : 'Star Group'}">
            ${state.starredDomains.has(hostname) ? STAR_ICON_FILLED : STAR_ICON_OUTLINE}
        </button>
        <button class="group-delete-btn" title="Delete Group">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
    `;

    const content = document.createElement('div');
    content.className = 'domain-content';

    header.addEventListener('click', (e) => {
        // Don't toggle if clicking on buttons
        if (e.target.closest('.group-star-btn') || e.target.closest('.group-delete-btn')) return;
        
        group.classList.toggle('expanded');
        const toggle = header.querySelector('.group-toggle');
        toggle.textContent = group.classList.contains('expanded') ? '▼' : '▶';
    });

    const starBtn = header.querySelector('.group-star-btn');
    starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        events.emit(EVENT_NAMES.REQUEST_ACTION_GROUP_STAR, { type: 'domain', hostname, btn: starBtn });
    });

    const deleteBtn = header.querySelector('.group-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        events.emit(EVENT_NAMES.REQUEST_ACTION_DELETE_GROUP, { type: 'domain', hostname, groupElement: group });
    });

    group.appendChild(header);
    group.appendChild(content);

    return group;
}

export function createRequestItemElement(request, index, categoryData) {
    const item = document.createElement('div');
    item.className = 'request-item';
    if (request.starred) item.classList.add('starred');
    if (request.color) item.classList.add(`color-${request.color}`);
    item.dataset.index = index;
    item.dataset.method = request.request.method;

    const methodSpan = document.createElement('span');
    methodSpan.className = `req-method ${request.request.method}`;
    methodSpan.textContent = request.request.method;

    const urlSpan = document.createElement('span');
    urlSpan.className = 'req-url';

    if (request.fromOtherTab) {
        const globeIcon = document.createElement('span');
        globeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" style="vertical-align: -2px; margin-right: 4px; opacity: 0.7;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>';
        globeIcon.title = "Captured from another tab";
        urlSpan.appendChild(globeIcon);
    }

    // Compute display label: user-defined name (if present) or path+query
    let displayLabel = request.name && typeof request.name === 'string' && request.name.trim()
        ? request.name.trim()
        : null;

    try {
        const urlObj = new URL(request.request.url);
        const pathAndQuery = urlObj.pathname + urlObj.search;
        if (!displayLabel) {
            displayLabel = pathAndQuery || request.request.url;
        }
        urlSpan.appendChild(document.createTextNode(displayLabel));
        urlSpan.title = request.name
            ? `${request.name} — ${request.request.url}`
            : request.request.url;
    } catch (e) {
        // Fallback if URL constructor fails
        if (!displayLabel) {
            displayLabel = request.request.url;
    }
        urlSpan.appendChild(document.createTextNode(displayLabel));
    urlSpan.title = request.request.url;
    }

    // Time span
    const timeSpan = document.createElement('span');
    timeSpan.className = 'req-time';
    timeSpan.textContent = formatTime(request.capturedAt);
    if (request.capturedAt) {
        const date = new Date(request.capturedAt);
        timeSpan.title = date.toLocaleTimeString();
    }

    // Actions container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'item-actions';

    // Star Button
    const starBtn = document.createElement('button');
    starBtn.className = `star-btn ${request.starred ? 'active' : ''}`;
    starBtn.innerHTML = request.starred ? STAR_ICON_FILLED : STAR_ICON_OUTLINE;

    starBtn.title = request.starred ? 'Unstar' : 'Star request';
    starBtn.onclick = (e) => {
        e.stopPropagation();
        events.emit(EVENT_NAMES.REQUEST_ACTION_STAR, { request });
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
                events.emit(EVENT_NAMES.REQUEST_ACTION_COLOR, { index, color: color === 'none' ? null : color });
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

    // Timeline Filter Button
    const timelineBtn = document.createElement('button');
    timelineBtn.className = 'timeline-btn';
    timelineBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14">
        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor"/>
    </svg>`;
    timelineBtn.title = 'Show requests before this one';
    timelineBtn.onclick = (e) => {
        e.stopPropagation();
        events.emit(EVENT_NAMES.REQUEST_ACTION_TIMELINE, { timestamp: request.capturedAt, requestIndex: index });
    };

    const numberSpan = document.createElement('span');
    numberSpan.className = 'req-number';
    numberSpan.textContent = `#${index + 1}`;
    numberSpan.style.marginRight = '2px';
    numberSpan.style.color = '#9aa0a6';
    numberSpan.style.fontSize = '11px';
    numberSpan.style.minWidth = '18px';
    numberSpan.style.display = 'inline-block';
    numberSpan.style.textAlign = 'right';
    numberSpan.style.padding = '0';

    actionsDiv.appendChild(starBtn);
    actionsDiv.appendChild(colorBtn);
    actionsDiv.appendChild(timelineBtn);

    item.appendChild(numberSpan);
    item.appendChild(methodSpan);
    item.appendChild(urlSpan);
    item.appendChild(timeSpan);
    item.appendChild(actionsDiv);

    item.addEventListener('click', () => {
        events.emit(EVENT_NAMES.REQUEST_SELECTED, index);
    });

    // Inline rename: double-click the URL/label to edit request.name
    urlSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();

        // Prevent multiple editors
        if (urlSpan.querySelector('input.req-name-input')) {
            return;
        }

        const currentLabel = displayLabel || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'req-name-input';
        input.value = currentLabel;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';

        // Replace text node(s) with input
        urlSpan.innerHTML = '';
        urlSpan.appendChild(input);
        input.focus();
        input.select();

        const commit = () => {
            const newName = input.value.trim();
            // Validate request exists before updating
            if (index < 0 || index >= state.requests.length || !state.requests[index]) {
                console.warn(`Cannot rename: Request at index ${index} does not exist`);
                cancel();
                return;
            }
            const request = state.requests[index];
            if (!request || !request.request) {
                // Request was removed, restore original label
                urlSpan.innerHTML = '';
                urlSpan.appendChild(document.createTextNode(currentLabel));
                return;
            }
            // Update state
            request.name = newName || null;

            // Re-render label
            urlSpan.innerHTML = '';
            const finalLabel = newName || ((() => {
                try {
                    const urlObj = new URL(request.request.url);
                    return urlObj.pathname + urlObj.search || request.request.url;
                } catch {
                    return request.request.url;
                }
            })());
            urlSpan.appendChild(document.createTextNode(finalLabel));
            urlSpan.title = newName
                ? `${newName} — ${request.request.url}`
                : request.request.url;
        };

        const cancel = () => {
            // Restore original label without changing state
            urlSpan.innerHTML = '';
            urlSpan.appendChild(document.createTextNode(currentLabel));
            // Only set title if request still exists
            if (index >= 0 && index < state.requests.length && state.requests[index]) {
                urlSpan.title = state.requests[index].name
                    ? `${state.requests[index].name} — ${state.requests[index].request.url}`
                    : state.requests[index].request.url;
            } else {
                urlSpan.title = currentLabel;
            }
        };

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                commit();
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                cancel();
            }
        });

        input.addEventListener('blur', () => {
            commit();
        });
    });

    // Add confidence badge if category data is provided
    if (categoryData) {
        const badge = document.createElement('span');
        badge.className = `confidence-badge confidence-${categoryData.confidence}`;
        badge.textContent = categoryData.confidence;
        badge.title = categoryData.reasoning;
        badge.style.cssText = 'margin-left: 6px; font-size: 9px; padding: 2px 4px; border-radius: 2px;';
        // Insert after URL span (which is the 3rd child: number, method, url)
        // numberSpan, methodSpan, urlSpan, timeSpan, actionsDiv
        // We want it after urlSpan
        item.insertBefore(badge, timeSpan);
    }

    return item;
}

// Helper to get request list element
function getRequestList() {
    return document.getElementById('request-list');
}

export function renderRequestItem(request, index) {
    const item = createRequestItemElement(request, index);
    const requestList = getRequestList();
    if (!requestList) return;

    // Remove empty state if present
    const emptyState = requestList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Hierarchical Grouping Logic
    const pageUrl = request.pageUrl || request.request.url;
    const pageHostname = getHostname(pageUrl);
    const requestHostname = getHostname(request.request.url);

    // Find or create page group
    const pageGroupId = `page-${pageHostname.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    let pageGroup = document.getElementById(pageGroupId);

    if (!pageGroup) {
        pageGroup = createPageGroup(pageUrl);
        requestList.appendChild(pageGroup);
    }

    const pageContent = pageGroup.querySelector('.page-content');

    // Check if this is a third-party request (different domain from page)
    const isThirdParty = requestHostname !== pageHostname;

    if (isThirdParty) {
        // Find or create domain subgroup within page group
        const domainGroupId = `domain-${requestHostname.replace(/[^a-zA-Z0-9-]/g, '-')}`;
        let domainGroup = pageGroup.querySelector(`#${domainGroupId}`);

        if (!domainGroup) {
            domainGroup = createDomainGroup(requestHostname, true);
            // Append third-party groups at the end (after first-party requests)
            pageContent.appendChild(domainGroup);
        }

        const domainContent = domainGroup.querySelector('.domain-content');
        // Prepend to show most recent first
        domainContent.insertBefore(item, domainContent.firstChild);

        // Update domain count
        const domainCountSpan = domainGroup.querySelector('.domain-count');
        const domainCount = parseInt(domainCountSpan.textContent.replace(/[()]/g, '')) || 0;
        domainCountSpan.textContent = `(${domainCount + 1})`;
    } else {
        // First-party request - place under root path group
        let pathGroup = pageContent.querySelector('.path-group');
        if (!pathGroup) {
            pathGroup = createPathGroup();
            // Insert path group before domain groups (if any)
        const firstDomainGroup = pageContent.querySelector('.domain-group');
            if (firstDomainGroup) {
                pageContent.insertBefore(pathGroup, firstDomainGroup);
        } else {
                pageContent.appendChild(pathGroup);
            }
        }
        const pathContent = pathGroup.querySelector('.path-content');
        // Prepend to show most recent first
        pathContent.insertBefore(item, pathContent.firstChild);

        // Update path count
        const pathCountSpan = pathGroup.querySelector('.path-count');
        const pathCount = parseInt(pathCountSpan.textContent.replace(/[()]/g, '')) || 0;
        pathCountSpan.textContent = `(${pathCount + 1})`;
    }

    // Update page count
    const pageCountSpan = pageGroup.querySelector('.page-count');
    const pageCount = parseInt(pageCountSpan.textContent.replace(/[()]/g, '')) || 0;
    pageCountSpan.textContent = `(${pageCount + 1})`;

    events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST);
}

/**
 * Render attack surface categories for a specific domain
 */
function renderDomainAttackSurface(pageContent, pageHostname) {
    // Clear existing content
    pageContent.innerHTML = '';

    // Get all requests for this domain (page group)
    const domainRequests = state.requests
        .map((req, idx) => ({ req, idx }))
        .filter(({ req }) => {
            const requestPageHostname = getHostname(req.pageUrl || req.request.url);
            return requestPageHostname === pageHostname;
        });

    // Group by category
    const categoryGroups = {};
    domainRequests.forEach(({ req, idx }) => {
        const categoryData = state.attackSurfaceCategories[idx];
        const categoryName = categoryData?.category || 'Uncategorized';

        if (!categoryGroups[categoryName]) {
            categoryGroups[categoryName] = {
                items: [],
                icon: categoryData?.icon || '❓',
                color: getCategoryColor(categoryName)
            };
        }

        categoryGroups[categoryName].items.push({ req, idx, categoryData });
    });

    // Render each category
    Object.entries(categoryGroups).forEach(([categoryName, groupData]) => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'attack-surface-category';
        categoryDiv.style.cssText = `
            margin: 4px 0;
            border-left: 3px solid ${groupData.color};
            background: ${groupData.color}10;
        `;

        const categoryHeader = document.createElement('div');
        categoryHeader.style.cssText = `
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 600;
            color: ${groupData.color};
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        `;
        categoryHeader.innerHTML = `
            <span class="category-toggle">▼</span>
            <span>${groupData.icon}</span>
            <span>${categoryName}</span>
            <span style="opacity: 0.6; margin-left: auto;">(${groupData.items.length})</span>
        `;

        const categoryContent = document.createElement('div');
        categoryContent.className = 'category-content';

        groupData.items.forEach(({ req, idx, categoryData }) => {
            // Create request item element without DOM insertion
            const item = createRequestItemElement(req, idx, categoryData);

            categoryContent.appendChild(item);
        });

        // Toggle functionality
        categoryHeader.addEventListener('click', () => {
            const isExpanded = categoryContent.style.display !== 'none';
            categoryContent.style.display = isExpanded ? 'none' : 'block';
            categoryHeader.querySelector('.category-toggle').textContent = isExpanded ? '▶' : '▼';
        });

        categoryDiv.appendChild(categoryHeader);
        categoryDiv.appendChild(categoryContent);
        pageContent.appendChild(categoryDiv);
    });
}

/**
 * Re-render requests for a specific domain (restore normal view)
 */
function reRenderDomainRequests(pageHostname) {
    const pageGroupId = `page-${pageHostname.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    const pageGroup = document.getElementById(pageGroupId);

    if (pageGroup) {
        const pageContent = pageGroup.querySelector('.page-content');
        if (pageContent) {
            pageContent.innerHTML = ''; // Clear attack surface view

            // Find all requests for this domain and re-render them
            state.requests.forEach((req, idx) => {
                const reqHostname = getHostname(req.request?.url || req.pageUrl || '');
                // Check if request belongs to this page group (either as first-party or third-party)
                const requestPageHostname = getHostname(req.pageUrl || req.request.url);

                if (requestPageHostname === pageHostname) {
                    // This request belongs to this page group
                    // We need to use the original render logic which appends to the correct group
                    // But renderRequestItem appends to DOM based on pageUrl/hostname
                    // So we can just call it
                    events.emit(EVENT_NAMES.REQUEST_RENDERED, { request: req, index: idx });
                }
            });
        }
    }
}

/**
 * Generate a color for a category based on its name
 */
function getCategoryColor(categoryName) {
    const colors = [
        '#ff6b6b', '#51cf66', '#4dabf7', '#ffd43b',
        '#b197fc', '#ff922b', '#20c997', '#748ffc',
        '#fa5252', '#94d82d', '#339af0', '#fcc419'
    ];
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
        hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Main function to render request list
 */
export function renderRequestList() {
    events.emit(EVENT_NAMES.UI_UPDATE_REQUEST_LIST); // Always use normal page-based view with optional attack surface per domain
}

// Set up event listeners for decoupled communication
events.on(EVENT_NAMES.UI_UPDATE_REQUEST_LIST, () => {
    filterRequests();
});

events.on(EVENT_NAMES.REQUEST_RENDERED, (data) => {
    if (data && data.request && typeof data.index === 'number') {
        renderRequestItem(data.request, data.index);
    }
});

export function filterRequests() {
    const requestList = getRequestList();
    if (!requestList) return;

    // First, check if any domains have been analyzed and render them with attack surface view
    state.domainsWithAttackSurface.forEach(domain => {
        const pageGroupId = `page-${domain.replace(/[^a-zA-Z0-9-]/g, '-')}`;
        const pageGroup = document.getElementById(pageGroupId);
        if (pageGroup) {
            const pageContent = pageGroup.querySelector('.page-content');
            if (pageContent) {
                // Only re-render if not already showing attack surface
                if (!pageContent.querySelector('.attack-surface-category')) {
                    renderDomainAttackSurface(pageContent, domain);
                }
            }
        }
    });

    const items = requestList.querySelectorAll('.request-item');
    let visibleCount = 0;
    let regexError = false;

    items.forEach((item, index) => {
        const request = state.requests[parseInt(item.dataset.index)];
        if (!request) return;

        const url = request.request.url;
        const urlLower = url.toLowerCase();
        const method = request.request.method.toUpperCase();

        // Extract hostname for domain-based search
        const hostname = getHostname(url);
        const hostnameLower = hostname.toLowerCase();

        // Build searchable text from headers
        let headersText = '';
        let headersTextLower = '';
        if (request.request.headers) {
            request.request.headers.forEach(header => {
                const headerLine = `${header.name}: ${header.value} `;
                headersText += headerLine;
                headersTextLower += headerLine.toLowerCase();
            });
        }

        // Get request body if available
        let bodyText = '';
        let bodyTextLower = '';
        if (request.request.postData && request.request.postData.text) {
            bodyText = request.request.postData.text;
            bodyTextLower = bodyText.toLowerCase();
        }

        // Prepare name for search (user-defined request label)
        const name = (request.name && typeof request.name === 'string') ? request.name : '';
        const nameLower = name.toLowerCase();

        // Check search term
        let matchesSearch = false;
        if (state.currentSearchTerm === '') {
            matchesSearch = true;
        } else if (state.useRegex) {
            try {
                const regex = new RegExp(state.currentSearchTerm);
                matchesSearch =
                    regex.test(url) ||
                    regex.test(method) ||
                    regex.test(hostname) ||
                    regex.test(headersText) ||
                    regex.test(bodyText) ||
                    regex.test(name);
            } catch (e) {
                if (!regexError) {
                    regexError = true;
                }
                matchesSearch = false;
            }
        } else {
            matchesSearch =
                urlLower.includes(state.currentSearchTerm) ||
                method.includes(state.currentSearchTerm.toUpperCase()) ||
                hostnameLower.includes(state.currentSearchTerm) ||
                headersTextLower.includes(state.currentSearchTerm) ||
                bodyTextLower.includes(state.currentSearchTerm) ||
                nameLower.includes(state.currentSearchTerm);
        }

        // Check filter
        let matchesFilter = true;
        
        // Check if method filter is active (multi-select)
        if (state.selectedMethods && state.selectedMethods.size > 0) {
            // First check if the method itself is selected
            const methodMatches = state.selectedMethods.has(method);
            
            // If XHR is selected, also check if request matches XHR criteria
            let xhrMatches = false;
            if (state.selectedMethods.has('XHR')) {
                // XHR filter: exclude images, fonts, and text files based on Content-Type and extension
                let contentType = '';
                if (request.response && request.response.headers) {
                    const ctHeader = request.response.headers.find(h =>
                        h.name.toLowerCase() === 'content-type'
                    );
                    if (ctHeader) {
                        contentType = ctHeader.value.toLowerCase();
                    }
                }

                // Exclude image, font, and text content types
                const excludeTypes = [
                    'image/', 'font/', 'text/html', 'text/plain', 'text/xml',
                    'application/font', 'application/x-font'
                ];

                const isExcludedByContentType = excludeTypes.some(type => contentType.includes(type));

                // Also check by extension
                const excludeExtensions = [
                    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp',
                    '.woff', '.woff2', '.ttf', '.eot', '.otf',
                    '.txt', '.xml', '.html', '.htm'
                ];
                const isExcludedByExtension = excludeExtensions.some(ext => {
                    return urlLower.endsWith(ext) || urlLower.includes(ext + '?');
                });

                xhrMatches = !isExcludedByContentType && !isExcludedByExtension;
            }
            
            // Match if method is selected OR (XHR is selected AND request matches XHR criteria)
            matchesFilter = methodMatches || xhrMatches;
        } else if (state.currentFilter !== 'all') {
            // Legacy single-select filter support (for backward compatibility)
            if (state.currentFilter === 'starred') {
                matchesFilter = request.starred;
            } else if (state.currentFilter === 'XHR') {
                // XHR filter: exclude images, fonts, and text files based on Content-Type and extension
                let contentType = '';
                if (request.response && request.response.headers) {
                    const ctHeader = request.response.headers.find(h =>
                        h.name.toLowerCase() === 'content-type'
                    );
                    if (ctHeader) {
                        contentType = ctHeader.value.toLowerCase();
                    }
                }

                // Exclude image, font, and text content types
                const excludeTypes = [
                    'image/', 'font/', 'text/html', 'text/plain', 'text/xml',
                    'application/font', 'application/x-font'
                ];

                const isExcludedByContentType = excludeTypes.some(type => contentType.includes(type));

                // Also check by extension
                const excludeExtensions = [
                    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp',
                    '.woff', '.woff2', '.ttf', '.eot', '.otf',
                    '.txt', '.xml', '.html', '.htm'
                ];
                const isExcludedByExtension = excludeExtensions.some(ext => {
                    return urlLower.endsWith(ext) || urlLower.includes(ext + '?');
                });

                matchesFilter = !isExcludedByContentType && !isExcludedByExtension;
            } else {
                matchesFilter = method === state.currentFilter;
            }
        }

        // Check star filter (independent, works with AND logic)
        let matchesStar = true;
        if (state.starFilterActive) {
            matchesStar = request.starred === true;
        }

        // Check color filter
        let matchesColor = true;
        if (state.currentColorFilter !== 'all') {
            matchesColor = request.color === state.currentColorFilter;
        }

        // Check timeline filter
        let matchesTimeline = true;
        if (state.timelineFilterTimestamp !== null) {
            matchesTimeline = request.capturedAt <= state.timelineFilterTimestamp;
        }

        // All filters work together with AND logic
        if (matchesSearch && matchesFilter && matchesStar && matchesColor && matchesTimeline) {
            item.style.display = 'flex';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    // Check if any filters are active (for auto-expand logic)
    const hasActiveFilters = (state.selectedMethods && state.selectedMethods.size > 0) || 
                             state.starFilterActive || 
                             state.currentColorFilter !== 'all' || 
                             state.currentSearchTerm ||
                             (state.currentFilter !== 'all' && state.currentFilter !== 'starred');

    // Update domain groups visibility (third-party domains)
    const domainGroups = requestList.querySelectorAll('.domain-group');
    domainGroups.forEach(group => {
        const hasVisibleItems = Array.from(group.querySelectorAll('.request-item')).some(item => item.style.display !== 'none');
        group.style.display = hasVisibleItems ? 'block' : 'none';

        // Auto-expand domain groups when filtering (unless manually collapsed)
        if (hasVisibleItems && !state.manuallyCollapsed && hasActiveFilters) {
            group.classList.add('expanded');
            const toggle = group.querySelector('.group-toggle');
            if (toggle) toggle.textContent = '▼';
        }
    });

    // Update path groups visibility (first-party root path)
    const pathGroups = requestList.querySelectorAll('.path-group');
    pathGroups.forEach(group => {
        const hasVisibleItems = Array.from(group.querySelectorAll('.request-item')).some(item => item.style.display !== 'none');
        group.style.display = hasVisibleItems ? 'block' : 'none';

        // Auto-expand path group when filtering (unless manually collapsed)
        if (hasVisibleItems && !state.manuallyCollapsed && hasActiveFilters) {
            group.classList.add('expanded');
            const toggle = group.querySelector('.group-toggle');
            if (toggle) toggle.textContent = '▼';
        }
    });

    // Update page groups visibility
    const pageGroups = requestList.querySelectorAll('.page-group');
    pageGroups.forEach(group => {
        const pageContent = group.querySelector('.page-content');
        const hasVisibleFirstParty = Array.from(pageContent.querySelectorAll('.path-group .request-item')).some(item => item.style.display !== 'none');
        const hasVisibleDomains = Array.from(pageContent.querySelectorAll('.domain-group')).some(domain => domain.style.display !== 'none');
        const hasVisibleAttackSurface = pageContent.querySelector('.attack-surface-category') !== null;

        group.style.display = (hasVisibleFirstParty || hasVisibleDomains || hasVisibleAttackSurface) ? 'block' : 'none';

        // Auto-expand page groups when filtering (unless manually collapsed)
        if ((hasVisibleFirstParty || hasVisibleDomains || hasVisibleAttackSurface) && !state.manuallyCollapsed && hasActiveFilters) {
            group.classList.add('expanded');
            const toggleBtn = group.querySelector('.page-toggle-btn');
            if (toggleBtn) toggleBtn.classList.add('expanded');
        }
    });

    // Show error state if regex is invalid
    if (regexError && state.useRegex && state.currentSearchTerm) {
        events.emit('ui:regex-error', { hasError: true, message: 'Invalid regex pattern' });
    } else {
        events.emit('ui:regex-error', { 
            hasError: false, 
            message: state.useRegex
                ? 'Regex mode enabled (click to disable)'
                : 'Toggle Regex Mode (enable to use regex patterns)'
        });
    }

    // Show empty state if no results
    const emptyState = requestList.querySelector('.empty-state');
    if (visibleCount === 0 && items.length > 0) {
        if (!emptyState) {
            const es = document.createElement('div');
            es.className = 'empty-state';
            requestList.appendChild(es);
        }
        const es = requestList.querySelector('.empty-state');

        let message = 'No requests match your filter.';
        const activeFilters = [];
        if (state.currentFilter !== 'all') activeFilters.push(`Method: ${state.currentFilter}`);
        if (state.currentColorFilter !== 'all') activeFilters.push(`Color: ${state.currentColorFilter}`);
        if (state.currentSearchTerm) activeFilters.push(`Search: "${state.currentSearchTerm}"`);
        if (state.timelineFilterTimestamp) activeFilters.push('Timeline Selection');

        if (activeFilters.length > 0) {
            message += `\n(${activeFilters.join(', ')})`;
        }
        es.textContent = message;
        es.style.display = 'flex';
    } else if (emptyState) {
        emptyState.style.display = 'none';
    }
}

