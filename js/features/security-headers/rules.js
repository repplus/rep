// Security Headers Analyzer - Header Rules Definitions

/**
 * @typedef {Object} EvaluationResult
 * @property {'secure' | 'warning' | 'missing'} status
 * @property {string} message
 * @property {number} deduction - Points to deduct from score
 */

/**
 * @typedef {Object} HeaderRule
 * @property {string} name - Header name (case-insensitive matching)
 * @property {string} description - What this header protects against
 * @property {number} missingWeight - Points deducted if missing
 * @property {number} weakWeight - Points deducted if misconfigured
 * @property {'high' | 'medium' | 'low'} priority
 * @property {function(string|null): EvaluationResult} evaluate
 * @property {string} recommendedValue - Best practice value
 */

/**
 * Security header rule definitions
 * @type {HeaderRule[]}
 */
export const HEADER_RULES = [
    {
        name: 'Content-Security-Policy',
        description: 'Prevents XSS attacks by controlling resource loading',
        missingWeight: 20,
        weakWeight: 15,
        priority: 'high',
        recommendedValue: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'self'",
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'Content-Security-Policy header is missing', deduction: 0 };
            }
            
            const lowerValue = value.toLowerCase();
            const hasUnsafeInline = lowerValue.includes("'unsafe-inline'");
            const hasUnsafeEval = lowerValue.includes("'unsafe-eval'");
            
            if (hasUnsafeInline && hasUnsafeEval) {
                return { 
                    status: 'warning', 
                    message: "CSP contains both 'unsafe-inline' and 'unsafe-eval' directives", 
                    deduction: 15 
                };
            }
            if (hasUnsafeInline) {
                return { 
                    status: 'warning', 
                    message: "CSP contains 'unsafe-inline' directive", 
                    deduction: 15 
                };
            }
            if (hasUnsafeEval) {
                return { 
                    status: 'warning', 
                    message: "CSP contains 'unsafe-eval' directive", 
                    deduction: 15 
                };
            }
            
            return { status: 'secure', message: 'Content-Security-Policy is properly configured', deduction: 0 };
        }
    },
    {
        name: 'Strict-Transport-Security',
        description: 'Enforces HTTPS connections',
        missingWeight: 15,
        weakWeight: 10,
        priority: 'high',
        recommendedValue: 'max-age=31536000; includeSubDomains; preload',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'Strict-Transport-Security header is missing', deduction: 0 };
            }
            
            // Extract max-age value
            const maxAgeMatch = value.match(/max-age=(\d+)/i);
            if (!maxAgeMatch) {
                return { 
                    status: 'warning', 
                    message: 'HSTS header missing max-age directive', 
                    deduction: 10 
                };
            }
            
            const maxAge = parseInt(maxAgeMatch[1], 10);
            const oneYear = 31536000;
            
            if (maxAge < oneYear) {
                return { 
                    status: 'warning', 
                    message: `HSTS max-age (${maxAge}s) is less than recommended 1 year (${oneYear}s)`, 
                    deduction: 10 
                };
            }
            
            return { status: 'secure', message: 'Strict-Transport-Security is properly configured', deduction: 0 };
        }
    },
    {
        name: 'X-Frame-Options',
        description: 'Prevents clickjacking attacks',
        missingWeight: 10,
        weakWeight: 5,
        priority: 'medium',
        recommendedValue: 'DENY',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'X-Frame-Options header is missing', deduction: 0 };
            }
            
            const upperValue = value.toUpperCase().trim();
            if (upperValue === 'DENY' || upperValue === 'SAMEORIGIN') {
                return { status: 'secure', message: `X-Frame-Options is set to ${upperValue}`, deduction: 0 };
            }
            
            if (upperValue.startsWith('ALLOW-FROM')) {
                return { 
                    status: 'warning', 
                    message: 'X-Frame-Options ALLOW-FROM is deprecated and not supported by all browsers', 
                    deduction: 5 
                };
            }
            
            return { 
                status: 'warning', 
                message: `X-Frame-Options has unexpected value: ${value}`, 
                deduction: 5 
            };
        }
    },
    {
        name: 'X-Content-Type-Options',
        description: 'Prevents MIME type sniffing',
        missingWeight: 5,
        weakWeight: 5,
        priority: 'medium',
        recommendedValue: 'nosniff',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'X-Content-Type-Options header is missing', deduction: 0 };
            }
            
            if (value.toLowerCase().trim() === 'nosniff') {
                return { status: 'secure', message: 'X-Content-Type-Options is set to nosniff', deduction: 0 };
            }
            
            return { 
                status: 'warning', 
                message: `X-Content-Type-Options has unexpected value: ${value}`, 
                deduction: 5 
            };
        }
    },
    {
        name: 'Referrer-Policy',
        description: 'Controls referrer information sent with requests',
        missingWeight: 5,
        weakWeight: 5,
        priority: 'medium',
        recommendedValue: 'strict-origin-when-cross-origin',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'Referrer-Policy header is missing', deduction: 0 };
            }
            
            const secureValues = [
                'no-referrer',
                'no-referrer-when-downgrade',
                'origin',
                'origin-when-cross-origin',
                'same-origin',
                'strict-origin',
                'strict-origin-when-cross-origin'
            ];
            
            const lowerValue = value.toLowerCase().trim();
            if (secureValues.includes(lowerValue)) {
                return { status: 'secure', message: `Referrer-Policy is set to ${value}`, deduction: 0 };
            }
            
            if (lowerValue === 'unsafe-url') {
                return { 
                    status: 'warning', 
                    message: 'Referrer-Policy is set to unsafe-url which may leak sensitive information', 
                    deduction: 5 
                };
            }
            
            return { 
                status: 'warning', 
                message: `Referrer-Policy has unexpected value: ${value}`, 
                deduction: 5 
            };
        }
    },
    {
        name: 'Permissions-Policy',
        description: 'Controls browser features and APIs',
        missingWeight: 5,
        weakWeight: 5,
        priority: 'low',
        recommendedValue: 'geolocation=(), microphone=(), camera=()',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'Permissions-Policy header is missing', deduction: 0 };
            }
            
            return { status: 'secure', message: 'Permissions-Policy is configured', deduction: 0 };
        }
    },
    {
        name: 'X-XSS-Protection',
        description: 'Legacy XSS filter (deprecated but still useful for older browsers)',
        missingWeight: 5,
        weakWeight: 5,
        priority: 'low',
        recommendedValue: '1; mode=block',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'X-XSS-Protection header is missing', deduction: 0 };
            }
            
            // Modern recommendation is to disable it (0) or use mode=block
            if (value === '0') {
                return { status: 'secure', message: 'X-XSS-Protection is disabled (recommended for modern browsers with CSP)', deduction: 0 };
            }
            
            if (value.includes('mode=block')) {
                return { status: 'secure', message: 'X-XSS-Protection is enabled with mode=block', deduction: 0 };
            }
            
            if (value === '1') {
                return { 
                    status: 'warning', 
                    message: 'X-XSS-Protection is enabled without mode=block, which may introduce vulnerabilities', 
                    deduction: 5 
                };
            }
            
            return { status: 'secure', message: `X-XSS-Protection is set to ${value}`, deduction: 0 };
        }
    },
    {
        name: 'Set-Cookie',
        description: 'Cookie security attributes',
        missingWeight: 0, // Not missing if no cookies
        weakWeight: 5,
        priority: 'medium',
        recommendedValue: 'Secure; HttpOnly; SameSite=Strict',
        evaluate(value) {
            if (!value) {
                // No cookies is not a security issue
                return { status: 'secure', message: 'No cookies set', deduction: 0 };
            }
            
            const lowerValue = value.toLowerCase();
            const issues = [];
            
            if (!lowerValue.includes('secure')) {
                issues.push('missing Secure flag');
            }
            if (!lowerValue.includes('httponly')) {
                issues.push('missing HttpOnly flag');
            }
            if (!lowerValue.includes('samesite')) {
                issues.push('missing SameSite attribute');
            }
            
            if (issues.length > 0) {
                return { 
                    status: 'warning', 
                    message: `Cookie security issues: ${issues.join(', ')}`, 
                    deduction: 5 
                };
            }
            
            return { status: 'secure', message: 'Cookies have proper security attributes', deduction: 0 };
        }
    },
    {
        name: 'Cross-Origin-Opener-Policy',
        description: 'Isolates browsing context from cross-origin documents',
        missingWeight: 5,
        weakWeight: 5,
        priority: 'low',
        recommendedValue: 'same-origin',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'Cross-Origin-Opener-Policy header is missing', deduction: 0 };
            }
            
            const validValues = ['same-origin', 'same-origin-allow-popups', 'unsafe-none'];
            if (validValues.includes(value.toLowerCase().trim())) {
                return { status: 'secure', message: `Cross-Origin-Opener-Policy is set to ${value}`, deduction: 0 };
            }
            
            return { 
                status: 'warning', 
                message: `Cross-Origin-Opener-Policy has unexpected value: ${value}`, 
                deduction: 5 
            };
        }
    },
    {
        name: 'Cross-Origin-Embedder-Policy',
        description: 'Controls embedding of cross-origin resources',
        missingWeight: 5,
        weakWeight: 5,
        priority: 'low',
        recommendedValue: 'require-corp',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'Cross-Origin-Embedder-Policy header is missing', deduction: 0 };
            }
            
            const validValues = ['require-corp', 'credentialless', 'unsafe-none'];
            if (validValues.includes(value.toLowerCase().trim())) {
                return { status: 'secure', message: `Cross-Origin-Embedder-Policy is set to ${value}`, deduction: 0 };
            }
            
            return { 
                status: 'warning', 
                message: `Cross-Origin-Embedder-Policy has unexpected value: ${value}`, 
                deduction: 5 
            };
        }
    },
    {
        name: 'Cross-Origin-Resource-Policy',
        description: 'Controls which origins can load the resource',
        missingWeight: 5,
        weakWeight: 5,
        priority: 'low',
        recommendedValue: 'same-origin',
        evaluate(value) {
            if (!value) {
                return { status: 'missing', message: 'Cross-Origin-Resource-Policy header is missing', deduction: 0 };
            }
            
            const validValues = ['same-origin', 'same-site', 'cross-origin'];
            if (validValues.includes(value.toLowerCase().trim())) {
                return { status: 'secure', message: `Cross-Origin-Resource-Policy is set to ${value}`, deduction: 0 };
            }
            
            return { 
                status: 'warning', 
                message: `Cross-Origin-Resource-Policy has unexpected value: ${value}`, 
                deduction: 5 
            };
        }
    }
];

/**
 * Get remediation for a specific header
 * @param {string} headerName
 * @returns {Remediation}
 */
export function getRemediation(headerName) {
    const rule = HEADER_RULES.find(r => r.name.toLowerCase() === headerName.toLowerCase());
    
    if (!rule) {
        return {
            header: headerName,
            priority: 'low',
            fix: '',
            description: 'Unknown header'
        };
    }
    
    return {
        header: rule.name,
        priority: rule.priority,
        fix: `${rule.name}: ${rule.recommendedValue}`,
        description: rule.description
    };
}
