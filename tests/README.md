# Tests

This directory contains unit tests for rep+.

## Running Tests

```bash
# Install dependencies first
npm install

# Run tests once
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with UI (interactive)
npm run test:ui
```

## Test Structure

- `format.test.js` - Tests for formatting utilities (bytes, time)
- `network.test.js` - Tests for network utilities (getHostname)
- `dom.test.js` - Tests for DOM utilities (escapeHtml, arrayToCSV)
- `misc.test.js` - Tests for miscellaneous utilities (testRegex, decodeJWT)
- `state.test.js` - Tests for state management (addRequest, clearRequests, addToHistory, filter state, starring state, blocking state)
- `events.test.js` - Tests for event system (EventBus, event emission, listening, unsubscription, error handling)
- `extractors.test.js` - Tests for extractors feature (secret detection with Kingfisher, parameter extraction, endpoint extraction)
- `network-parsing.test.js` - Tests for network parsing (request parsing, response formatting, status classification, export/import)

## Adding New Tests

1. Create a new test file: `tests/[module-name].test.js`
2. Import the functions you want to test
3. Write test cases using Vitest's `describe` and `it` blocks

Example:
```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../js/core/utils/my-module.js';

describe('myFunction', () => {
  it('should do something', () => {
    expect(myFunction(input)).toBe(expectedOutput);
  });
});
```

## Important

**Test files are NOT included in Chrome Web Store builds.** They are excluded via `.gitignore` and should not be packaged with the extension.

