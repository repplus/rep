// Security Headers Analyzer - Request List Security Indicators

import { analyzeSecurityHeaders } from './analyzer.js';

/**
 * @typedef {Object} SecurityIndicator
 * @property {string} grade - Letter grade (A+ to F)
 * @property {number} score - Numeric score (0-100)
 * @property {string} colorClass - CSS color class
 * @property {string} tooltip - Hover text with summary
 */

/**
 * Get CSS class for grade color
 * @param {string} grade - Letter grade (A+ to F)
 * @returns {string} CSS class name
 */
function getGradeColorClass(grade) {
    if (grade === 'A+' || grade === 'A') return 'grade-a';
    if (grade === 'B') return 'grade-b';
    if (grade === 'C') return 'grade-c';
    if (grade === 'D') return 'grade-d';
    return 'grade-f';
}

/**
 * Generate tooltip text from analysis result
 * @param {Object} analysis - Security analysis result
 * @returns {string} Tooltip text
 */
function generateTooltip(analysis) {
    const { score, grade, findings } = analysis;
    const presentCount = findings.present.length;
    const missingCount = findings.missing.length;
    const warningCount = findings.warnings.length;
    
    return `Security: ${grade} (${score}/100)\n` +
           `✅ ${presentCount} secure | ⚠️ ${warningCount} warnings | ❌ ${missingCount} missing`;
}

/**
 * Generate security indicator for request list item
 * @param {Object} analysis - Security analysis result
 * @returns {HTMLElement} Security indicator element
 */
export function createSecurityIndicator(analysis) {
    if (!analysis || typeof analysis.grade !== 'string') {
        return null;
    }
    
    const { grade, score } = analysis;
    const colorClass = getGradeColorClass(grade);
    const tooltip = generateTooltip(analysis);
    
    const indicator = document.createElement('span');
    indicator.className = `security-indicator ${colorClass}`;
    indicator.textContent = grade;
    indicator.title = tooltip;
    
    // Store score as data attribute for potential sorting/filtering
    indicator.dataset.score = score;
    indicator.dataset.grade = grade;
    
    return indicator;
}

/**
 * Analyze request and create security indicator
 * @param {Object} request - Request object with responseHeaders
 * @returns {HTMLElement|null} Security indicator element or null if no response headers
 */
export function createSecurityIndicatorForRequest(request) {
    if (!request || !request.responseHeaders || request.responseHeaders.length === 0) {
        return null;
    }
    
    const analysis = analyzeSecurityHeaders({
        headers: request.responseHeaders,
        url: request.request?.url || 'unknown'
    });
    
    return createSecurityIndicator(analysis);
}

/**
 * Add security indicator to a request item element
 * @param {HTMLElement} requestItem - The request item DOM element
 * @param {Object} request - The request object
 * @returns {boolean} True if indicator was added, false otherwise
 */
export function addSecurityIndicatorToItem(requestItem, request) {
    if (!requestItem || !request) {
        return false;
    }
    
    // Remove existing indicator if present
    const existingIndicator = requestItem.querySelector('.security-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    const indicator = createSecurityIndicatorForRequest(request);
    if (!indicator) {
        return false;
    }
    
    // Insert indicator after the method span
    const methodSpan = requestItem.querySelector('.req-method');
    if (methodSpan && methodSpan.nextSibling) {
        requestItem.insertBefore(indicator, methodSpan.nextSibling);
    } else {
        // Fallback: append to the item
        requestItem.appendChild(indicator);
    }
    
    return true;
}

/**
 * Update security indicator for a request item
 * @param {HTMLElement} requestItem - The request item DOM element
 * @param {Object} analysis - Pre-computed analysis result
 * @returns {boolean} True if indicator was updated, false otherwise
 */
export function updateSecurityIndicator(requestItem, analysis) {
    if (!requestItem || !analysis) {
        return false;
    }
    
    // Remove existing indicator
    const existingIndicator = requestItem.querySelector('.security-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    const indicator = createSecurityIndicator(analysis);
    if (!indicator) {
        return false;
    }
    
    // Insert indicator after the method span
    const methodSpan = requestItem.querySelector('.req-method');
    if (methodSpan && methodSpan.nextSibling) {
        requestItem.insertBefore(indicator, methodSpan.nextSibling);
    } else {
        requestItem.appendChild(indicator);
    }
    
    return true;
}
