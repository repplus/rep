// Parameter Extraction Module
// Extracts parameters from JavaScript files for security testing

// High-risk parameter patterns (from design doc)
const HIGH_RISK_PATTERNS = {
    auth: /^(password|pwd|pass|passwd|token|api[_-]?key|secret|auth|accessToken|access_token|session|sessionId|session_id|secretKey|secret_key)$/i,
    access: /^(role|roles|userRole|user_role|permission|permissions|access|accessLevel|admin|isAdmin|is_admin|adminRole|privilege|privileges)$/i,
    flags: /^(debug|debugMode|debug_mode|isDebug|test|testMode|testing|bypass|bypassAuth|skipValidation)$/i,
    idor: /^(id|userId|user_id|userID|uid|ownerId|owner_id|creator|creatorId|recordId|record_id)$/i,
    features: /^(feature|features|featureFlag|feature_flag|enabled|disabled|active|inactive|status|state)$/i
};

// Suppression patterns (false positives)
const SUPPRESSION_PATTERNS = {
    buildTools: /(webpack|chunk|bundle|module|__webpack|__dirname|__filename)/i,
    frameworks: /^(react|vue|angular|component|props|state|redux|store|dispatch|action)$/i,
    libraries: /^(jquery|\$|lodash|_|axios|fetch|xhr|request)$/i,
    domEvents: /^(event|target|currentTarget|preventDefault|key|keyCode|which|button|click)$/i,
    generic: /^(data|obj|item|value|result|response|config|options|settings|params)$/i,
    singleChar: /^[a-z]$/i,
    filePaths: /(node_modules|dist|build|static|\.js|\.css|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.ico|\.woff|\.ttf|\.eot)/i,
    commonParams: /^(page|limit|offset|sort|order|filter|search|q|query)$/i,  // Pagination/sorting (low value)
    // Telemetry / Instrumentation
    telemetry: /^(visitId|analytics|trace|metric|hcaptchaToken|x-sentry-.*)$/i,
    // Standard Headers
    standardHeaders: /^(content-type|accept|user-agent|accept-language|accept-encoding|connection|cache-control|host|origin|referer|referrer)$/i,
    // Generic / Wrapper Fields
    genericWrapper: /^(index|data|value|prefill|members)$/i
};

// Type hints that boost confidence
const TYPE_HINTS = {
    userId: /^(userId|user_id|userID|uid)$/i,
    email: /^(email|emailAddress|email_address)$/i,
    token: /^(token|apiKey|api_key|apikey|accessToken|access_token)$/i,
    password: /^(password|pwd|pass|passwd)$/i,
    id: /^(id|.*Id|.*_id|.*ID)$/i
};

/**
 * Check if parameter is high-risk
 */
