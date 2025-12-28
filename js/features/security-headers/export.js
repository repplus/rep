// Security Headers Analyzer - Export Functionality

/**
 * Export analysis result in specified format
 * @param {AnalysisResult} result
 * @param {'json' | 'markdown' | 'csv'} format
 * @returns {string} Formatted export content
 */
export function exportSecurityReport(result, format) {
    switch (format) {
        case 'json':
            return toJSON(result);
        case 'markdown':
            return toMarkdown(result);
        case 'csv':
            return toCSV(result);
        default:
            return toJSON(result);
    }
}

/**
 * Generate JSON export
 * @param {AnalysisResult} result
 * @returns {string}
 */
export function toJSON(result) {
    return JSON.stringify(result, null, 2);
}

/**
 * Generate Markdown export
 * @param {AnalysisResult} result
 * @returns {string}
 */
export function toMarkdown(result) {
    let md = `# Security Headers Analysis Report\n\n`;
    md += `**URL:** ${result.url}\n`;
    md += `**Timestamp:** ${result.timestamp}\n`;
    md += `**Score:** ${result.score}/100 (${result.grade})\n\n`;
    
    md += `## Summary\n\n`;
    md += `- ✅ Secure Headers: ${result.findings.present.length}\n`;
    md += `- ⚠️ Warnings: ${result.findings.warnings.length}\n`;
    md += `- ❌ Missing Headers: ${result.findings.missing.length}\n\n`;
    
    if (result.findings.present.length > 0) {
        md += `## Secure Headers\n\n`;
        for (const finding of result.findings.present) {
            md += `- ✅ **${finding.header}**: ${finding.value || 'Present'}\n`;
        }
        md += '\n';
    }
    
    if (result.findings.warnings.length > 0) {
        md += `## Warnings\n\n`;
        for (const finding of result.findings.warnings) {
            md += `- ⚠️ **${finding.header}**: ${finding.message}\n`;
        }
        md += '\n';
    }
    
    if (result.findings.missing.length > 0) {
        md += `## Missing Headers\n\n`;
        for (const headerName of result.findings.missing) {
            md += `- ❌ **${headerName}**\n`;
        }
        md += '\n';
    }
    
    if (result.recommendations.length > 0) {
        md += `## Recommendations\n\n`;
        for (const rec of result.recommendations) {
            const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
            md += `### ${priorityIcon} ${rec.header} (${rec.priority} priority)\n\n`;
            md += `${rec.description}\n\n`;
            md += `**Recommended:**\n\`\`\`\n${rec.fix}\n\`\`\`\n\n`;
        }
    }
    
    return md;
}

/**
 * Generate CSV export
 * @param {AnalysisResult} result
 * @returns {string}
 */
export function toCSV(result) {
    const headers = ['url', 'score', 'grade', 'present_count', 'missing_count', 'warning_count'];
    const values = [
        `"${result.url}"`,
        result.score,
        result.grade,
        result.findings.present.length,
        result.findings.missing.length,
        result.findings.warnings.length
    ];
    
    return headers.join(',') + '\n' + values.join(',');
}

/**
 * Enhance request export data with security analysis
 * @param {Object} requestData - Original request export data
 * @param {AnalysisResult} securityAnalysis - Security analysis result
 * @returns {Object} Enhanced request data
 */
export function enhanceRequestExport(requestData, securityAnalysis) {
    return {
        ...requestData,
        securityAnalysis: {
            score: securityAnalysis.score,
            grade: securityAnalysis.grade,
            findings: securityAnalysis.findings,
            recommendations: securityAnalysis.recommendations
        }
    };
}
