// Extractors Feature - Main Entry Point
// This module follows the CONTRIBUTING.md pattern where index.js is the entry point

export { initExtractorUI } from './ui.js';

// Re-export other extractor functions if needed by other modules
export { extractEndpoints } from './endpoints.js';
export { extractParameters } from './parameters.js';
export { scanForSecrets } from './secrets.js';
export { loadAllKingfisherRulesFromLocal } from './kingfisher-rules.js';