function isHighRiskParameter(paramName) {
    for (const pattern of Object.values(HIGH_RISK_PATTERNS)) {
        if (pattern.test(paramName)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if parameter should be suppressed (false positive)
 */
function shouldSuppress(paramName, context, location = 'body') {
    // Check suppression patterns
    for (const [category, pattern] of Object.entries(SUPPRESSION_PATTERNS)) {
        if (pattern.test(paramName)) {
            // Allow generic names if in explicit API context
            if (category === 'generic' && context.isExplicitAPICall) {
                return false; // Don't suppress generic names in API calls
            }
            // Suppress standard headers only in header location
            if (category === 'standardHeaders' && location !== 'header') {
                continue; // Only suppress headers when location is header
            }
            // Suppress common params unless high-risk
            if (category === 'commonParams' && !isHighRiskParameter(paramName)) {
                return true;
            }
            // Suppress others
            if (category !== 'generic') {
                return true;
            }
        }
    }
    
    // Suppress if not in API context
    if (!context.isAPIContext) {
        return true;
    }
    
    // Suppress single character (unless high-risk)
    if (paramName.length === 1 && !isHighRiskParameter(paramName)) {
        return true;
    }
    
    return false;
}

/**
 * Check if parameter references DOM/Event/Complex objects (should suppress)
 */
function referencesComplexObjects(paramName, context) {
    // Check if context suggests DOM/Event/Window references
    if (!context) return false;
    
    const contextStr = (context.context || '').toLowerCase();
    
    // DOM nodes
    if (contextStr.includes('document.') || contextStr.includes('window.') || 
        contextStr.includes('document.getElementById') || contextStr.includes('querySelector')) {
        return true;
    }
    
    // Event objects
    if (contextStr.includes('addEventListener') || contextStr.includes('onclick') ||
        contextStr.includes('event.') || contextStr.includes('e.') ||
        contextStr.match(/\bevent\b/) || contextStr.match(/\be\b/)) {
        return true;
    }
    
    // Functions or symbols
    if (contextStr.includes('function(') || contextStr.includes('=>') ||
        contextStr.includes('Symbol(') || contextStr.includes('typeof')) {
        return true;
    }
    
    return false;
}

/**
 * Check if parameter name has type hints
 */
function hasTypeHint(paramName) {
    for (const pattern of Object.values(TYPE_HINTS)) {
        if (pattern.test(paramName)) {
            return true;
        }
    }
    return false;
}

/**
 * Extract risk level for parameter
 */
function getRiskLevel(paramName) {
    if (HIGH_RISK_PATTERNS.auth.test(paramName) || 
        HIGH_RISK_PATTERNS.access.test(paramName) || 
        HIGH_RISK_PATTERNS.flags.test(paramName)) {
        return 'high';
    }
    if (HIGH_RISK_PATTERNS.idor.test(paramName) || 
        HIGH_RISK_PATTERNS.features.test(paramName)) {
        return 'medium';
    }
    return 'low';
}

/**
 * Calculate confidence for a parameter
 */
function calculateConfidence(param, context, hasEndpoint) {
    let confidence = 50; // Base confidence
    
    // High-risk parameters: boost only if tied to endpoint
    if (isHighRiskParameter(param.name)) {
        if (hasEndpoint) {
            confidence += 25; // Full boost for high-risk with endpoint
        } else {
            // Cap at 40% if no endpoint
            return Math.min(40, confidence);
        }
    }
    
    // Method boost (body parameters are more reliable)
    if (context.method === 'POST' || context.method === 'PUT' || 
        context.method === 'PATCH' || context.method === 'DELETE') {
        confidence += 20;
    }
    
    // Context clarity
    if (context.hasExplicitAPICall) {
        confidence += 15;
    }
    
    // Type hints
    if (hasTypeHint(param.name)) {
        confidence += 10;
    }
    
    // Location boost
    if (param.location === 'body') {
        confidence += 10;
    } else if (param.location === 'query') {
        confidence += 5;
    } else if (param.location === 'header') {
        confidence += 15; // Custom headers are usually intentional
    }
    
    // Length penalties
    if (param.name.length < 3) {
        confidence -= 20;
    }
    if (param.name.length > 30) {
        confidence -= 10; // Suspiciously long
    }
    
    // Cap at 40% if no endpoint (unless already high-risk which was handled above)
    if (!hasEndpoint && !isHighRiskParameter(param.name)) {
        confidence = Math.min(40, confidence);
    }
    
    return Math.min(100, Math.max(0, confidence));
}

/**
 * Determine if parameter should be hidden by default
 */
function shouldHideByDefault(param, confidence, hasEndpoint) {
    // Always show high-risk parameters if they have an endpoint
    if (isHighRiskParameter(param.name) && hasEndpoint) {
        return false;
    }
    
    // Show parameters with high confidence (≥ 70%)
    if (confidence >= 70) {
        return false;
    }
    
    // Hide low-risk parameters with low confidence (< 60%)
    if (param.riskLevel === 'low' && confidence < 60) {
        return true;
    }
    
    // Hide if no endpoint (unless high-risk which is handled above)
    if (!hasEndpoint) {
        return true;
    }
    
    return false;
}

/**
 * Extract query parameters from URL strings
 */
function extractQueryParameters(content, context) {
    const params = [];
    const seen = new Set();
    
    // Pattern 1: Direct query strings in URLs
    // fetch(`/api/users?id=${userId}&role=${role}`)
    const queryPattern1 = /["'`]([^"'`]*\?([a-zA-Z_][a-zA-Z0-9_-]{1,49})=[^"'`&]*)["'`]/g;
    let match;
    
    while ((match = queryPattern1.exec(content)) !== null) {
        const queryString = match[1];
        // Extract parameter names from query string
        const paramMatches = queryString.match(/([a-zA-Z_][a-zA-Z0-9_-]{1,49})=/g);
        if (paramMatches) {
            paramMatches.forEach(paramMatch => {
                const paramName = paramMatch.replace('=', '').trim();
                if (paramName && !seen.has(`query:${paramName}`)) {
                    seen.add(`query:${paramName}`);
                    params.push({
                        name: paramName,
                        location: 'query',
                        context: content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50))
                    });
                }
            });
        }
    }
    
    // Pattern 2: URLSearchParams
    // new URLSearchParams({ token: apiKey, action: 'delete' })
    const urlSearchParamsPattern = /(?:new\s+)?URLSearchParams\s*[({]\s*\{([^}]+)\}/g;
    while ((match = urlSearchParamsPattern.exec(content)) !== null) {
        const paramsObj = match[1];
        const paramMatches = paramsObj.match(/([a-zA-Z_][a-zA-Z0-9_-]{1,49})\s*:/g);
        if (paramMatches) {
            paramMatches.forEach(paramMatch => {
                const paramName = paramMatch.replace(':', '').trim();
                if (paramName && !seen.has(`query:${paramName}`)) {
                    seen.add(`query:${paramName}`);
                    params.push({
                        name: paramName,
                        location: 'query',
                        context: content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50))
                    });
                }
            });
        }
    }
    
    // Pattern 3: Axios params option
    // axios.get('/api/data', { params: { page: 1, limit: 10 } })
    const axiosParamsPattern = /params\s*:\s*\{([^}]+)\}/g;
    while ((match = axiosParamsPattern.exec(content)) !== null) {
        const paramsObj = match[1];
        const paramMatches = paramsObj.match(/([a-zA-Z_][a-zA-Z0-9_-]{1,49})\s*:/g);
        if (paramMatches) {
            paramMatches.forEach(paramMatch => {
                const paramName = paramMatch.replace(':', '').trim();
                if (paramName && !seen.has(`query:${paramName}`)) {
                    seen.add(`query:${paramName}`);
                    params.push({
                        name: paramName,
                        location: 'query',
                        context: content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50))
                    });
                }
            });
        }
    }
    
    return params;
}

