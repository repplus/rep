// Kingfisher Rules Loader and Validator
// Parses YAML rules from Kingfisher project and validates matches

/**
 * Validates that parentheses are balanced in a regex pattern
 */
function validateParentheses(pattern) {
    let depth = 0;
    let inCharClass = false;
    let i = 0;
    const parenStack = []; // Track opening paren positions for better error messages
    
    while (i < pattern.length) {
        const char = pattern[i];
        const prevChar = i > 0 ? pattern[i - 1] : '';
        const prevPrevChar = i > 1 ? pattern[i - 2] : '';
        
        // Handle escaped characters - skip the escaped char
        if (prevChar === '\\' && prevPrevChar !== '\\') {
            i++;
            continue;
        }
        // Handle double backslash (escaped backslash)
        if (prevChar === '\\' && prevPrevChar === '\\') {
            // This is an escaped backslash, so the current char is not escaped
            // Continue normal processing
        }
        
        // Handle character classes
        if (char === '[' && !inCharClass) {
            // Check if it's a negated character class [^...]
            inCharClass = true;
            i++;
            continue;
        }
        if (char === ']' && inCharClass) {
            inCharClass = false;
            i++;
            continue;
        }
        
        // Count parentheses (only outside character classes)
        if (!inCharClass) {
            if (char === '(') {
                depth++;
                parenStack.push(i);
            } else if (char === ')') {
                depth--;
                if (depth < 0) {
                    return { valid: false, error: `Unmatched closing parenthesis at position ${i}` };
                }
                parenStack.pop();
            }
        }
        
        i++;
    }
    
    if (depth !== 0) {
        const firstUnmatched = parenStack[0] || 0;
        return { valid: false, error: `Unmatched opening parenthesis (depth: ${depth}) at position ${firstUnmatched}` };
    }
    
    return { valid: true };
}

/**
 * Strips comments from regex patterns (vectorscan-style comments)
 * Removes patterns like (?#comment) and # comments
 * In extended mode (x flag), # at start of line (with optional whitespace) starts a comment
 */
