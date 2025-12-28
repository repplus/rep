// Security Headers Analyzer - UI Rendering

import { escapeHtml, copyToClipboard } from '../../core/utils/dom.js';
import { exportSecurityReport } from './export.js';
import { analyzeBulkRequests, generateBulkReport, exportBulkReport } from './bulk.js';
import { state } from '../../core/state.js';

/**
 * Get CSS class for grade color
 * @param {string} grade - Letter grade (A+ to F)
 * @returns {string} CSS class name
 */
function getGradeClass(grade) {
    if (grade === 'A+' || grade === 'A') return 'grade-a';
    if (grade === 'B') return 'grade-b';
    if (grade === 'C') return 'grade-c';
    if (grade === 'D') return 'grade-d';
    return 'grade-f';
}

/**
 * Get icon for finding status
 * @param {'secure' | 'warning' | 'missing'} status
 * @returns {string} Unicode icon
 */
function getStatusIcon(status) {
    switch (status) {
        case 'secure': return '✅';
        case 'warning': return '⚠️';
        case 'missing': return '❌';
        default: return '❓';
    }
}

/**
 * Render security analysis results in the Security tab
 * @param {AnalysisResult} result - Analysis result to render
 * @param {HTMLElement} container - Container element
 */
export function renderSecurityView(result, container) {
    if (!container) return;
    
    const gradeClass = getGradeClass(result.grade);
    
    // Build findings HTML
    let findingsHtml = '';
    
    // Present (secure) headers
    for (const finding of result.findings.present) {
        findingsHtml += `
            <div class="security-finding secure">
                <span class="finding-icon">${getStatusIcon('secure')}</span>
                <span class="finding-header">${escapeHtml(finding.header)}</span>
                <span class="finding-value">${escapeHtml(finding.value || '')}</span>
            </div>
        `;
    }
    
    // Warnings
    for (const finding of result.findings.warnings) {
        findingsHtml += `
            <div class="security-finding warning">
                <span class="finding-icon">${getStatusIcon('warning')}</span>
                <span class="finding-header">${escapeHtml(finding.header)}</span>
                <span class="finding-message">${escapeHtml(finding.message)}</span>
            </div>
        `;
    }
    
    // Missing headers
    for (const headerName of result.findings.missing) {
        findingsHtml += `
            <div class="security-finding missing">
                <span class="finding-icon">${getStatusIcon('missing')}</span>
                <span class="finding-header">${escapeHtml(headerName)}</span>
                <span class="finding-message">Missing</span>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="security-analysis">
            <div class="security-score ${gradeClass}">
                <div class="score-display">
                    <span class="score-grade">${escapeHtml(result.grade)}</span>
                    <span class="score-value">${result.score}/100</span>
                </div>
                <div class="score-bar">
                    <div class="score-fill" style="width: ${result.score}%"></div>
                </div>
            </div>
            
            <div class="security-findings">
                <h4>Security Headers</h4>
                ${findingsHtml}
            </div>
            
            <div class="security-actions">
                <button class="action-btn" id="security-analyze-all-btn">
                    Analyze All
                </button>
                <div class="export-dropdown">
                    <button class="action-btn export-btn" id="security-export-btn">
                        Export Report ▾
                    </button>
                    <div class="export-menu" id="security-export-menu">
                        <div class="export-option" data-format="json">JSON</div>
                        <div class="export-option" data-format="markdown">Markdown</div>
                        <div class="export-option" data-format="csv">CSV</div>
                    </div>
                </div>
                <button class="action-btn" id="security-copy-btn">
                    Copy Remediation
                </button>
            </div>
        </div>
    `;
    
    // Setup event listeners
    setupActionListeners(result, container);
}

/**
 * Setup action button event listeners
 * @param {AnalysisResult} result
 * @param {HTMLElement} container
 */
function setupActionListeners(result, container) {
    // Analyze All button
    const analyzeAllBtn = container.querySelector('#security-analyze-all-btn');
    if (analyzeAllBtn) {
        analyzeAllBtn.addEventListener('click', () => {
            startBulkAnalysis();
        });
    }
    
    // Export dropdown toggle
    const exportBtn = container.querySelector('#security-export-btn');
    const exportMenu = container.querySelector('#security-export-menu');
    
    if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.classList.toggle('visible');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', () => {
            exportMenu.classList.remove('visible');
        });
        
        // Export options
        exportMenu.querySelectorAll('.export-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = option.dataset.format;
                const content = exportSecurityReport(result, format);
                downloadExport(content, format, result.url);
                exportMenu.classList.remove('visible');
            });
        });
    }
    
    // Copy remediation button
    const copyBtn = container.querySelector('#security-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const remediationText = result.recommendations
                .map(r => r.fix)
                .join('\n');
            copyToClipboard(remediationText, copyBtn);
        });
    }
}