/**
 * Extract body parameters from request bodies
 * Only extracts from serialized payloads, not request configuration objects
 */
function extractBodyParameters(content, context) {
    const params = [];
    const seen = new Set();
    
    // Configuration properties to exclude (not payload parameters)
    const configProperties = new Set([
        'method', 'headers', 'credentials', 'mode', 'cache', 'redirect', 
        'referrer', 'referrerPolicy', 'integrity', 'keepalive', 'signal',
        'timeout', 'validateStatus', 'responseType', 'withCredentials',
        'params', 'data', 'body' // These are containers, not parameters
    ]);
    
    // Pattern 1: JSON.stringify with object (always a payload)
    // JSON.stringify({ email: email, password: pass })
    const jsonStringifyPattern = /JSON\.stringify\s*\(\s*\{([^}]+)\}/g;
    let match;
    
    while ((match = jsonStringifyPattern.exec(content)) !== null) {
        const bodyObj = match[1];
        const paramMatches = bodyObj.match(/([a-zA-Z_$][a-zA-Z0-9_$-]{1,49})\s*:/g);
        if (paramMatches) {
            paramMatches.forEach(paramMatch => {
                const paramName = paramMatch.replace(':', '').trim();
                // Exclude configuration properties
                if (paramName && !configProperties.has(paramName.toLowerCase()) && !seen.has(`body:${paramName}`)) {
                    seen.add(`body:${paramName}`);
                    params.push({
                        name: paramName,
                        location: 'body',
                        context: content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50))
                    });
                }
            });
        }
    }
    
    // Pattern 2: Axios methods - second argument is the data/payload
    // axios.post('/api/login', { email: email, password: pwd })
    // axios.put('/api/users', userData)
    const axiosDataPattern = /axios\.(?:post|put|patch|delete)\s*\(\s*[^,]+,\s*\{([^}]+)\}/g;
    while ((match = axiosDataPattern.exec(content)) !== null) {
        const bodyObj = match[1];
        const paramMatches = bodyObj.match(/([a-zA-Z_$][a-zA-Z0-9_$-]{1,49})\s*:/g);
        if (paramMatches) {
            paramMatches.forEach(paramMatch => {
                const paramName = paramMatch.replace(':', '').trim();
                // Exclude configuration properties
                if (paramName && !configProperties.has(paramName.toLowerCase()) && !seen.has(`body:${paramName}`)) {
                    seen.add(`body:${paramName}`);
                    params.push({
                        name: paramName,
                        location: 'body',
                        context: content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50))
                    });
                }
            });
        }
    }
    
    // Pattern 3: Fetch with body property (explicit body in options)
    // fetch('/api/users', { method: 'POST', body: JSON.stringify({ role: 'admin' }) })
    // fetch('/api/users', { body: { role: 'admin' } })
    // Only extract from body property value when it's an object literal (not JSON.stringify result)
    const fetchBodyObjectPattern = /(?:fetch|axios)\s*\([^,]+,\s*\{[^}]*body\s*:\s*\{([^}]+)\}/g;
    while ((match = fetchBodyObjectPattern.exec(content)) !== null) {
        const bodyObj = match[1];
        const paramMatches = bodyObj.match(/([a-zA-Z_$][a-zA-Z0-9_$-]{1,49})\s*:/g);
        if (paramMatches) {
            paramMatches.forEach(paramMatch => {
                const paramName = paramMatch.replace(':', '').trim();
                // Exclude configuration properties
                if (paramName && !configProperties.has(paramName.toLowerCase()) && !seen.has(`body:${paramName}`)) {
                    seen.add(`body:${paramName}`);
                    params.push({
                        name: paramName,
                        location: 'body',
                        context: content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50))
                    });
                }
            });
        }
    }
    
    // Note: JSON.stringify patterns are already handled by Pattern 1, which correctly identifies payloads
    
    // Pattern 4: FormData.append (always payload)
    // formData.append('file', file)
    const formDataPattern = /\.append\s*\(\s*["']([a-zA-Z_][a-zA-Z0-9_-]{1,49})["']/g;
    while ((match = formDataPattern.exec(content)) !== null) {
        const paramName = match[1];
        if (!seen.has(`body:${paramName}`)) {
            seen.add(`body:${paramName}`);
            params.push({
                name: paramName,
                location: 'body',
                context: content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50))
            });
        }
    }
    
    return params;
}

