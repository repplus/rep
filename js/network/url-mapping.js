const STORAGE_KEY = 'rep_url_mappings';


function normalizeMappings(mappings) {
    if (!Array.isArray(mappings)) return [];
    return mappings
        .map(mapping => ({
            from: typeof mapping?.from === 'string' ? mapping.from.trim() : '',
            to: typeof mapping?.to === 'string' ? mapping.to.trim() : ''
        }))
        .filter(mapping => mapping.from && mapping.to);
}

export function getUrlMappings() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [];

    try {
        const parsed = JSON.parse(stored);
        return normalizeMappings(parsed);
    } catch (err) {
        localStorage.removeItem(STORAGE_KEY);
        return [];
    }
}

export function saveUrlMappings(mappings) {
    const normalized = normalizeMappings(mappings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function applyUrlMappings(url, mappings = getUrlMappings()) {
    for (const mapping of mappings) {
        if (!mapping.from || !mapping.to) continue;
        if (url.startsWith(mapping.from)) {
            return mapping.to + url.slice(mapping.from.length);
        }
    }
    return url;
}
