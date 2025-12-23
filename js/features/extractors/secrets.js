// Legacy SECRET_REGEXES and JS_METHOD_PATTERNS removed
// All secret detection is now handled by Kingfisher rules

// Known false positive patterns
const KNOWN_FALSE_POSITIVE_PATTERNS = [
    // Webpack/build tool artifacts
    /^[a-f0-9]{40}$/i, // Git commit hashes, webpack chunk hashes
    /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/, // PascalCase identifiers
    /^[a-z][a-zA-Z0-9]+(?:[A-Z][a-z0-9]+)+$/, // camelCase identifiers
    // Common library patterns
    /^(?:map|filter|reduce|forEach|slice|splice|concat)/i,
    // React/framework internals
    /^_react|_emotion|_styled|_next/i,
    // Source map references
    /sourceMappingURL/i,
    // Build system patterns
    /^__webpack/i,
    /^module\./i,
    /^exports\./i,
];

// Enhanced context patterns to skip
const FALSE_POSITIVE_CONTEXT_PATTERNS = [
    /base64,/i,
    /data:image/i,
    /;base64/i,
    /"(?:publicKey|privateKey|data|content|image|icon|font|logo|avatar|thumbnail|media|src|href)":/i,
    /iVBOR|AAAA|\/png|\/jpeg|\/jpg|\/gif|\/webp|\/svg/i,
    /sourceMappingURL=/i,
    /webpack:\/\//i,
    /__webpack/i,
    /\.chunk\.js/i,
    /\/\*#\s*source/i,
    // Asset imports
    /import\s+.*\s+from\s+['"]/i,
    /require\s*\(['"]/i,
    // Common base64 data patterns
    /["']data["']\s*:/i,
    /["']image["']\s*:/i,
    /\/\/ data:image/i,
];

// Calculate Shannon Entropy
function getEntropy(str) {
    const len = str.length;
    const frequencies = {};
    for (let i = 0; i < len; i++) {
        const char = str[i];
        frequencies[char] = (frequencies[char] || 0) + 1;
    }

    let entropy = 0;
    for (const char in frequencies) {
        const p = frequencies[char] / len;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

// Enhanced base64 data detection
function isLikelyBase64Data(str, context) {
    // Check for data URI schemes
    if (/data:[\w/-]+;base64,/.test(context)) return true;

    // Check for common base64 padding patterns
    if (/={1,2}$/.test(str) && str.length > 100) return true;

    // Very long strings with base64 chars are likely encoded data
    if (str.length > 200 && /^[A-Za-z0-9+/=]+$/.test(str)) return true;

    // Check if surrounded by quotes and part of a data property
    const beforeContext = context.substring(0, 100);
    if (/"(?:data|content|image|icon|font|media|src|href|asset|resource)"\s*:\s*"[^"]*$/i.test(beforeContext)) {
        return true;
    }

    // Check if it's in a string literal assignment to a data-related variable
    if (/(?:const|let|var)\s+(?:data|image|icon|font|asset|resource|content)\w*\s*=\s*["`'][^"`']*$/i.test(beforeContext)) {
        return true;
    }

    return false;
}

// Check if line is in a comment
function isInComment(line) {
    const trimmed = line.trim();
    return /^\s*\/\//.test(trimmed) || /^\s*\*/.test(trimmed) || /^\s*\/\*/.test(trimmed);
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

// Deduplicate results
function deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
        // Create a key based on type, match, and normalized file
        // This prevents duplicates when same file is fetched multiple times
        const normalizedFile = normalizeSourceFile(result.file || '');
        const key = `${result.type}:${result.match}:${normalizedFile}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Kingfisher rules cache
let kingfisherRulesCache = null;

/**
 * Loads Kingfisher rules (lazy-loaded, cached)
 * Loads from local YAML files in the rules/ directory
 */
async function loadKingfisherRules() {
    if (kingfisherRulesCache) {
        return kingfisherRulesCache;
    }
    
    try {
        const { 
            loadAllKingfisherRulesFromLocal, 
            scanWithKingfisherRules 
        } = await import('./kingfisher-rules.js');
        
        // Auto-discover and load all YAML files from rules/ directory
        // This will try to load a _manifest.json file first, or auto-discover common filenames
        const rules = await loadAllKingfisherRulesFromLocal();
        
        kingfisherRulesCache = { rules, scanWithKingfisherRules };
        return kingfisherRulesCache;
    } catch (e) {
        console.error('Failed to load Kingfisher rules:', e);
        kingfisherRulesCache = { rules: [], scanWithKingfisherRules: null };
        return kingfisherRulesCache;
    }
}

// Legacy scanContent function - now deprecated in favor of Kingfisher rules
// Kept for backward compatibility but returns empty results
export function scanContent(content, url) {
    // All secret detection is now handled by Kingfisher rules
    // This function is kept for API compatibility but does nothing
    return [];
}

/**
 * Scans content with Kingfisher rules (async)
 */
export async function scanContentWithKingfisher(content, url) {
    const results = [];
    if (!content) {
        return results;
    }

    try {
        const { rules, scanWithKingfisherRules } = await loadKingfisherRules();
        if (!rules || rules.length === 0 || !scanWithKingfisherRules) {
            return results;
        }
        
        const kingfisherResults = scanWithKingfisherRules(content, rules, {
            getEntropy: getEntropy,
            checkPatternRequirements: true
        });
        
        // Convert Kingfisher results to our format
        for (const result of kingfisherResults) {
            // Skip if it's a false positive based on context
            const contextStart = Math.max(0, result.index - 100);
            const contextEnd = Math.min(content.length, result.index + result.match.length + 100);
            const context = content.substring(contextStart, contextEnd);
            
            // Apply same false positive filters as regular secrets
                let isFalsePositive = false;
                for (const fpPattern of KNOWN_FALSE_POSITIVE_PATTERNS) {
                if (fpPattern.test(result.match)) {
                        isFalsePositive = true;
                        break;
                    }
                }
                if (isFalsePositive) continue;

            // Check context patterns
                let skipDueToContext = false;
                for (const contextPattern of FALSE_POSITIVE_CONTEXT_PATTERNS) {
                    if (contextPattern.test(context)) {
                        skipDueToContext = true;
                        break;
                    }
                }
                if (skipDueToContext) continue;

                // Check if it's likely base64 data
            if (isLikelyBase64Data(result.match, context)) continue;

            // Get line context
            const lineStart = content.lastIndexOf('\n', result.index) + 1;
            const lineEnd = content.indexOf('\n', result.index);
                const line = content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd);

            // Skip if in comment
                if (isInComment(line)) continue;

            // Calculate confidence based on rule confidence and entropy
            let confidence = 50;
            if (result.confidence === 'high') confidence = 85;
            else if (result.confidence === 'medium') confidence = 70;
            else confidence = 60;
            
            if (result.entropy) {
                const entropy = parseFloat(result.entropy);
                if (entropy > 4.5) confidence += 10;
                else if (entropy < 3.5) confidence -= 10;
                }

                // Only include high-confidence results
                if (confidence < 60) continue;
            
            // Use ruleName for a cleaner, human-readable type
            // Fallback to ruleId if ruleName is not available
            const typeName = result.ruleName || result.ruleId || 'Unknown Secret';

                results.push({
                    file: url,
                type: typeName,
                match: result.match,
                index: result.index,
                confidence: Math.min(100, confidence),
                entropy: result.entropy || '0.00',
                ruleName: result.ruleName,
                ruleId: result.ruleId
                });
            }
        } catch (e) {
        console.warn('Error scanning with Kingfisher rules:', e);
    }
    
    return results;
}

export async function scanForSecrets(requests, onProgress, onSecretFound) {
    const results = [];
    const seenSecrets = new Set(); // For deduplication
    let processed = 0;
    const total = requests.length;

    for (const req of requests) {
        try {
        // Only process JavaScript files
            if (!req || !req.request || !req.response) {
                processed++;
                if (onProgress) onProgress(processed, total);
                continue;
            }
            
        const url = req.request.url.toLowerCase();
            const mime = req.response?.content?.mimeType?.toLowerCase() || '';
            const isJS = url.endsWith('.js') || 
                       mime.includes('javascript') || 
                       mime.includes('ecmascript') ||
                       mime.includes('application/javascript');
            
            if (isJS) {
            try {
                    // Use stored responseBody if available, otherwise try getContent
                    let content = null;
                    
                    if (req.responseBody !== undefined) {
                        // Response body was already fetched during capture
                        content = req.responseBody || '';
                    } else if (typeof req.getContent === 'function') {
                        // Fallback: try to get content if it's a DevTools request object
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
                        // Scan with Kingfisher rules only
                        try {
                            const kingfisherSecrets = await scanContentWithKingfisher(content, req.request.url);
                            
                            // Process each secret found
                            for (const secret of kingfisherSecrets) {
                                // Create deduplication key
                                const key = `${secret.type}:${secret.match}`;
                                
                                // Only add if not seen before
                                if (!seenSecrets.has(key)) {
                                    seenSecrets.add(key);
                                    results.push(secret);
                                    
                                    // Notify UI immediately when a secret is found
                                    if (onSecretFound) {
                                        onSecretFound(secret);
                                    }
                                }
                }
                        } catch (e) {
                            console.warn('Error scanning with Kingfisher:', e);
                        }
                    }
                } catch (err) {
                    console.error(`Error scanning request ${url}:`, err);
            }
            }
        } catch (err) {
            console.error('Error processing request:', err);
        }

        processed++;
        if (onProgress) onProgress(processed, total);
    }

    // Return deduplicated results
    return results;
}