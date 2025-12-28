const MAX_CACHE_SIZE = 100;

const analysisCache = new Map();
const cacheAccessOrder = [];

export function getHeaderHash(headers) {
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
        return 'empty';
    }
    
    const normalized = headers
        .filter(h => h && h.name)
        .map(h => `${h.name.toLowerCase()}:${h.value || ''}`)
        .sort()
        .join('|');
    
    if (!normalized) {
        return 'empty';
    }
    
    return btoa(unescape(encodeURIComponent(normalized))).slice(0, 32);
}

function updateAccessOrder(key) {
    const index = cacheAccessOrder.indexOf(key);
    if (index > -1) {
        cacheAccessOrder.splice(index, 1);
    }
    cacheAccessOrder.push(key);
}

function evictLRU() {
    while (cacheAccessOrder.length > MAX_CACHE_SIZE) {
        const oldestKey = cacheAccessOrder.shift();
        analysisCache.delete(oldestKey);
    }
}

export function getCachedAnalysis(headers) {
    const hash = getHeaderHash(headers);
    
    if (analysisCache.has(hash)) {
        updateAccessOrder(hash);
        return analysisCache.get(hash);
    }
    
    return null;
}

export function setCachedAnalysis(headers, result) {
    const hash = getHeaderHash(headers);
    
    analysisCache.set(hash, result);
    updateAccessOrder(hash);
    evictLRU();
}

export function clearCache() {
    analysisCache.clear();
    cacheAccessOrder.length = 0;
}

export function getCacheSize() {
    return analysisCache.size;
}

export function getCacheStats() {
    return {
        size: analysisCache.size,
        maxSize: MAX_CACHE_SIZE
    };
}