/**
 * Download export content as file
 * @param {string} content
 * @param {string} format
 * @param {string} url
 */
function downloadExport(content, format, url) {
    const extensions = { json: 'json', markdown: 'md', csv: 'csv' };
    const mimeTypes = { 
        json: 'application/json', 
        markdown: 'text/markdown', 
        csv: 'text/csv' 
    };
    
    const hostname = new URL(url).hostname || 'unknown';
    const filename = `security-report-${hostname}-${Date.now()}.${extensions[format]}`;
    
    const blob = new Blob([content], { type: mimeTypes[format] });
    const downloadUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
}

/**
 * Update the security tab with new analysis
 * @param {AnalysisResult} result
 */
export function updateSecurityTab(result) {
    const container = document.getElementById('res-view-security');
    if (container) {
        renderSecurityView(result, container);
    }
}

/**
 * Show empty state when no response available
 * @param {HTMLElement} container
 */
export function showEmptyState(container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="security-empty-state">
            <div class="empty-icon">🔒</div>
            <p>Select a request with a response to analyze security headers</p>
        </div>
    `;
}


// Bulk analysis state
let bulkAnalysisModal = null;
let currentBulkReport = null;

/**
 * Start bulk analysis of all captured requests
 */
async function startBulkAnalysis() {
    // Get requests with response headers
    const requestsWithHeaders = state.requests.filter(
        r => r.responseHeaders && r.responseHeaders.length > 0
    );
    
    if (requestsWithHeaders.length === 0) {
        alert('No requests with response headers to analyze.');
        return;
    }
    
    // Show modal
    showBulkAnalysisModal(requestsWithHeaders.length);
    
    // Run analysis
    const results = await analyzeBulkRequests(requestsWithHeaders, (progress) => {
        updateBulkProgress(progress.completed, progress.total);
    });
    
    // Generate report
    currentBulkReport = generateBulkReport(results);
    
    // Show results
    showBulkResults(currentBulkReport);
}

/**
 * Show the bulk analysis modal
 * @param {number} totalRequests
 */
function showBulkAnalysisModal(totalRequests) {
    // Remove existing modal if any
    if (bulkAnalysisModal) {
        bulkAnalysisModal.remove();
    }
    
    bulkAnalysisModal = document.createElement('div');
    bulkAnalysisModal.className = 'modal bulk-analysis-modal';
    bulkAnalysisModal.style.display = 'flex';
    bulkAnalysisModal.innerHTML = `
        <div class="modal-content bulk-modal-content">
            <div class="modal-header">
                <h3>Bulk Security Analysis</h3>
                <button class="modal-close-btn" id="bulk-modal-close">×</button>
            </div>
            <div class="modal-body bulk-modal-body">
                <div class="bulk-progress-section">
                    <p class="bulk-progress-text">Analyzing ${totalRequests} requests...</p>
                    <div class="bulk-progress-bar">
                        <div class="bulk-progress-fill" style="width: 0%"></div>
                    </div>
                    <p class="bulk-progress-count">0 / ${totalRequests}</p>
                </div>
                <div class="bulk-results-section" style="display: none;">
                    <!-- Results will be rendered here -->
                </div>
            </div>
            <div class="modal-footer bulk-modal-footer" style="display: none;">
                <div class="export-dropdown">
                    <button class="action-btn" id="bulk-export-btn">Export Bulk Report ▾</button>
                    <div class="export-menu" id="bulk-export-menu">
                        <div class="export-option" data-format="json">JSON</div>
                        <div class="export-option" data-format="markdown">Markdown</div>
                        <div class="export-option" data-format="csv">CSV</div>
                    </div>
                </div>
                <button class="action-btn" id="bulk-close-btn">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(bulkAnalysisModal);
    
    // Setup close button
    const closeBtn = bulkAnalysisModal.querySelector('#bulk-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBulkModal);
    }
}

/**
 * Update bulk analysis progress
 * @param {number} completed
 * @param {number} total
 */
function updateBulkProgress(completed, total) {
    if (!bulkAnalysisModal) return;
    
    const progressFill = bulkAnalysisModal.querySelector('.bulk-progress-fill');
    const progressCount = bulkAnalysisModal.querySelector('.bulk-progress-count');
    
    const percent = Math.round((completed / total) * 100);
    
    if (progressFill) {
        progressFill.style.width = `${percent}%`;
    }
    if (progressCount) {
        progressCount.textContent = `${completed} / ${total}`;
    }
}

/**
 * Show bulk analysis results
 * @param {BulkAnalysisReport} report
 */
