// Endpoint extraction patterns
const ENDPOINT_PATTERNS = {
    // API paths
    apiPath: /["'`](\/api\/[a-zA-Z0-9_\-\/{}:]+)["'`]/g,
    versionedPath: /["'`](\/v\d+\/[a-zA-Z0-9_\-\/{}:]+)["'`]/g,

    // Full URLs
    fullUrl: /["'`](https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)["'`]/g,

    // Relative paths that look like API endpoints
    relativePath: /["'`](\/[a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-{}:]+)+)["'`]/g,

    // GraphQL endpoints
    graphqlPath: /["'`](\/graphql|\/gql)["'`]/gi,

    // Fetch/Axios/XHR calls
    fetchCall: /(?:fetch|axios)\s*\(\s*["'`]([^"'`]+)["'`]/g,
    axiosMethod: /axios\.(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi,

    // Template literals with URLs
    templateUrl: /`([^`]*(?:https?:\/\/|\/api\/|\/v\d+\/)[^`]*)`/g,

    // Common REST patterns
    restEndpoint: /["'`](\/(?:users|auth|login|logout|register|profile|settings|posts|comments|products|orders|payments|upload|download|search|items|entities|resources)(?:\/[a-zA-Z0-9_\-{}:]*)?(?:\/[a-zA-Z0-9_\-{}:]+)*)["'`]/g,
};

// HTTP methods to look for near endpoints
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// Extract HTTP method from context
function extractMethod(content, matchIndex, endpoint) {
    // Look in the surrounding 200 characters
    const contextStart = Math.max(0, matchIndex - 100);
    const contextEnd = Math.min(content.length, matchIndex + endpoint.length + 100);
    const context = content.substring(contextStart, contextEnd);

    // Check for axios method calls
    const axiosMatch = context.match(/axios\.(get|post|put|patch|delete|head|options)/i);
    if (axiosMatch) {
        return axiosMatch[1].toUpperCase();
    }

    // Check for fetch with method option
    const fetchMethodMatch = context.match(/method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/i);
    if (fetchMethodMatch) {
        return fetchMethodMatch[1].toUpperCase();
    }

    // Check for explicit method mentions
    for (const method of HTTP_METHODS) {
        const methodRegex = new RegExp(`["'\`]${method}["'\`]`, 'i');
        if (methodRegex.test(context)) {
            return method;
        }
    }

    // Default guess based on endpoint pattern
    if (endpoint.includes('{id}') || endpoint.includes(':id') || /\/\d+/.test(endpoint)) {
        return 'GET'; // Likely a resource fetch
    }

    if (endpoint.includes('/login') || endpoint.includes('/register') || endpoint.includes('/upload') || endpoint.includes('/create')) {
        return 'POST';
    }

    if (endpoint.includes('/update') || endpoint.includes('/edit')) {
        return 'PUT';
    }

    if (endpoint.includes('/delete') || endpoint.includes('/remove')) {
        return 'DELETE';
    }

    return 'GET'; // Default
}

// Calculate confidence based on various factors
function calculateConfidence(endpoint, method, context) {
    let confidence = 50;

    // High confidence patterns
    if (endpoint.startsWith('/api/')) confidence += 30;
    if (endpoint.startsWith('/v1/') || endpoint.startsWith('/v2/')) confidence += 25;
    if (endpoint === '/graphql' || endpoint === '/gql') confidence += 30;

    // Method was explicitly found
    if (method !== 'GET' || context.includes('method')) confidence += 15;

    // Has path parameters
    if (endpoint.includes('{') || endpoint.includes(':')) confidence += 10;

    // Common REST patterns
    if (/\/(users|auth|login|posts|products|orders)/.test(endpoint)) confidence += 15;

    // Full URL
    if (endpoint.startsWith('http')) confidence += 20;

    // Deductions for uncertainty
    if (endpoint.length < 4) confidence -= 20;
    if (!endpoint.includes('/')) confidence -= 15;

    // Check if it might be a file path instead of API endpoint
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|ttf|eot)$/i.test(endpoint)) {
        confidence -= 40;
    }

    return Math.min(100, Math.max(0, confidence));
}

// Normalize source file URL to remove query params and fragments for deduplication
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

// Clean and normalize endpoint
function normalizeEndpoint(endpoint) {
    // Remove quotes and backticks
    endpoint = endpoint.replace(/["'`]/g, '');

    // Remove query parameters for cleaner display (we'll show them separately)
    const [path, query] = endpoint.split('?');

    return path.trim();
}

// Check if endpoint is likely valid
function isValidEndpoint(endpoint) {
    // Skip very short paths
    if (endpoint.length < 3) return false;

    // Skip common false positives
    const falsePositives = [
        '//',
        '/\\"',
        '/\\',
        '/node_modules/',
        '/webpack/',
        '/dist/',
        '/build/',
        '/__',
        '/static/',
        '/public/',
        '/images/',
        '/fonts/',
        '/styles/',
        '/scripts/'
    ];

    for (const fp of falsePositives) {
        if (endpoint.includes(fp)) return false;
    }

    // Must start with / or http
    if (!endpoint.startsWith('/') && !endpoint.startsWith('http')) return false;

    return true;
}

export function extractEndpoints(content, sourceFile) {
    const results = [];
    const seenEndpoints = new Set();

    if (!content) return results;

    // Safety check: Only process JavaScript files
    // This is a defensive check - the UI should already filter, but this ensures robustness
    if (sourceFile) {
        const url = sourceFile.toLowerCase();
        // Check for common JavaScript file extensions
        const isJS = url.endsWith('.js') || 
                     url.endsWith('.mjs') ||
                     url.includes('.js?') ||  // JS files with query params
                     url.includes('.js&');     // JS files with query params
        if (!isJS) {
            // Not a JavaScript file, skip extraction
            return results;
        }
    }

    // Extract base URL from source file
    let baseUrl = '';
    try {
        const url = new URL(sourceFile);
        baseUrl = `${url.protocol}//${url.host}`;
    } catch (e) {
        // If URL parsing fails, leave baseUrl empty
    }

    // Extract endpoints using all patterns
    for (const [patternName, pattern] of Object.entries(ENDPOINT_PATTERNS)) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);

        while ((match = regex.exec(content)) !== null) {
            let endpoint = match[1] || match[2]; // Different capture groups

            if (!endpoint) continue;

            endpoint = normalizeEndpoint(endpoint);

            if (!isValidEndpoint(endpoint)) continue;

            // Normalize source file for deduplication (remove query params, fragments)
            const normalizedSourceFile = normalizeSourceFile(sourceFile);

            // Create unique key for deduplication
            const uniqueKey = `${endpoint}|${normalizedSourceFile}`;
            if (seenEndpoints.has(uniqueKey)) continue;
            seenEndpoints.add(uniqueKey);

            // Extract method from context
            const method = extractMethod(content, match.index, endpoint);

            // Get context for confidence calculation
            const contextStart = Math.max(0, match.index - 50);
            const contextEnd = Math.min(content.length, match.index + 100);
            const context = content.substring(contextStart, contextEnd);

            const confidence = calculateConfidence(endpoint, method, context);

            // Only include if confidence is reasonable
            if (confidence >= 30) {
                results.push({
                    endpoint,
                    method,
                    file: sourceFile,
                    baseUrl,
                    confidence,
                    patternType: patternName
                });
            }
        }
    }

    // Sort by confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
}

export async function extractEndpointsFromRequests(requests, onProgress) {
    const results = [];
    const jsRequests = requests.filter(req => {
        const url = req.request.url.toLowerCase();
        const mime = req.response.content.mimeType.toLowerCase();
        return url.endsWith('.js') || mime.includes('javascript') || mime.includes('ecmascript');
    });

    let processed = 0;
    const total = jsRequests.length;

    for (const req of jsRequests) {
        try {
            const content = await new Promise((resolve) => {
                req.getContent((content, encoding) => {
                    resolve(content);
                });
            });

            if (content) {
                const endpoints = extractEndpoints(content, req.request.url);
                results.push(...endpoints);
            }
        } catch (err) {
            console.error('Error extracting endpoints from request:', err);
        }

        processed++;
        if (onProgress) onProgress(processed, total);
    }

    // Sort by confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
}