function stripComments(pattern, isExtendedMode = false) {
    // Remove (?#...) style comments
    pattern = pattern.replace(/\(\?#[^)]*\)/g, '');
    
    if (isExtendedMode) {
        // In extended mode, process line by line
        // # at start of line (with optional leading whitespace) starts a comment
        const lines = pattern.split('\n');
        const processedLines = lines.map(line => {
            // Find # that starts a comment (not escaped, not in char class)
            // In extended mode, # after whitespace or at start of line starts a comment
            let result = '';
            let inCharClass = false;
            let i = 0;
            let commentStart = -1;
            
            while (i < line.length) {
                const char = line[i];
                const prevChar = i > 0 ? line[i - 1] : '';
                
                // Handle escaped characters
                if (prevChar === '\\') {
                    result += char;
                    i++;
                    continue;
                }
                
                // Handle character classes
                if (char === '[' && !inCharClass) {
                    inCharClass = true;
                    result += char;
                    i++;
                    continue;
                }
                if (char === ']' && inCharClass) {
                    inCharClass = false;
                    result += char;
                    i++;
                    continue;
                }
                
                // Check if # starts a comment
                if (!inCharClass && char === '#' && commentStart === -1) {
                    const isAtStart = i === 0;
                    const isAfterWhitespace = i > 0 && /\s/.test(line[i - 1]);
                    
                    if (isAtStart || isAfterWhitespace) {
                        commentStart = i;
                        break; // Rest of line is comment
                    }
                }
                
                result += char;
                i++;
            }
            
            return result;
        });
        
        return processedLines.join('\n');
    } else {
        // Not extended mode - only remove # comments at end of lines
        pattern = pattern.replace(/\s#[\s\w]*$/gm, '');
        return pattern;
    }
}

/**
 * Converts PCRE named groups (?P<name>...) to JavaScript named groups (?<name>...)
 */
function convertNamedGroups(pattern) {
    // Convert (?P<name>...) to (?<name>...)
    return pattern.replace(/\(\?P<([^>]+)>/g, '(?<$1>');
}

/**
 * Converts PCRE inline flag groups like (?i:...) to JavaScript-compatible syntax
 * Since JavaScript doesn't support inline flags, we remove them and rely on global flags
 */
function convertInlineFlagGroups(pattern, globalFlags) {
    // First convert named groups
    pattern = convertNamedGroups(pattern);
    
    // Match PCRE inline flag groups like (?i:...), (?-i:...), (?i-m:...), (?s:...), etc.
    // We need to handle nested parentheses correctly
    let converted = pattern;
    let hasCaseInsensitive = globalFlags.includes('i');
    let hasDotall = globalFlags.includes('s');
    let needsCaseInsensitive = false;
    let needsDotall = false;
    
    // Find all inline flag groups - we need to match balanced parentheses
    // Pattern: (? followed by optional - and flags, then : and content, then )
    const inlineFlagRegex = /\(\?([-]?[imsux]+):/g;
    let match;
    const replacements = [];
    
    // Reset regex lastIndex
    inlineFlagRegex.lastIndex = 0;
    
    while ((match = inlineFlagRegex.exec(converted)) !== null) {
        const startPos = match.index;
        const flagGroup = match[1];
        const contentStart = match.index + match[0].length;
        
        // Check flags in the inline group
        const isCaseInsensitive = flagGroup.includes('i') && !flagGroup.startsWith('-') && !flagGroup.includes('-i');
        const isDotall = flagGroup.includes('s') && !flagGroup.startsWith('-') && !flagGroup.includes('-s');
        
        if (isCaseInsensitive && !hasCaseInsensitive) {
            needsCaseInsensitive = true;
        }
        if (isDotall && !hasDotall) {
            needsDotall = true;
        }
        
        // Find the matching closing parenthesis
        // Need to handle character classes and escaped characters
        let depth = 1;
        let pos = contentStart;
        let contentEnd = -1;
        let inCharClass = false;
        
        while (pos < converted.length && depth > 0) {
            const char = converted[pos];
            const prevChar = pos > 0 ? converted[pos - 1] : '';
            
            // Handle escaped characters
            if (prevChar === '\\') {
                pos++;
                continue;
            }
            
            // Handle character classes
            if (char === '[' && !inCharClass) {
                inCharClass = true;
                pos++;
                continue;
            }
            if (char === ']' && inCharClass) {
                inCharClass = false;
                pos++;
                continue;
            }
            
            // Count parentheses only outside character classes
            if (!inCharClass) {
                if (char === '(') depth++;
                else if (char === ')') depth--;
            }
            
            pos++;
        }
        
        if (depth === 0) {
            contentEnd = pos - 1;
            const content = converted.substring(contentStart, contentEnd);
            replacements.push({
                start: startPos,
                end: pos,
                replacement: `(${content})`
            });
        }
    }
    
    // Apply replacements in reverse order to maintain positions
    replacements.reverse().forEach(repl => {
        converted = converted.substring(0, repl.start) + repl.replacement + converted.substring(repl.end);
    });
    
    // Update flags if needed
    if (needsCaseInsensitive && !hasCaseInsensitive) {
        globalFlags += 'i';
    }
    if (needsDotall && !hasDotall) {
        globalFlags += 's';
    }
    
    return { pattern: converted, flags: globalFlags };
}

/**
 * Converts PCRE flags to JavaScript RegExp flags
 * Handles (?xi) style flags at the start of patterns and inline flag groups
 */
function convertPatternFlags(pattern) {
    let flags = 'g';
    let cleanedPattern = pattern;
    let hasExtendedFlag = false;
    
    // Extract inline flags like (?xi) or (?i) at the start
    const flagMatch = pattern.match(/^\(\?([imsux]+)\)/);
    if (flagMatch) {
        const pcreFlags = flagMatch[1];
        cleanedPattern = pattern.replace(/^\(\?[imsux]+\)/, '');
        
        // Convert PCRE flags to JS flags
        if (pcreFlags.includes('i')) flags += 'i';
        if (pcreFlags.includes('m')) flags += 'm';
        if (pcreFlags.includes('s')) flags += 's'; // dotall - JS uses 's' flag
        if (pcreFlags.includes('x')) hasExtendedFlag = true; // extended mode - ignore whitespace
        // 'u' (unicode) is default in JS
    }
    
    // Convert inline flag groups like (?i:...) to JavaScript-compatible syntax
    const inlineResult = convertInlineFlagGroups(cleanedPattern, flags);
    cleanedPattern = inlineResult.pattern;
    flags = inlineResult.flags;
    
    // Handle standalone inline flags like (?i) or (?s) in the middle of patterns
    // These set flags for the rest of the pattern, so we apply them globally
    cleanedPattern = cleanedPattern.replace(/\(\?([imsux]+)\)/g, (match, pcreFlags) => {
        if (pcreFlags.includes('i') && !flags.includes('i')) flags += 'i';
        if (pcreFlags.includes('m') && !flags.includes('m')) flags += 'm';
        if (pcreFlags.includes('s') && !flags.includes('s')) flags += 's';
        if (pcreFlags.includes('x') && !hasExtendedFlag) {
            hasExtendedFlag = true;
        }
        return ''; // Remove the flag marker
    });
    
    // If extended flag is set, remove whitespace (except in character classes and escaped)
    if (hasExtendedFlag) {
        cleanedPattern = stripWhitespaceInExtendedMode(cleanedPattern);
    }
    
    return { pattern: cleanedPattern, flags };
}

/**
 * Strips whitespace in extended mode (x flag)
 * Preserves whitespace in character classes [ ] and escaped whitespace
 */
function stripWhitespaceInExtendedMode(pattern) {
    let result = '';
    let inCharClass = false;
    let i = 0;
    
    while (i < pattern.length) {
        const char = pattern[i];
        const nextChar = i + 1 < pattern.length ? pattern[i + 1] : '';
        
        // Handle character class start/end
        if (char === '[') {
            inCharClass = true;
            result += char;
            i++;
            continue;
        }
        if (char === ']' && inCharClass) {
            inCharClass = false;
            result += char;
            i++;
            continue;
        }
        
        // If in character class, keep everything
        if (inCharClass) {
            result += char;
            i++;
            continue;
        }
        
        // Handle escaped characters (keep escaped whitespace and brackets)
        if (char === '\\') {
            result += char;
            if (nextChar) {
                result += nextChar;
                i += 2;
            } else {
                i++;
            }
            continue;
        }
        
        // Skip whitespace (space, tab, newline) when not in char class and not escaped
        if (!inCharClass && /[\s\n\r\t]/.test(char)) {
            i++;
            continue;
        }
        
        result += char;
        i++;
    }
    
    return result;
}

/**
 * Validates pattern requirements (min_digits, min_uppercase, etc.)
 */
function validatePatternRequirements(match, requirements, context = null) {
    if (!requirements) return { passed: true };
    
    const str = match;
    
    // Check min_digits
    if (requirements.min_digits !== undefined) {
        const digitCount = (str.match(/\d/g) || []).length;
        if (digitCount < requirements.min_digits) {
            return { passed: false, reason: `Requires at least ${requirements.min_digits} digits, found ${digitCount}` };
        }
    }
    
    // Check min_uppercase
    if (requirements.min_uppercase !== undefined) {
        const upperCount = (str.match(/[A-Z]/g) || []).length;
        if (upperCount < requirements.min_uppercase) {
            return { passed: false, reason: `Requires at least ${requirements.min_uppercase} uppercase letters, found ${upperCount}` };
        }
    }
    
    // Check min_lowercase
    if (requirements.min_lowercase !== undefined) {
        const lowerCount = (str.match(/[a-z]/g) || []).length;
        if (lowerCount < requirements.min_lowercase) {
            return { passed: false, reason: `Requires at least ${requirements.min_lowercase} lowercase letters, found ${lowerCount}` };
        }
    }
    
    // Check min_special_chars
    if (requirements.min_special_chars !== undefined) {
        const specialChars = requirements.special_chars || "!@#$%^&*()_+-=[]{}|;:'\",.<>?/\\`~";
        const specialCount = (str.match(new RegExp(`[${specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g')) || []).length;
        if (specialCount < requirements.min_special_chars) {
            return { passed: false, reason: `Requires at least ${requirements.min_special_chars} special characters, found ${specialCount}` };
        }
    }
    
    // Check ignore_if_contains
    if (requirements.ignore_if_contains) {
        const lowerStr = str.toLowerCase();
        for (const term of requirements.ignore_if_contains) {
            const trimmed = term.trim();
            if (trimmed && lowerStr.includes(trimmed.toLowerCase())) {
                return { passed: false, reason: `Contains ignored term: ${trimmed}`, ignored: true };
            }
        }
    }
    
    // Checksum validation would require Liquid template engine - skipping for now
    // Can be implemented later if needed
    
    return { passed: true };
}

/**
 * Loads Kingfisher rules from YAML content
 * Returns array of rule objects with compiled regex patterns
 */
export async function loadKingfisherRules(yamlContent) {
    // Try to use js-yaml if available
    // To use js-yaml, you can:
    // 1. Download js-yaml.min.js and include it in your extension
    // 2. Add it to panel.html: <script src="lib/js-yaml.min.js"></script>
    // 3. It will be available as window.jsyaml
    
    let parsed;
    try {
        // Try to use js-yaml from window (if included in panel.html)
        if (typeof window !== 'undefined' && window.jsyaml && window.jsyaml.load) {
            parsed = window.jsyaml.load(yamlContent);
        } else {
            // Try to use a simple YAML parser for basic structures
            parsed = parseYamlRulesFallback(yamlContent);
            if (!parsed || (parsed.rules && parsed.rules.length === 0) || (Array.isArray(parsed) && parsed.length === 0)) {
                throw new Error('Fallback parser could not parse YAML');
            }
        }
    } catch (e) {
        console.error('Failed to parse YAML rules:', e);
        return [];
    }
    
    const rules = parsed.rules || (Array.isArray(parsed) ? parsed : []);
    
    const compiledRules = rules.map(rule => {
        if (!rule || !rule.pattern) {
            console.warn('Rule missing pattern:', rule.id || rule.name);
            return null;
        }
        
        // Check if pattern has extended mode flag before stripping comments
        const hasExtendedFlag = /^\(\?([imsux]+)\)/.test(rule.pattern) && /^\(\?([imsux]+)\)/.exec(rule.pattern)[1].includes('x');
        const cleanedPattern = stripComments(rule.pattern, hasExtendedFlag);
        const { pattern, flags } = convertPatternFlags(cleanedPattern);
        
        // Validate parentheses balance before attempting compilation
        // Note: This is a best-effort check. If validation fails but compilation succeeds, we accept it.
        const validation = validateParentheses(pattern);
        if (!validation.valid) {
            // Try to compile anyway - JavaScript's RegExp might be more lenient
            try {
                const regex = new RegExp(pattern, flags);
                // If compilation succeeds, the pattern is actually valid
                // (our validation might be too strict)
                return {
                    ...rule,
                    compiledRegex: regex,
                    cleanedPattern: pattern
                };
            } catch (compileError) {
                // Both validation and compilation failed - pattern is definitely invalid
                console.warn(`Invalid pattern for rule ${rule.id || rule.name}: ${validation.error}`);
                console.warn(`Compilation also failed: ${compileError.message}`);
                console.warn(`Original pattern: ${rule.pattern.substring(0, 150)}${rule.pattern.length > 150 ? '...' : ''}`);
                console.warn(`Converted pattern: ${pattern.substring(0, 200)}${pattern.length > 200 ? '...' : ''}`);
                return null;
            }
        }
        
        try {
            const regex = new RegExp(pattern, flags);
            return {
                ...rule,
                compiledRegex: regex,
                cleanedPattern: pattern
            };
        } catch (e) {
            console.warn(`Failed to compile regex for rule ${rule.id || rule.name}:`, e.message);
            console.warn(`Pattern: ${pattern.substring(0, 200)}${pattern.length > 200 ? '...' : ''}`);
            return null;
        }
    }).filter(Boolean);
    
    return compiledRules;
}

/**
 * Fallback YAML parser for basic rule structures
 * This is a very basic parser - for production, use js-yaml or pre-processed JSON
 * This parser handles the specific structure of Kingfisher rule files
 */
function parseYamlRulesFallback(yamlContent) {
    console.warn('Using fallback YAML parser - consider bundling js-yaml for better support');
    
    try {
        const rules = [];
        const lines = yamlContent.split('\n');
        let currentRule = null;
        let inPattern = false;
        let patternLines = [];
        let indentLevel = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            // Detect rule start
            if (trimmed.startsWith('- name:')) {
                if (currentRule) {
                    // Finish previous rule
                    if (inPattern && patternLines.length > 0) {
                        currentRule.pattern = patternLines.join('\n').trim();
                        patternLines = [];
                    }
                    rules.push(currentRule);
                }
                currentRule = { name: trimmed.replace(/^- name:\s*/, '').replace(/^["']|["']$/g, '') };
                inPattern = false;
                continue;
            }
            
            // Detect rule properties
            if (currentRule) {
                if (trimmed.startsWith('id:')) {
                    currentRule.id = trimmed.replace(/^id:\s*/, '').replace(/^["']|["']$/g, '');
                } else if (trimmed.startsWith('pattern:')) {
                    inPattern = true;
                    const patternValue = trimmed.replace(/^pattern:\s*\|?\s*/, '');
                    if (patternValue) {
                        patternLines.push(patternValue);
                    }
                } else if (inPattern && (line.startsWith(' ') || line.startsWith('\t'))) {
                    // Continuation of pattern (multiline)
                    patternLines.push(line);
                } else if (trimmed.startsWith('min_entropy:')) {
                    inPattern = false;
                    currentRule.min_entropy = parseFloat(trimmed.replace(/^min_entropy:\s*/, ''));
                } else if (trimmed.startsWith('pattern_requirements:')) {
                    inPattern = false;
                    currentRule.pattern_requirements = {};
                } else if (currentRule.pattern_requirements && trimmed.startsWith('min_digits:')) {
                    currentRule.pattern_requirements.min_digits = parseInt(trimmed.replace(/^min_digits:\s*/, ''));
                } else if (trimmed.match(/^[a-z_]+:/) && !trimmed.startsWith('pattern')) {
                    inPattern = false;
                }
            }
        }
        
        // Add last rule
        if (currentRule) {
            if (inPattern && patternLines.length > 0) {
                currentRule.pattern = patternLines.join('\n').trim();
            }
            if (currentRule.pattern) {
                rules.push(currentRule);
            }
        }
        
        return { rules };
    } catch (e) {
        console.error('Fallback YAML parser failed:', e);
        return { rules: [] };
    }
}

/**
 * Loads pre-processed JSON rules (recommended approach)
 * You can convert YAML rules to JSON and bundle them with the extension
 */
export async function loadKingfisherRulesFromJSON(jsonContent) {
    try {
        const parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
        const rules = parsed.rules || (Array.isArray(parsed) ? parsed : []);
        
        return rules.map(rule => {
            if (!rule || !rule.pattern) return null;
            
            // Check if pattern has extended mode flag before stripping comments
            const hasExtendedFlag = /^\(\?([imsux]+)\)/.test(rule.pattern) && /^\(\?([imsux]+)\)/.exec(rule.pattern)[1].includes('x');
            const cleanedPattern = stripComments(rule.pattern, hasExtendedFlag);
            const { pattern, flags } = convertPatternFlags(cleanedPattern);
            
            try {
                const regex = new RegExp(pattern, flags);
                return {
                    ...rule,
                    compiledRegex: regex,
                    cleanedPattern: pattern
                };
            } catch (e) {
                console.warn(`Failed to compile regex for rule ${rule.id || rule.name}:`, e);
                return null;
            }
        }).filter(Boolean);
    } catch (e) {
        console.error('Failed to load JSON rules:', e);
        return [];
    }
}

/**
 * Loads rules from a bundled JSON file (recommended for production)
 */
export async function loadKingfisherRulesFromFile(path) {
    try {
        const response = await fetch(chrome.runtime.getURL(path));
        const jsonContent = await response.json();
        return await loadKingfisherRulesFromJSON(jsonContent);
    } catch (e) {
        console.error(`Failed to load rules from ${path}:`, e);
        return [];
    }
}

/**
 * Scans content using Kingfisher rules
 */
export function scanWithKingfisherRules(content, rules, options = {}) {
    const results = [];
    if (!content || !rules || rules.length === 0) {
        return results;
    }
    
    const {
        minEntropy = 0,
        checkPatternRequirements = true,
        getEntropy = null // Pass entropy function from secrets.js
    } = options;
    
    for (const rule of rules) {
        if (!rule.compiledRegex) {
            continue;
        }
        
        try {
            const regex = rule.compiledRegex;
            let match;
            
            // Reset regex lastIndex for global regex
            regex.lastIndex = 0;
            
            while ((match = regex.exec(content)) !== null) {
                const matchedStr = match[0];
                const matchIndex = match.index;
                
                // Check entropy if function provided
                if (getEntropy && rule.min_entropy) {
                    const entropy = getEntropy(matchedStr);
                    if (entropy < rule.min_entropy) {
                        continue;
                    }
                }
                
                // Validate pattern requirements
                if (checkPatternRequirements && rule.pattern_requirements) {
                    const validation = validatePatternRequirements(
                        matchedStr,
                        rule.pattern_requirements,
                        { captures: match }
                    );
                    if (!validation.passed && !validation.ignored) {
                        continue;
                    }
                }
                
                // Get context
                const contextStart = Math.max(0, matchIndex - 100);
                const contextEnd = Math.min(content.length, matchIndex + matchedStr.length + 100);
                const context = content.substring(contextStart, contextEnd);
                
                results.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    match: matchedStr,
                    index: matchIndex,
                    confidence: rule.confidence || 'medium',
                    entropy: getEntropy ? getEntropy(matchedStr).toFixed(2) : null,
                    context: context,
                    validation: rule.validation || null
                });
            }
        } catch (e) {
            console.warn(`Error scanning with rule ${rule.id}:`, e);
        }
    }
    
    return results;
}

/**
 * Loads rules from a local YAML file (from rules/ directory)
 */
export async function loadKingfisherRulesFromLocalFile(filename) {
    try {
        const url = chrome.runtime.getURL(`rules/${filename}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const yamlContent = await response.text();
        const rules = await loadKingfisherRules(yamlContent);
        return rules;
    } catch (e) {
        console.error(`Failed to load Kingfisher rules from ${filename}:`, e);
        return [];
    }
}

/**
 * Loads rules from multiple local YAML files (from rules/ directory)
 */
export async function loadKingfisherRulesFromLocalFiles(filenames) {
    const allRules = [];
    for (const filename of filenames) {
        try {
            const rules = await loadKingfisherRulesFromLocalFile(filename);
            allRules.push(...rules);
        } catch (e) {
            console.warn(`Failed to load rules from ${filename}:`, e);
        }
    }
    return allRules;
}

/**
 * Auto-discovers and loads all YAML rule files from the rules/ directory
 * 
 * Two methods:
 * 1. Manifest file (RECOMMENDED): Create rules/_manifest.json listing your rule files
 *    - No code changes needed when adding new rules
 *    - Explicit control over which files to load
 * 2. Auto-discovery: Falls back to trying common filenames if no manifest exists
 *    - Requires updating commonRuleFiles array in code for new rule types
 * 
 * To use manifest: Copy _manifest.json.example to _manifest.json and list your files
 */
export async function loadAllKingfisherRulesFromLocal() {
    // First, try to load a manifest file that lists all available rules
    // RECOMMENDED: Create rules/_manifest.json to explicitly list your rule files
    try {
        const manifestUrl = chrome.runtime.getURL('rules/_manifest.json');
        const manifestResponse = await fetch(manifestUrl);
        if (manifestResponse.ok) {
            const manifest = await manifestResponse.json();
            if (manifest.files && Array.isArray(manifest.files)) {
                return await loadKingfisherRulesFromLocalFiles(manifest.files);
            }
        }
    } catch (e) {
        // Manifest doesn't exist, continue with auto-discovery
    }
    
    // Fallback: Auto-discovery by trying common rule filenames
    // NOTE: If you add custom rule files, either:
    // - Create rules/_manifest.json (recommended - no code changes)
    // - Or add the filename to this array
    const commonRuleFiles = [
        'slack.yaml',
        'aws.yaml',
        'github.yaml',
        'google.yaml',
        'stripe.yaml',
        'twilio.yaml',
        'azure.yaml',
        'heroku.yaml',
        'mailgun.yaml',
        'sendgrid.yaml',
        'paypal.yaml',
        'square.yaml',
    ];
    
    const allRules = [];
    
    // Try to load each file - missing files will fail gracefully
    for (const filename of commonRuleFiles) {
        try {
            const rules = await loadKingfisherRulesFromLocalFile(filename);
            if (rules.length > 0) {
                allRules.push(...rules);
            }
        } catch (e) {
            // File doesn't exist or failed to load, skip silently
        }
    }
    
    return allRules;
}

/**
 * Loads rules from a URL (for fetching Kingfisher rules from GitHub - kept for fallback)
 */
export async function loadKingfisherRulesFromURL(url) {
    try {
        const response = await fetch(url);
        const yamlContent = await response.text();
        return await loadKingfisherRules(yamlContent);
    } catch (e) {
        console.error('Failed to load Kingfisher rules from URL:', e);
        return [];
    }
}

/**
 * Loads rules from multiple YAML files (for loading all Kingfisher rule files)
 */
export async function loadKingfisherRulesFromURLs(urls) {
    const allRules = [];
    for (const url of urls) {
        try {
            const rules = await loadKingfisherRulesFromURL(url);
            allRules.push(...rules);
        } catch (e) {
            console.warn(`Failed to load rules from ${url}:`, e);
        }
    }
    return allRules;
}