function showBulkResults(report) {
    if (!bulkAnalysisModal) return;
    
    const progressSection = bulkAnalysisModal.querySelector('.bulk-progress-section');
    const resultsSection = bulkAnalysisModal.querySelector('.bulk-results-section');
    const footer = bulkAnalysisModal.querySelector('.bulk-modal-footer');
    
    if (progressSection) progressSection.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'block';
    if (footer) footer.style.display = 'flex';
    
    // Build grade distribution HTML
    let gradeDistHtml = '';
    const gradeOrder = ['A+', 'A', 'B', 'C', 'D', 'F'];
    for (const grade of gradeOrder) {
        const count = report.gradeDistribution[grade] || 0;
        if (count > 0) {
            gradeDistHtml += `<span class="grade-badge ${getGradeClass(grade)}">${grade}: ${count}</span>`;
        }
    }
    
    // Build common issues HTML
    let issuesHtml = '';
    for (const issue of report.commonIssues) {
        issuesHtml += `<li>${escapeHtml(issue)}</li>`;
    }
    
    // Build worst performers HTML
    let worstHtml = '';
    for (const result of report.worstPerformers) {
        worstHtml += `
            <div class="performer-item ${getGradeClass(result.grade)}">
                <span class="performer-grade">${result.grade} (${result.score})</span>
                <span class="performer-path">${escapeHtml(result.method)} ${escapeHtml(result.path)}</span>
            </div>
        `;
    }
    
    // Build best performers HTML
    let bestHtml = '';
    for (const result of report.bestPerformers) {
        bestHtml += `
            <div class="performer-item ${getGradeClass(result.grade)}">
                <span class="performer-grade">${result.grade} (${result.score})</span>
                <span class="performer-path">${escapeHtml(result.method)} ${escapeHtml(result.path)}</span>
            </div>
        `;
    }
    
    resultsSection.innerHTML = `
        <div class="bulk-summary">
            <div class="summary-stat">
                <span class="stat-value">${report.totalRequests}</span>
                <span class="stat-label">Requests Analyzed</span>
            </div>
            <div class="summary-stat">
                <span class="stat-value ${getGradeClass(scoreToGrade(report.averageScore))}">${report.averageScore}</span>
                <span class="stat-label">Average Score</span>
            </div>
        </div>
        
        <div class="bulk-section">
            <h4>Grade Distribution</h4>
            <div class="grade-distribution">${gradeDistHtml}</div>
        </div>
        
        ${report.commonIssues.length > 0 ? `
        <div class="bulk-section">
            <h4>Common Issues</h4>
            <ul class="common-issues-list">${issuesHtml}</ul>
        </div>
        ` : ''}
        
        ${report.worstPerformers.length > 0 ? `
        <div class="bulk-section">
            <h4>Worst Performers</h4>
            <div class="performers-list">${worstHtml}</div>
        </div>
        ` : ''}
        
        ${report.bestPerformers.length > 0 ? `
        <div class="bulk-section">
            <h4>Best Performers</h4>
            <div class="performers-list">${bestHtml}</div>
        </div>
        ` : ''}
    `;
    
    // Setup export buttons
    setupBulkExportListeners();
}

/**
 * Convert score to grade (duplicated for use in bulk UI)
 * @param {number} score
 * @returns {string}
 */
function scoreToGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

/**
 * Setup bulk export button listeners
 */
function setupBulkExportListeners() {
    if (!bulkAnalysisModal) return;
    
    const exportBtn = bulkAnalysisModal.querySelector('#bulk-export-btn');
    const exportMenu = bulkAnalysisModal.querySelector('#bulk-export-menu');
    const closeBtn = bulkAnalysisModal.querySelector('#bulk-close-btn');
    
    if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.classList.toggle('visible');
        });
        
        exportMenu.querySelectorAll('.export-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = option.dataset.format;
                if (currentBulkReport) {
                    const content = exportBulkReport(currentBulkReport, format);
                    downloadBulkExport(content, format);
                }
                exportMenu.classList.remove('visible');
            });
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBulkModal);
    }
    
    // Close menu when clicking outside
    document.addEventListener('click', () => {
        if (exportMenu) exportMenu.classList.remove('visible');
    });
}

/**
 * Download bulk export content as file
 * @param {string} content
 * @param {string} format
 */
function downloadBulkExport(content, format) {
    const extensions = { json: 'json', markdown: 'md', csv: 'csv' };
    const mimeTypes = { 
        json: 'application/json', 
        markdown: 'text/markdown', 
        csv: 'text/csv' 
    };
    
    const filename = `bulk-security-report-${Date.now()}.${extensions[format]}`;
    
    const blob = new Blob([content], { type: mimeTypes[format] });
    const downloadUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
}

/**
 * Close the bulk analysis modal
 */
function closeBulkModal() {
    if (bulkAnalysisModal) {
        bulkAnalysisModal.remove();
        bulkAnalysisModal = null;
    }
    currentBulkReport = null;
}

// Export for external use
export { startBulkAnalysis, showBulkAnalysisModal };