/**
 * Extract header parameters
 */
function extractHeaderParameters(content, context) {
    const params = [];
    const seen = new Set();
    
    // Pattern: headers object
    // headers: { 'X-API-Key': apiKey, 'Authorization': `Bearer ${token}` }
    const headersPattern = /headers\s*:\s*\{([^}]+)\}/g;
    let match;
    
    // Standard headers to exclude
    const standardHeaders = new Set([
        'content-type', 'content-length', 'accept', 'accept-language',
        'accept-encoding', 'user-agent', 'referer', 'origin',
        'cache-control', 'connection', 'host', 'cookie'
    ]);
    
    while ((match = headersPattern.exec(content)) !== null) {
        const headersObj = match[1];
        // Match header names (with quotes or without)
        const headerMatches = headersObj.match(/(?:["'])?([a-zA-Z][a-zA-Z0-9_-]{1,49})(?:["'])?\s*:/g);
        if (headerMatches) {
            headerMatches.forEach(headerMatch => {
                const headerName = headerMatch.replace(/["']/g, '').replace(':', '').trim().toLowerCase();
                // Only include custom headers (X-*, Authorization, etc.)
                if ((headerName.startsWith('x-') || headerName === 'authorization') && 
                    !standardHeaders.has(headerName) &&
                    !seen.has(`header:${headerName}`)) {
                    seen.add(`header:${headerName}`);
                    params.push({
                        name: headerName,
                        location: 'header',
                        context: content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50))
                    });
                }
            });
        }
    }
    
    return params;
}

/**
 * Extract path parameters from dynamic URLs
 */
function extractPathParameters(content, context) {
    const params = [];
    const seen = new Set();
    
    // Pattern: Template literals with path variables
    // `/api/users/${userId}/data`
    // `/api/posts/${postId}/comments/${commentId}`
    const pathParamPattern = /\$\{([a-zA-Z_][a-zA-Z0-9_]{1,49})\}/g;
    let match;
    
    // Also check for string concatenation in paths
    // '/api/users/' + userId
    const pathConcatPattern = /["'`]\/[^"'`]*\/["'`]\s*\+\s*([a-zA-Z_][a-zA-Z0-9_]{1,49})/g;
    
    while ((match = pathParamPattern.exec(content)) !== null) {
        const paramName = match[1];
        // Check if it's in a URL context (before or after this match)
        const beforeContext = content.substring(Math.max(0, match.index - 100), match.index);
        const afterContext = content.substring(match.index + match[0].length, Math.min(content.length, match.index + match[0].length + 100));
        
        // Only extract if it appears to be in a URL/path context
        if ((beforeContext.includes('/') || beforeContext.includes('api') || beforeContext.includes('fetch') || beforeContext.includes('axios')) &&
            !seen.has(`path:${paramName}`)) {
            seen.add(`path:${paramName}`);
            params.push({
                name: paramName,
                location: 'path',
                context: beforeContext + match[0] + afterContext
            });
        }
    }
    
    return params;
}

/**
 * Detect API context from surrounding code
 */
function detectAPIContext(content, matchIndex) {
    const contextStart = Math.max(0, matchIndex - 200);
    const contextEnd = Math.min(content.length, matchIndex + 200);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    const hasExplicitAPICall = /(fetch|axios|xmlhttprequest|xhr\.|\.get\(|\.post\(|\.put\(|\.patch\(|\.delete\()/.test(context);
    const isAPIContext = hasExplicitAPICall || 
                         context.includes('api') || 
                         context.includes('endpoint') ||
                         context.includes('request');
    
    // Detect HTTP method
    let method = 'GET';
    if (context.includes('method') || context.includes('.post') || context.includes('.put') || 
        context.includes('.patch') || context.includes('.delete')) {
        if (context.includes('post')) method = 'POST';
        else if (context.includes('put')) method = 'PUT';
        else if (context.includes('patch')) method = 'PATCH';
        else if (context.includes('delete')) method = 'DELETE';
    }
    
    return {
        isAPIContext,
        hasExplicitAPICall,
        method
    };
}

/**
 * Normalize source file URL to remove query params and fragments for deduplication
 * This ensures app.js and app.js?v=123 are treated as the same file
 */
function normalizeSourceFile(sourceFile) {
    if (!sourceFile) return sourceFile;
    try {
        const url = new URL(sourceFile);
        // Remove query params and fragments, keep only pathname
        return `${url.protocol}//${url.host}${url.pathname}`;
    } catch (e) {
        // If URL parsing fails, try to remove query params manually
        return sourceFile.split('?')[0].split('#')[0];
    }
}

/**
 * Main extraction function
 */
export function extractParameters(content, sourceFile, associatedEndpoint = null) {
    const results = [];
    const seenParams = new Set();
    
    if (!content) return results;
    
    // Safety check: Only process JavaScript files
    if (sourceFile) {
        const url = sourceFile.toLowerCase();
        const isJS = url.endsWith('.js') || 
                     url.endsWith('.mjs') ||
                     url.includes('.js?') ||
                     url.includes('.js&');
        if (!isJS) {
            return results;
        }
    }
    
    // Normalize source file for deduplication (remove query params, fragments)
    const normalizedSourceFile = normalizeSourceFile(sourceFile);
    
    // Extract all parameter types
    const allParams = [];
    
    // Extract query parameters
    const queryParams = extractQueryParameters(content, { sourceFile });
    allParams.push(...queryParams);
    
    // Extract body parameters
    const bodyParams = extractBodyParameters(content, { sourceFile });
    allParams.push(...bodyParams);
    
    // Extract header parameters
    const headerParams = extractHeaderParameters(content, { sourceFile });
    allParams.push(...headerParams);
    
    // Extract path parameters
    const pathParams = extractPathParameters(content, { sourceFile });
    allParams.push(...pathParams);
    
    // Process and validate each parameter
    for (const param of allParams) {
        // Detect context - use match index from context if available (needed for endpoint extraction)
        let matchIndex = 0;
        if (param.context) {
            // Try to find the context in the content to get the index
            const contextIndex = content.indexOf(param.context);
            if (contextIndex !== -1) {
                matchIndex = contextIndex;
            }
        }
        const context = detectAPIContext(content, matchIndex);
        
        // Try to extract endpoint from context if not provided (do this early for better association)
        let endpoint = associatedEndpoint;
        if (!endpoint || endpoint === 'N/A') {
            // Look for endpoint in a wider context around the parameter
            // Check the parameter's context first
            const contextStr = param.context || '';
            let urlMatch = contextStr.match(/(?:["'`])(\/[^"'`?]+|https?:\/\/[^"'`?]+)(?:["'`])/);
            
            // If not found in param context, look in a wider window around the match index
            if (!urlMatch && matchIndex > 0) {
                const wideContextStart = Math.max(0, matchIndex - 300);
                const wideContextEnd = Math.min(content.length, matchIndex + 300);
                const wideContext = content.substring(wideContextStart, wideContextEnd);
                
                // Look for fetch/axios calls with URLs
                const fetchMatch = wideContext.match(/(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*["'`]([^"'`?]+)(?:["'`])/);
                if (fetchMatch) {
                    urlMatch = fetchMatch;
                } else {
                    // Look for any URL pattern in the wider context
                    urlMatch = wideContext.match(/(?:["'`])(\/api\/[^"'`?]+|\/v\d+\/[^"'`?]+|\/[a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-{}:]+)+)(?:["'`])/);
                }
            }
            
            if (urlMatch) {
                // Clean up the endpoint (remove query strings, fragments)
                endpoint = urlMatch[1].split('?')[0].split('#')[0];
            }
        }
        
        // Create unique key for deduplication (include endpoint to allow same param for different endpoints)
        // Use normalized source file to avoid duplicates when same file is fetched multiple times
        // This ensures we capture all parameters for each endpoint, even if they have the same name
        const uniqueKey = `${endpoint || 'unknown'}:${param.location}:${param.name}:${normalizedSourceFile}`;
        if (seenParams.has(uniqueKey)) continue;
        seenParams.add(uniqueKey);
        
        // Check if should suppress (with location parameter)
        if (shouldSuppress(param.name, context, param.location)) {
            continue;
        }
        
        // Check if references DOM/Event/Complex objects
        if (referencesComplexObjects(param.name, { context: param.context })) {
            continue;
        }
        
        // Check endpoint binding - don't show parameters without endpoints
        const hasEndpoint = endpoint !== null && endpoint !== 'N/A' && endpoint.trim() !== '';
        if (!hasEndpoint) {
            continue; // Rule 1: Do not display parameters with endpoint == N/A
        }
        
        // Calculate confidence (with endpoint binding consideration)
        let confidence = calculateConfidence(param, context, hasEndpoint);
        
        // Get risk level
        const riskLevel = getRiskLevel(param.name);
        
        // Determine if should be hidden by default
        const hiddenByDefault = shouldHideByDefault(param, confidence, hasEndpoint);
        
        // Add to results
        results.push({
            name: param.name,
            location: param.location, // 'query', 'body', 'header', 'path'
            endpoint: endpoint,
            method: context.method,
            confidence,
            riskLevel,
            sourceFile,
            hiddenByDefault
        });
    }
    
    // Sort by confidence (highest first), then by risk level
    results.sort((a, b) => {
        if (a.riskLevel !== b.riskLevel) {
            const riskOrder = { high: 3, medium: 2, low: 1 };
            return riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
        }
        return b.confidence - a.confidence;
    });
    
    return results;
}

/**
 * Extract parameters from multiple requests (for batch processing)
 */
export async function extractParametersFromRequests(requests, onProgress) {
    const results = [];
    const jsRequests = requests.filter(req => {
        if (!req || !req.request || !req.response) return false;
        const url = req.request.url.toLowerCase();
        const mime = req.response?.content?.mimeType?.toLowerCase() || '';
        return url.endsWith('.js') || 
               mime.includes('javascript') || 
               mime.includes('ecmascript') ||
               mime.includes('application/javascript');
    });
    
    let processed = 0;
    const total = jsRequests.length;
    
    for (const req of jsRequests) {
        try {
            let content = null;
            
            if (req.responseBody !== undefined) {
                content = req.responseBody || '';
            } else if (typeof req.getContent === 'function') {
                content = await new Promise((resolve, reject) => {
                    req.getContent((body, encoding) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(body || '');
                        }
                    });
                });
            } else {
                processed++;
                if (onProgress) onProgress(processed, total);
                continue;
            }
            
            if (content) {
                const params = extractParameters(content, req.request.url);
                results.push(...params);
            }
        } catch (err) {
            console.error('Error extracting parameters from request:', err);
        }
        
        processed++;
        if (onProgress) onProgress(processed, total);
    }
    
    return results;
}

