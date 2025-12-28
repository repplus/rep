// Security Headers Analyzer - Bulk Analysis Module

import { analyzeSecurityHeaders } from './analyzer.js';

/**
 * @typedef {Object} BulkAnalysisReport
 * @property {number} totalRequests - Total number of requests analyzed
 * @property {number} averageScore - Average security score across all requests
 * @property {Object} gradeDistribution - Count of requests by grade
 * @property {Array<string>} commonIssues - Most frequent missing/misconfigured headers
 * @property {Array<Object>} worstPerformers - Requests with lowest scores
 * @property {Array<Object>} bestPerformers - Requests with highest scores
 * @property {string} timestamp - Report generation timestamp
 * @property {Array<Object>} results - All analysis results
 */

/**
 * Analyze security headers for multiple requests
 * @param {Array<Object>} requests - Array of request objects
 * @param {function} progressCallback - Progress update callback
 * @returns {Promise<Array<Object>>} Analysis results
 */
export async function analyzeBulkRequests(requests, progressCallback) {
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        
        for (const request of batch) {
            if (request.responseHeaders && request.responseHeaders.length > 0) {
                const result = analyzeSecurityHeaders({
                    headers: request.responseHeaders,
                    url: request.request?.url || 'unknown'
                });
                results.push({
                    ...result,
                    requestIndex: requests.indexOf(request),
                    method: request.request?.method || 'GET',
                    path: getPathFromUrl(request.request?.url)
                });
            }
        }
        
        // Report progress
        if (progressCallback) {
            progressCallback({
                completed: Math.min(i + batchSize, requests.length),
                total: requests.length
            });
        }
        
        // Yield to browser between batches
        if (i + batchSize < requests.length) {
            await new Promise(resolve => setTimeout(resolve, 16));
        }
    }
    
    return results;
}

/**
 * Generate bulk analysis report from results
 * @param {Array<Object>} results - Analysis results
 * @returns {BulkAnalysisReport}
 */
export function generateBulkReport(results) {
    if (!results || results.length === 0) {
        return {
            totalRequests: 0,
            averageScore: 0,
            gradeDistribution: {},
            commonIssues: [],
            worstPerformers: [],
            bestPerformers: [],
            timestamp: new Date().toISOString(),
            results: []
        };
    }
    
    // Calculate average score
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const averageScore = Math.round(totalScore / results.length);
    
    // Grade distribution
    const gradeDistribution = {};
    for (const result of results) {
        gradeDistribution[result.grade] = (gradeDistribution[result.grade] || 0) + 1;
    }
    
    // Common issues (missing headers)
    const issueCounts = {};
    for (const result of results) {
        for (const missing of result.findings.missing) {
            issueCounts[`Missing: ${missing}`] = (issueCounts[`Missing: ${missing}`] || 0) + 1;
        }
        for (const warning of result.findings.warnings) {
            issueCounts[`Weak: ${warning.header}`] = (issueCounts[`Weak: ${warning.header}`] || 0) + 1;
        }
    }
    
    // Sort issues by frequency
    const commonIssues = Object.entries(issueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([issue, count]) => `${issue} (${count})`);
    
    // Sort by score for best/worst performers
    const sorted = [...results].sort((a, b) => a.score - b.score);
    const worstPerformers = sorted.slice(0, 3);
    const bestPerformers = sorted.slice(-3).reverse();
    
    return {
        totalRequests: results.length,
        averageScore,
        gradeDistribution,
        commonIssues,
        worstPerformers,
        bestPerformers,
        timestamp: new Date().toISOString(),
        results
    };
}

/**
 * Export bulk report in specified format
 * @param {BulkAnalysisReport} report
 * @param {'json' | 'markdown' | 'csv'} format
 * @returns {string}
 */
export function exportBulkReport(report, format) {
    switch (format) {
        case 'json':
            return JSON.stringify(report, null, 2);
        case 'markdown':
            return bulkReportToMarkdown(report);
        case 'csv':
            return bulkReportToCSV(report);
        default:
            return JSON.stringify(report, null, 2);
    }
}

/**
 * Convert bulk report to Markdown
 * @param {BulkAnalysisReport} report
 * @returns {string}
 */
function bulkReportToMarkdown(report) {
    let md = `# Bulk Security Headers Analysis Report\n\n`;
    md += `**Generated:** ${report.timestamp}\n`;
    md += `**Total Requests Analyzed:** ${report.totalRequests}\n`;
    md += `**Average Score:** ${report.averageScore}/100\n\n`;
    
    md += `## Grade Distribution\n\n`;
    md += `| Grade | Count |\n|-------|-------|\n`;
    for (const [grade, count] of Object.entries(report.gradeDistribution)) {
        md += `| ${grade} | ${count} |\n`;
    }
    md += '\n';
    
    if (report.commonIssues.length > 0) {
        md += `## Common Issues\n\n`;
        for (const issue of report.commonIssues) {
            md += `- ${issue}\n`;
        }
        md += '\n';
    }
    
    if (report.worstPerformers.length > 0) {
        md += `## Worst Performers\n\n`;
        for (const result of report.worstPerformers) {
            md += `- **${result.grade} (${result.score})** - ${result.method} ${result.path}\n`;
        }
        md += '\n';
    }
    
    if (report.bestPerformers.length > 0) {
        md += `## Best Performers\n\n`;
        for (const result of report.bestPerformers) {
            md += `- **${result.grade} (${result.score})** - ${result.method} ${result.path}\n`;
        }
        md += '\n';
    }
    
    return md;
}

/**
 * Convert bulk report to CSV
 * @param {BulkAnalysisReport} report
 * @returns {string}
 */
function bulkReportToCSV(report) {
    const headers = ['url', 'method', 'path', 'score', 'grade', 'present_count', 'missing_count', 'warning_count'];
    let csv = headers.join(',') + '\n';
    
    for (const result of report.results) {
        const values = [
            `"${result.url}"`,
            result.method,
            `"${result.path}"`,
            result.score,
            result.grade,
            result.findings.present.length,
            result.findings.missing.length,
            result.findings.warnings.length
        ];
        csv += values.join(',') + '\n';
    }
    
    return csv;
}

/**
 * Extract path from URL
 * @param {string} url
 * @returns {string}
 */
function getPathFromUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname + urlObj.search;
    } catch {
        return url || '/';
    }
}
