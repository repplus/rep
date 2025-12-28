import { HEADER_RULES, getRemediation } from './rules.js';
import { getCachedAnalysis, setCachedAnalysis } from './cache.js';

/**
 * @typedef {Object} Finding
 * @property {string} header - Header name
 * @property {string} value - Header value (if present)
 * @property {'secure' | 'warning' | 'missing'} status
 * @property {string} message - Human-readable description
 */

/**
 * @typedef {Object} Findings
 * @property {Finding[]} present - Headers present and properly configured
 * @property {string[]} missing - Names of missing headers
 * @property {Finding[]} warnings - Headers with configuration issues
 */

/**
 * @typedef {Object} Remediation
 * @property {string} header - Header name
 * @property {'high' | 'medium' | 'low'} priority
 * @property {string} fix - Recommended header value
 * @property {string} description - Why this fix is recommended
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} url - Analyzed URL
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {number} score - Security score (0-100)
 * @property {string} grade - Letter grade (A+ to F)
 * @property {Findings} findings - Categorized findings
 * @property {Remediation[]} recommendations - Ordered remediation list
 */

/**
 * Parse headers array into a normalized map
 * @param {Array<{name: string, value: string}>} headers
 * @returns {Map<string, string>} Lowercase header name to value
 */
export function parseHeaders(headers) {
    const headerMap = new Map();
    
    if (!headers || !Array.isArray(headers)) {
        return headerMap;
    }
    
    for (const header of headers) {
        if (header && header.name) {
            const normalizedName = header.name.toLowerCase();
            // For Set-Cookie, we may have multiple values - concatenate them
            if (normalizedName === 'set-cookie' && headerMap.has(normalizedName)) {
                headerMap.set(normalizedName, headerMap.get(normalizedName) + '; ' + (header.value || ''));
            } else {
                headerMap.set(normalizedName, header.value || '');
            }
        }
    }
    
    return headerMap;
}

/**
 * Calculate security score from findings
 * @param {Findings} findings - Categorized findings
 * @returns {{score: number, grade: string}}
 */
export function calculateScore(findings) {
    let score = 100;
    
    // Calculate deductions from missing headers and warnings
    // The deductions are tracked in the findings via the rules
    for (const headerName of findings.missing) {
        const rule = HEADER_RULES.find(r => r.name.toLowerCase() === headerName.toLowerCase());
        if (rule) {
            score -= rule.missingWeight;
        }
    }
    
    for (const warning of findings.warnings) {
        const rule = HEADER_RULES.find(r => r.name.toLowerCase() === warning.header.toLowerCase());
        if (rule && warning.deduction) {
            score -= warning.deduction;
        }
    }
    
    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));
    
    return {
        score,
        grade: scoreToGrade(score)
    };
}

/**
 * Convert score to letter grade
 * @param {number} score - Score from 0-100
 * @returns {string} Letter grade (A+ to F)
 */
export function scoreToGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

/**
 * Analyze security headers from a response
 * @param {Object} options - Analysis options
 * @param {Array<{name: string, value: string}>} options.headers - Response headers
 * @param {string} options.url - Request URL
 * @returns {AnalysisResult} Complete analysis result
 */
export function analyzeSecurityHeaders({ headers, url }) {
    const cached = getCachedAnalysis(headers);
    if (cached) {
        return {
            ...cached,
            url: url || 'unknown',
            timestamp: new Date().toISOString()
        };
    }
    
    const headerMap = parseHeaders(headers);
    
    const findings = {
        present: [],
        missing: [],
        warnings: []
    };
    
    const recommendations = [];
    
    for (const rule of HEADER_RULES) {
        const headerValue = headerMap.get(rule.name.toLowerCase());
        const evaluation = rule.evaluate(headerValue);
        
        if (evaluation.status === 'secure') {
            findings.present.push({
                header: rule.name,
                value: headerValue,
                status: 'secure',
                message: evaluation.message
            });
        } else if (evaluation.status === 'missing') {
            findings.missing.push(rule.name);
            recommendations.push(getRemediation(rule.name));
        } else if (evaluation.status === 'warning') {
            findings.warnings.push({
                header: rule.name,
                value: headerValue,
                status: 'warning',
                message: evaluation.message,
                deduction: evaluation.deduction
            });
            recommendations.push(getRemediation(rule.name));
        }
    }
    
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    const { score, grade } = calculateScore(findings);
    
    const result = {
        url: url || 'unknown',
        timestamp: new Date().toISOString(),
        score,
        grade,
        findings,
        recommendations
    };
    
    setCachedAnalysis(headers, {
        score,
        grade,
        findings,
        recommendations
    });
    
    return result;
}
