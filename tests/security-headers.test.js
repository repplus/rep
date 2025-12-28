// Security Headers Analyzer Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { 
    analyzeSecurityHeaders, 
    parseHeaders, 
    calculateScore, 
    scoreToGrade 
} from '../js/features/security-headers/analyzer.js';
import { HEADER_RULES, getRemediation } from '../js/features/security-headers/rules.js';
import { clearCache } from '../js/features/security-headers/cache.js';

describe('Security Headers Analyzer', () => {
    beforeEach(() => {
        clearCache();
    });

    describe('parseHeaders', () => {
        it('should parse headers array into normalized map', () => {
            const headers = [
                { name: 'Content-Type', value: 'text/html' },
                { name: 'X-Frame-Options', value: 'DENY' }
            ];
            const result = parseHeaders(headers);
            
            expect(result.get('content-type')).toBe('text/html');
            expect(result.get('x-frame-options')).toBe('DENY');
        });

        it('should handle case-insensitive header names', () => {
            const headers = [
                { name: 'CONTENT-SECURITY-POLICY', value: "default-src 'self'" }
            ];
            const result = parseHeaders(headers);
            
            expect(result.get('content-security-policy')).toBe("default-src 'self'");
        });

        it('should handle null/undefined headers', () => {
            expect(parseHeaders(null).size).toBe(0);
            expect(parseHeaders(undefined).size).toBe(0);
            expect(parseHeaders([]).size).toBe(0);
        });

        it('should concatenate multiple Set-Cookie headers', () => {
            const headers = [
                { name: 'Set-Cookie', value: 'session=abc; Secure' },
                { name: 'Set-Cookie', value: 'user=xyz; HttpOnly' }
            ];
            const result = parseHeaders(headers);
            
            expect(result.get('set-cookie')).toContain('session=abc');
            expect(result.get('set-cookie')).toContain('user=xyz');
        });
    });

    describe('scoreToGrade', () => {
        it('should return A+ for scores >= 95', () => {
            expect(scoreToGrade(95)).toBe('A+');
            expect(scoreToGrade(100)).toBe('A+');
        });

        it('should return A for scores 90-94', () => {
            expect(scoreToGrade(90)).toBe('A');
            expect(scoreToGrade(94)).toBe('A');
        });

        it('should return B for scores 80-89', () => {
            expect(scoreToGrade(80)).toBe('B');
            expect(scoreToGrade(89)).toBe('B');
        });

        it('should return C for scores 70-79', () => {
            expect(scoreToGrade(70)).toBe('C');
            expect(scoreToGrade(79)).toBe('C');
        });

        it('should return D for scores 60-69', () => {
            expect(scoreToGrade(60)).toBe('D');
            expect(scoreToGrade(69)).toBe('D');
        });

        it('should return F for scores below 60', () => {
            expect(scoreToGrade(59)).toBe('F');
            expect(scoreToGrade(0)).toBe('F');
        });
    });

    describe('analyzeSecurityHeaders', () => {
        it('should analyze headers and return complete result', () => {
            const headers = [
                { name: 'Content-Security-Policy', value: "default-src 'self'" },
                { name: 'Strict-Transport-Security', value: 'max-age=31536000' },
                { name: 'X-Frame-Options', value: 'DENY' },
                { name: 'X-Content-Type-Options', value: 'nosniff' }
            ];
            
            const result = analyzeSecurityHeaders({ 
                headers, 
                url: 'https://example.com' 
            });
            
            expect(result).toHaveProperty('url', 'https://example.com');
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('score');
            expect(result).toHaveProperty('grade');
            expect(result).toHaveProperty('findings');
            expect(result).toHaveProperty('recommendations');
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('should detect missing headers', () => {
            const result = analyzeSecurityHeaders({ 
                headers: [], 
                url: 'https://example.com' 
            });
            
            expect(result.findings.missing.length).toBeGreaterThan(0);
            expect(result.findings.missing).toContain('Content-Security-Policy');
            expect(result.findings.missing).toContain('Strict-Transport-Security');
        });

        it('should detect CSP with unsafe-inline', () => {
            const headers = [
                { name: 'Content-Security-Policy', value: "default-src 'self' 'unsafe-inline'" }
            ];
            
            const result = analyzeSecurityHeaders({ headers, url: 'https://example.com' });
            
            const cspWarning = result.findings.warnings.find(w => w.header === 'Content-Security-Policy');
            expect(cspWarning).toBeDefined();
            expect(cspWarning.message).toContain('unsafe-inline');
        });

        it('should detect CSP with unsafe-eval', () => {
            const headers = [
                { name: 'Content-Security-Policy', value: "script-src 'unsafe-eval'" }
            ];
            
            const result = analyzeSecurityHeaders({ headers, url: 'https://example.com' });
            
            const cspWarning = result.findings.warnings.find(w => w.header === 'Content-Security-Policy');
            expect(cspWarning).toBeDefined();
            expect(cspWarning.message).toContain('unsafe-eval');
        });

        it('should detect weak HSTS max-age', () => {
            const headers = [
                { name: 'Strict-Transport-Security', value: 'max-age=86400' } // 1 day
            ];
            
            const result = analyzeSecurityHeaders({ headers, url: 'https://example.com' });
            
            const hstsWarning = result.findings.warnings.find(w => w.header === 'Strict-Transport-Security');
            expect(hstsWarning).toBeDefined();
            expect(hstsWarning.message).toContain('less than');
        });

        it('should detect cookie security issues', () => {
            const headers = [
                { name: 'Set-Cookie', value: 'session=abc123' } // Missing Secure, HttpOnly, SameSite
            ];
            
            const result = analyzeSecurityHeaders({ headers, url: 'https://example.com' });
            
            const cookieWarning = result.findings.warnings.find(w => w.header === 'Set-Cookie');
            expect(cookieWarning).toBeDefined();
            expect(cookieWarning.message).toContain('Secure');
        });

        it('should mark secure cookies as present', () => {
            const headers = [
                { name: 'Set-Cookie', value: 'session=abc123; Secure; HttpOnly; SameSite=Strict' }
            ];
            
            const result = analyzeSecurityHeaders({ headers, url: 'https://example.com' });
            
            const cookieFinding = result.findings.present.find(f => f.header === 'Set-Cookie');
            expect(cookieFinding).toBeDefined();
        });

        it('should provide recommendations for missing/weak headers', () => {
            const result = analyzeSecurityHeaders({ 
                headers: [], 
                url: 'https://example.com' 
            });
            
            expect(result.recommendations.length).toBeGreaterThan(0);
            expect(result.recommendations[0]).toHaveProperty('header');
            expect(result.recommendations[0]).toHaveProperty('priority');
            expect(result.recommendations[0]).toHaveProperty('fix');
            expect(result.recommendations[0]).toHaveProperty('description');
        });

        it('should sort recommendations by priority', () => {
            const result = analyzeSecurityHeaders({ 
                headers: [], 
                url: 'https://example.com' 
            });
            
            const priorities = result.recommendations.map(r => r.priority);
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            
            for (let i = 1; i < priorities.length; i++) {
                expect(priorityOrder[priorities[i]]).toBeGreaterThanOrEqual(priorityOrder[priorities[i-1]]);
            }
        });
    });

    describe('calculateScore', () => {
        it('should return 100 for all secure headers', () => {
            const findings = {
                present: HEADER_RULES.map(r => ({ header: r.name, status: 'secure' })),
                missing: [],
                warnings: []
            };
            
            const { score } = calculateScore(findings);
            expect(score).toBe(100);
        });

        it('should deduct 20 points for missing CSP', () => {
            const findings = {
                present: [],
                missing: ['Content-Security-Policy'],
                warnings: []
            };
            
            const { score } = calculateScore(findings);
            expect(score).toBe(80);
        });

        it('should deduct 15 points for missing HSTS', () => {
            const findings = {
                present: [],
                missing: ['Strict-Transport-Security'],
                warnings: []
            };
            
            const { score } = calculateScore(findings);
            expect(score).toBe(85);
        });

        it('should deduct 10 points for missing X-Frame-Options', () => {
            const findings = {
                present: [],
                missing: ['X-Frame-Options'],
                warnings: []
            };
            
            const { score } = calculateScore(findings);
            expect(score).toBe(90);
        });

        it('should never return score below 0', () => {
            const findings = {
                present: [],
                missing: HEADER_RULES.map(r => r.name),
                warnings: []
            };
            
            const { score } = calculateScore(findings);
            expect(score).toBeGreaterThanOrEqual(0);
        });
    });

    describe('HEADER_RULES', () => {
        it('should have 11 security header rules', () => {
            expect(HEADER_RULES.length).toBe(11);
        });

        it('should include all required headers', () => {
            const headerNames = HEADER_RULES.map(r => r.name);
            
            expect(headerNames).toContain('Content-Security-Policy');
            expect(headerNames).toContain('Strict-Transport-Security');
            expect(headerNames).toContain('X-Frame-Options');
            expect(headerNames).toContain('X-Content-Type-Options');
            expect(headerNames).toContain('Referrer-Policy');
            expect(headerNames).toContain('Permissions-Policy');
            expect(headerNames).toContain('X-XSS-Protection');
            expect(headerNames).toContain('Set-Cookie');
            expect(headerNames).toContain('Cross-Origin-Opener-Policy');
            expect(headerNames).toContain('Cross-Origin-Embedder-Policy');
            expect(headerNames).toContain('Cross-Origin-Resource-Policy');
        });
    });

    describe('getRemediation', () => {
        it('should return remediation for known headers', () => {
            const remediation = getRemediation('Content-Security-Policy');
            
            expect(remediation.header).toBe('Content-Security-Policy');
            expect(remediation.priority).toBe('high');
            expect(remediation.fix).toContain('Content-Security-Policy:');
            expect(remediation.description).toBeTruthy();
        });

        it('should handle unknown headers', () => {
            const remediation = getRemediation('Unknown-Header');
            
            expect(remediation.header).toBe('Unknown-Header');
            expect(remediation.priority).toBe('low');
        });
    });
});


describe('Export Functionality', () => {
    const { exportSecurityReport, toJSON, toMarkdown, toCSV, enhanceRequestExport } = require('../js/features/security-headers/export.js');
    
    const sampleResult = {
        url: 'https://example.com',
        timestamp: '2025-12-28T00:00:00.000Z',
        score: 75,
        grade: 'C',
        findings: {
            present: [
                { header: 'X-Frame-Options', value: 'DENY', status: 'secure', message: 'OK' }
            ],
            missing: ['Content-Security-Policy'],
            warnings: [
                { header: 'Strict-Transport-Security', value: 'max-age=86400', status: 'warning', message: 'Weak max-age' }
            ]
        },
        recommendations: [
            { header: 'Content-Security-Policy', priority: 'high', fix: "Content-Security-Policy: default-src 'self'", description: 'Prevents XSS' }
        ]
    };

    describe('toJSON', () => {
        it('should export valid JSON with all required fields', () => {
            const json = toJSON(sampleResult);
            const parsed = JSON.parse(json);
            
            expect(parsed).toHaveProperty('url');
            expect(parsed).toHaveProperty('timestamp');
            expect(parsed).toHaveProperty('score');
            expect(parsed).toHaveProperty('grade');
            expect(parsed).toHaveProperty('findings');
            expect(parsed.findings).toHaveProperty('present');
            expect(parsed.findings).toHaveProperty('missing');
            expect(parsed.findings).toHaveProperty('warnings');
            expect(parsed).toHaveProperty('recommendations');
        });
    });

    describe('toMarkdown', () => {
        it('should export markdown with title and URL', () => {
            const md = toMarkdown(sampleResult);
            
            expect(md).toContain('# Security Headers Analysis Report');
            expect(md).toContain('https://example.com');
        });

        it('should include score and grade', () => {
            const md = toMarkdown(sampleResult);
            
            expect(md).toContain('75/100');
            expect(md).toContain('(C)');
        });

        it('should include findings summary', () => {
            const md = toMarkdown(sampleResult);
            
            expect(md).toContain('Secure Headers');
            expect(md).toContain('Warnings');
            expect(md).toContain('Missing Headers');
        });

        it('should include recommendations', () => {
            const md = toMarkdown(sampleResult);
            
            expect(md).toContain('Recommendations');
            expect(md).toContain('Content-Security-Policy');
        });
    });

    describe('toCSV', () => {
        it('should export CSV with header row', () => {
            const csv = toCSV(sampleResult);
            const lines = csv.split('\n');
            
            expect(lines[0]).toContain('url');
            expect(lines[0]).toContain('score');
            expect(lines[0]).toContain('grade');
            expect(lines[0]).toContain('present_count');
            expect(lines[0]).toContain('missing_count');
            expect(lines[0]).toContain('warning_count');
        });

        it('should export CSV with data row', () => {
            const csv = toCSV(sampleResult);
            const lines = csv.split('\n');
            
            expect(lines[1]).toContain('example.com');
            expect(lines[1]).toContain('75');
            expect(lines[1]).toContain('C');
        });
    });

    describe('exportSecurityReport', () => {
        it('should export JSON format', () => {
            const result = exportSecurityReport(sampleResult, 'json');
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should export Markdown format', () => {
            const result = exportSecurityReport(sampleResult, 'markdown');
            expect(result).toContain('#');
        });

        it('should export CSV format', () => {
            const result = exportSecurityReport(sampleResult, 'csv');
            expect(result).toContain(',');
        });

        it('should default to JSON for unknown format', () => {
            const result = exportSecurityReport(sampleResult, 'unknown');
            expect(() => JSON.parse(result)).not.toThrow();
        });
    });

    describe('enhanceRequestExport', () => {
        it('should add security analysis to request data', () => {
            const requestData = { id: '123', url: 'https://example.com' };
            const enhanced = enhanceRequestExport(requestData, sampleResult);
            
            expect(enhanced).toHaveProperty('id', '123');
            expect(enhanced).toHaveProperty('url', 'https://example.com');
            expect(enhanced).toHaveProperty('securityAnalysis');
            expect(enhanced.securityAnalysis).toHaveProperty('score', 75);
            expect(enhanced.securityAnalysis).toHaveProperty('grade', 'C');
        });
    });
});



describe('Bulk Analysis', () => {
    const { analyzeBulkRequests, generateBulkReport, exportBulkReport } = require('../js/features/security-headers/bulk.js');
    
    const mockRequests = [
        {
            request: { url: 'https://example.com/api/secure', method: 'GET' },
            responseHeaders: [
                { name: 'Content-Security-Policy', value: "default-src 'self'" },
                { name: 'Strict-Transport-Security', value: 'max-age=31536000' },
                { name: 'X-Frame-Options', value: 'DENY' },
                { name: 'X-Content-Type-Options', value: 'nosniff' }
            ]
        },
        {
            request: { url: 'https://example.com/api/insecure', method: 'POST' },
            responseHeaders: [
                { name: 'Content-Type', value: 'application/json' }
            ]
        },
        {
            request: { url: 'https://example.com/api/partial', method: 'GET' },
            responseHeaders: [
                { name: 'Strict-Transport-Security', value: 'max-age=86400' },
                { name: 'X-Frame-Options', value: 'SAMEORIGIN' }
            ]
        }
    ];

    describe('analyzeBulkRequests', () => {
        it('should analyze multiple requests', async () => {
            const results = await analyzeBulkRequests(mockRequests, () => {});
            
            expect(results.length).toBe(3);
            expect(results[0]).toHaveProperty('score');
            expect(results[0]).toHaveProperty('grade');
            expect(results[0]).toHaveProperty('method');
            expect(results[0]).toHaveProperty('path');
        });

        it('should call progress callback', async () => {
            const progressCalls = [];
            await analyzeBulkRequests(mockRequests, (progress) => {
                progressCalls.push(progress);
            });
            
            expect(progressCalls.length).toBeGreaterThan(0);
            expect(progressCalls[progressCalls.length - 1].completed).toBe(3);
            expect(progressCalls[progressCalls.length - 1].total).toBe(3);
        });

        it('should skip requests without response headers', async () => {
            const requestsWithEmpty = [
                ...mockRequests,
                { request: { url: 'https://example.com/no-response', method: 'GET' }, responseHeaders: [] }
            ];
            
            const results = await analyzeBulkRequests(requestsWithEmpty, () => {});
            expect(results.length).toBe(3); // Should skip the empty one
        });
    });

    describe('generateBulkReport', () => {
        it('should generate report with all required fields', async () => {
            const results = await analyzeBulkRequests(mockRequests, () => {});
            const report = generateBulkReport(results);
            
            expect(report).toHaveProperty('totalRequests', 3);
            expect(report).toHaveProperty('averageScore');
            expect(report).toHaveProperty('gradeDistribution');
            expect(report).toHaveProperty('commonIssues');
            expect(report).toHaveProperty('worstPerformers');
            expect(report).toHaveProperty('bestPerformers');
            expect(report).toHaveProperty('timestamp');
            expect(report).toHaveProperty('results');
        });

        it('should calculate average score correctly', async () => {
            const results = await analyzeBulkRequests(mockRequests, () => {});
            const report = generateBulkReport(results);
            
            const expectedAvg = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
            expect(report.averageScore).toBe(expectedAvg);
        });

        it('should identify common issues', async () => {
            const results = await analyzeBulkRequests(mockRequests, () => {});
            const report = generateBulkReport(results);
            
            expect(report.commonIssues.length).toBeGreaterThan(0);
            // Missing headers should be in common issues
            expect(report.commonIssues.some(issue => issue.includes('Missing'))).toBe(true);
        });

        it('should handle empty results', () => {
            const report = generateBulkReport([]);
            
            expect(report.totalRequests).toBe(0);
            expect(report.averageScore).toBe(0);
            expect(report.commonIssues).toEqual([]);
        });
    });

    describe('exportBulkReport', () => {
        it('should export as JSON', async () => {
            const results = await analyzeBulkRequests(mockRequests, () => {});
            const report = generateBulkReport(results);
            const json = exportBulkReport(report, 'json');
            
            expect(() => JSON.parse(json)).not.toThrow();
            const parsed = JSON.parse(json);
            expect(parsed.totalRequests).toBe(3);
        });

        it('should export as Markdown', async () => {
            const results = await analyzeBulkRequests(mockRequests, () => {});
            const report = generateBulkReport(results);
            const md = exportBulkReport(report, 'markdown');
            
            expect(md).toContain('# Bulk Security Headers Analysis Report');
            expect(md).toContain('Grade Distribution');
            expect(md).toContain('Common Issues');
        });

        it('should export as CSV', async () => {
            const results = await analyzeBulkRequests(mockRequests, () => {});
            const report = generateBulkReport(results);
            const csv = exportBulkReport(report, 'csv');
            
            const lines = csv.split('\n').filter(line => line.trim() !== '');
            expect(lines[0]).toContain('url');
            expect(lines[0]).toContain('score');
            expect(lines[0]).toContain('grade');
            expect(lines.length).toBe(4); // Header + 3 data rows
        });
    });
});


describe('Analysis Caching', () => {
    const { getHeaderHash, getCachedAnalysis, setCachedAnalysis, clearCache, getCacheSize, getCacheStats } = require('../js/features/security-headers/cache.js');
    const { analyzeSecurityHeaders } = require('../js/features/security-headers/analyzer.js');
    
    beforeEach(() => {
        clearCache();
    });

    describe('getHeaderHash', () => {
        it('should generate consistent hash for same headers', () => {
            const headers = [
                { name: 'Content-Type', value: 'text/html' },
                { name: 'X-Frame-Options', value: 'DENY' }
            ];
            
            const hash1 = getHeaderHash(headers);
            const hash2 = getHeaderHash(headers);
            
            expect(hash1).toBe(hash2);
        });

        it('should generate same hash regardless of header order', () => {
            const headers1 = [
                { name: 'Content-Type', value: 'text/html' },
                { name: 'X-Frame-Options', value: 'DENY' }
            ];
            const headers2 = [
                { name: 'X-Frame-Options', value: 'DENY' },
                { name: 'Content-Type', value: 'text/html' }
            ];
            
            expect(getHeaderHash(headers1)).toBe(getHeaderHash(headers2));
        });

        it('should generate different hash for different headers', () => {
            const headers1 = [{ name: 'Content-Type', value: 'text/html' }];
            const headers2 = [{ name: 'Content-Type', value: 'application/json' }];
            
            expect(getHeaderHash(headers1)).not.toBe(getHeaderHash(headers2));
        });

        it('should handle empty/null headers', () => {
            expect(getHeaderHash(null)).toBe('empty');
            expect(getHeaderHash(undefined)).toBe('empty');
            expect(getHeaderHash([])).toBe('empty');
        });

        it('should handle case-insensitive header names', () => {
            const headers1 = [{ name: 'Content-Type', value: 'text/html' }];
            const headers2 = [{ name: 'content-type', value: 'text/html' }];
            
            expect(getHeaderHash(headers1)).toBe(getHeaderHash(headers2));
        });
    });

    describe('Cache operations', () => {
        it('should cache and retrieve analysis results', () => {
            const headers = [{ name: 'X-Frame-Options', value: 'DENY' }];
            const result = { score: 90, grade: 'A', findings: {}, recommendations: [] };
            
            setCachedAnalysis(headers, result);
            const cached = getCachedAnalysis(headers);
            
            expect(cached).toEqual(result);
        });

        it('should return null for uncached headers', () => {
            const headers = [{ name: 'X-Frame-Options', value: 'DENY' }];
            
            expect(getCachedAnalysis(headers)).toBeNull();
        });

        it('should clear cache', () => {
            const headers = [{ name: 'X-Frame-Options', value: 'DENY' }];
            const result = { score: 90, grade: 'A', findings: {}, recommendations: [] };
            
            setCachedAnalysis(headers, result);
            expect(getCacheSize()).toBe(1);
            
            clearCache();
            expect(getCacheSize()).toBe(0);
            expect(getCachedAnalysis(headers)).toBeNull();
        });

        it('should report cache stats', () => {
            const stats = getCacheStats();
            
            expect(stats).toHaveProperty('size');
            expect(stats).toHaveProperty('maxSize');
            expect(stats.maxSize).toBe(100);
        });
    });

    describe('LRU eviction', () => {
        it('should evict oldest entries when cache exceeds max size', () => {
            for (let i = 0; i < 105; i++) {
                const headers = [{ name: `Header-${i}`, value: `value-${i}` }];
                setCachedAnalysis(headers, { score: i });
            }
            
            expect(getCacheSize()).toBe(100);
            
            const oldHeaders = [{ name: 'Header-0', value: 'value-0' }];
            expect(getCachedAnalysis(oldHeaders)).toBeNull();
            
            const newHeaders = [{ name: 'Header-104', value: 'value-104' }];
            expect(getCachedAnalysis(newHeaders)).toEqual({ score: 104 });
        });
    });

    describe('Analyzer caching integration', () => {
        it('should return cached results for identical headers', () => {
            const headers = [
                { name: 'Content-Security-Policy', value: "default-src 'self'" },
                { name: 'Strict-Transport-Security', value: 'max-age=31536000' }
            ];
            
            const result1 = analyzeSecurityHeaders({ headers, url: 'https://example.com' });
            const result2 = analyzeSecurityHeaders({ headers, url: 'https://different.com' });
            
            expect(result1.score).toBe(result2.score);
            expect(result1.grade).toBe(result2.grade);
            expect(result1.findings).toEqual(result2.findings);
            expect(result1.recommendations).toEqual(result2.recommendations);
            
            expect(result1.url).toBe('https://example.com');
            expect(result2.url).toBe('https://different.com');
        });

        it('should return different results for different headers', () => {
            const headers1 = [
                { name: 'Content-Security-Policy', value: "default-src 'self'" }
            ];
            const headers2 = [];
            
            const result1 = analyzeSecurityHeaders({ headers: headers1, url: 'https://example.com' });
            const result2 = analyzeSecurityHeaders({ headers: headers2, url: 'https://example.com' });
            
            expect(result1.score).not.toBe(result2.score);
        });
    });
});
