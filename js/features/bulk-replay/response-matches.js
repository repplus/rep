export function parseResponseMarkers(value) {
    const seen = new Set();

    return String(value || '')
        .split(/\r?\n/)
        .map(marker => marker.trim())
        .filter(marker => {
            if (!marker || seen.has(marker)) return false;
            seen.add(marker);
            return true;
        });
}

export function normalizeResponseMatchers(matchers) {
    if (!Array.isArray(matchers)) return [];

    const seen = new Set();
    return matchers
        .map(matcher => {
            const text = String(typeof matcher === 'string' ? matcher : matcher?.text || '').trim();
            const mode = typeof matcher === 'object' && matcher?.mode === 'whole' ? 'whole' : 'partial';
            return { text, mode };
        })
        .filter(matcher => {
            const key = `${matcher.mode}\u0000${matcher.text}`;
            if (!matcher.text || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

export function findResponseMatches(text, matchers, { caseSensitive = true } = {}) {
    const source = String(text || '');
    const normalizedMatchers = normalizeResponseMatchers(matchers);
    if (!source || normalizedMatchers.length === 0) return [];

    const haystack = caseSensitive ? source : source.toLocaleLowerCase();
    const occupied = new Uint8Array(source.length);
    const matches = [];
    const rules = normalizedMatchers
        .map((matcher, index) => ({ ...matcher, index }))
        .sort((a, b) =>
            b.text.length - a.text.length ||
            (a.mode === b.mode ? 0 : a.mode === 'whole' ? -1 : 1) ||
            a.index - b.index
        );

    rules.forEach(rule => {
        const needle = caseSensitive ? rule.text : rule.text.toLocaleLowerCase();

        if (rule.mode === 'whole') {
            if (haystack === needle && !occupied.some(Boolean)) {
                occupied.fill(1);
                matches.push({
                    marker: rule.text,
                    mode: rule.mode,
                    start: 0,
                    end: source.length,
                    markerIndex: rule.index
                });
            }
            return;
        }

        let searchFrom = 0;

        while (searchFrom <= haystack.length - needle.length) {
            const start = haystack.indexOf(needle, searchFrom);
            if (start === -1) break;

            const end = start + needle.length;
            let overlaps = false;
            for (let offset = start; offset < end; offset++) {
                if (occupied[offset]) {
                    overlaps = true;
                    break;
                }
            }

            if (!overlaps) {
                occupied.fill(1, start, end);
                matches.push({
                    marker: rule.text,
                    mode: rule.mode,
                    start,
                    end,
                    markerIndex: rule.index
                });
            }

            searchFrom = start + 1;
        }
    });

    return matches.sort((a, b) => a.start - b.start || a.markerIndex - b.markerIndex);
}

export function getMatchedResponseMarkers(text, markers, options) {
    return getMatchedResponseMatchers(text, markers, options).map(matcher => matcher.text);
}

export function getMatchedResponseMatchers(text, matchers, options) {
    const normalizedMatchers = normalizeResponseMatchers(matchers);
    const matchedIndexes = new Set(
        findResponseMatches(text, normalizedMatchers, options).map(match => match.markerIndex)
    );
    return normalizedMatchers.filter((_, index) => matchedIndexes.has(index));
}

export function highlightResponseMatches(element, matchers, options) {
    if (!element || !Array.isArray(matchers) || matchers.length === 0) return 0;

    const doc = element.ownerDocument || document;
    const showText = doc.defaultView?.NodeFilter?.SHOW_TEXT || 4;
    const walker = doc.createTreeWalker(element, showText);
    const textNodes = [];
    let node;
    let offset = 0;

    while ((node = walker.nextNode())) {
        const start = offset;
        offset += node.nodeValue.length;
        textNodes.push({ node, start, end: offset });
    }

    const matches = findResponseMatches(element.textContent || '', matchers, options);
    if (matches.length === 0) return 0;

    textNodes.reverse().forEach(entry => {
        const intersections = matches
            .filter(match => match.start < entry.end && match.end > entry.start)
            .map(match => ({
                marker: match.marker,
                start: Math.max(0, match.start - entry.start),
                end: Math.min(entry.node.nodeValue.length, match.end - entry.start)
            }))
            .sort((a, b) => b.start - a.start);

        intersections.forEach(intersection => {
            if (intersection.start >= intersection.end) return;

            const matchedNode = entry.node.splitText(intersection.start);
            matchedNode.splitText(intersection.end - intersection.start);
            const mark = doc.createElement('mark');
            mark.className = 'response-match-highlight';
            mark.title = `Response matcher: ${intersection.marker}`;
            matchedNode.parentNode.replaceChild(mark, matchedNode);
            mark.appendChild(matchedNode);
        });
    });

    return matches.length;
}
