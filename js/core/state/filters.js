// Filter State Management
export const filterState = {
    currentFilter: 'all', // all, GET, POST, etc. (legacy, kept for compatibility)
    selectedMethods: new Set(), // Set of selected HTTP methods (e.g., ['GET', 'POST'])
    starFilterActive: false, // Whether star filter is active
    currentColorFilter: 'all', // all, red, green, blue, etc.
    currentSearchTerm: '',
    useRegex: false
};

