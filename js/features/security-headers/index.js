// Security Headers Analyzer - Entry Point
// Evaluates HTTP response headers against security best practices

import { events, EVENT_NAMES } from '../../core/events.js';
import { state } from '../../core/state.js';
import { analyzeSecurityHeaders } from './analyzer.js';
import { renderSecurityView, showEmptyState, updateSecurityTab } from './ui.js';
import { exportSecurityReport, enhanceRequestExport } from './export.js';
import { createSecurityIndicator, addSecurityIndicatorToItem } from './indicators.js';
import { clearCache, getCacheStats } from './cache.js';

export { analyzeSecurityHeaders } from './analyzer.js';
export { exportSecurityReport, enhanceRequestExport } from './export.js';
export { createSecurityIndicator, addSecurityIndicatorToItem } from './indicators.js';
export { getHeaderHash, getCachedAnalysis, setCachedAnalysis, clearCache, getCacheSize, getCacheStats } from './cache.js';

let currentAnalysis = null;

export function setupSecurityHeaders(elements) {
    const securityContainer = document.getElementById('res-view-security');
    
    if (!securityContainer) {
        console.warn('Security Headers: Security tab container not found');
        return;
    }

    events.on('ui:request-selected', ({ request }) => {
        if (request && request.responseHeaders && request.responseHeaders.length > 0) {
            const result = analyzeSecurityHeaders({
                headers: request.responseHeaders,
                url: request.request?.url || 'unknown'
            });
            currentAnalysis = result;
            
            const securityTab = document.querySelector('.view-tab[data-view="security"][data-pane="response"]');
            if (securityTab && securityTab.classList.contains('active')) {
                renderSecurityView(result, securityContainer);
            }
        } else {
            currentAnalysis = null;
            const securityTab = document.querySelector('.view-tab[data-view="security"][data-pane="response"]');
            if (securityTab && securityTab.classList.contains('active')) {
                showEmptyState(securityContainer);
            }
        }
    });

    events.on(EVENT_NAMES.REQUEST_RENDERED, ({ request, index }) => {
        setTimeout(() => {
            addSecurityIndicatorToRequestItem(request, index);
        }, 0);
    });

    events.on(EVENT_NAMES.UI_VIEW_SWITCHED, ({ pane, view }) => {
        if (pane === 'response' && view === 'security') {
            if (currentAnalysis) {
                renderSecurityView(currentAnalysis, securityContainer);
            } else if (state.selectedRequest && state.selectedRequest.responseHeaders) {
                const result = analyzeSecurityHeaders({
                    headers: state.selectedRequest.responseHeaders,
                    url: state.selectedRequest.request?.url || 'unknown'
                });
                currentAnalysis = result;
                renderSecurityView(result, securityContainer);
            } else {
                showEmptyState(securityContainer);
            }
        }
    });

    events.on(EVENT_NAMES.UI_UPDATE_RESPONSE_VIEW, () => {
        const securityTab = document.querySelector('.view-tab[data-view="security"][data-pane="response"]');
        if (securityTab && securityTab.classList.contains('active') && state.selectedRequest) {
            if (state.selectedRequest.responseHeaders && state.selectedRequest.responseHeaders.length > 0) {
                const result = analyzeSecurityHeaders({
                    headers: state.selectedRequest.responseHeaders,
                    url: state.selectedRequest.request?.url || 'unknown'
                });
                currentAnalysis = result;
                renderSecurityView(result, securityContainer);
            } else {
                currentAnalysis = null;
                showEmptyState(securityContainer);
            }
        }
    });

    events.on(EVENT_NAMES.EXPORT_REQUEST_DATA, (data) => {
        const { requestData, originalRequest } = data;
        
        if (originalRequest && originalRequest.responseHeaders && originalRequest.responseHeaders.length > 0) {
            const analysis = analyzeSecurityHeaders({
                headers: originalRequest.responseHeaders,
                url: originalRequest.request?.url || requestData.url || 'unknown'
            });
            
            data.requestData = enhanceRequestExport(requestData, analysis);
        }
    });

    events.on(EVENT_NAMES.IMPORT_REQUEST_DATA, ({ importedData, newRequest }) => {
        if (importedData.securityAnalysis) {
            newRequest.securityAnalysis = importedData.securityAnalysis;
        }
    });

    showEmptyState(securityContainer);
}

function addSecurityIndicatorToRequestItem(request, index) {
    if (!request || !request.responseHeaders || request.responseHeaders.length === 0) {
        return;
    }
    
    const requestItem = document.querySelector(`.request-item[data-index="${index}"]`);
    if (!requestItem) {
        return;
    }
    
    addSecurityIndicatorToItem(requestItem, request);
}

export function getCurrentAnalysis() {
    return currentAnalysis;
}
