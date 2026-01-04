import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files location
    include: ['tests/**/*.test.js'],
    // Environment - use jsdom for DOM-related tests
    environment: 'jsdom',
    // Setup files
    setupFiles: [],
    // Coverage (optional, for future use)
    coverage: {
      exclude: [
        'node_modules/',
        'tests/',
        'lib/',
        '*.config.js'
      ]
    }
  }
});

