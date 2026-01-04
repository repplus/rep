// Attack Surface State Management
export const attackSurfaceState = {
    attackSurfaceCategories: {}, // { requestIndex: { category, confidence, reasoning, icon } }
    domainsWithAttackSurface: new Set(), // Track which domains have been analyzed
    isAnalyzingAttackSurface: false
};

