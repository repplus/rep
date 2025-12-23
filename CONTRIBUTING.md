# Contributing to rep+

Thank you for your interest in contributing! This guide will help you understand the codebase structure and how to add new features.

## Architecture Overview

The codebase is organized into clear, modular components:

```
js/
├── core/           # Core functionality (state, events, utilities)
├── features/       # Feature modules (each feature in its own folder)
├── network/        # Network operations (capture, sending, parsing)
├── ui/             # UI components (rendering, interactions)
└── search/         # Search functionality
```

## Adding a New Feature

### Step 1: Create Feature Folder

Create a new folder in `js/features/` for your feature:

```
js/features/your-feature/
├── index.js        # Main entry point (exports setup/init function)
└── ...             # Additional modules as needed
```

### Step 2: Follow the Pattern

Each feature should export an initialization function:

```javascript
// js/features/your-feature/index.js
export function setupYourFeature(elements) {
    // Initialize your feature here
    // elements object contains all DOM elements (from ui/main-ui.js)
    
    const yourButton = document.getElementById('your-button');
    if (yourButton) {
        yourButton.addEventListener('click', () => {
            // Your feature logic
        });
    }
}
```

### Step 3: Register in main.js

Add your feature to `js/main.js`:

```javascript
// Import your feature
import { setupYourFeature } from './features/your-feature/index.js';

// Initialize it (in DOMContentLoaded)
setupYourFeature(elements);
```

### Step 4: Use Core Utilities

- **State Management**: Import from `core/state.js`
  ```javascript
  import { state, addRequest } from '../core/state.js';
  ```

- **Events**: Use the event bus for decoupled communication
  ```javascript
  import { events, EVENT_NAMES } from '../core/events.js';
  events.emit(EVENT_NAMES.REQUEST_SELECTED, index);
  ```

- **Utilities**: Import from specific utility modules
  ```javascript
  import { formatBytes } from '../core/utils/format.js';
  import { escapeHtml } from '../core/utils/dom.js';
  import { getHostname } from '../core/utils/network.js';
  ```

## Example: Adding a "Export to HAR" Feature

1. **Create the feature folder**:
   ```
   js/features/export-har/
   └── index.js
   ```

2. **Implement the feature**:
   ```javascript
   // js/features/export-har/index.js
   import { state } from '../../core/state.js';
   
   export function setupExportHAR() {
       const exportBtn = document.getElementById('export-har-btn');
       if (exportBtn) {
           exportBtn.addEventListener('click', () => {
               const har = generateHAR(state.requests);
               downloadFile(har, 'requests.har');
           });
       }
   }
   ```

3. **Register in main.js**:
   ```javascript
   import { setupExportHAR } from './features/export-har/index.js';
   // ... in DOMContentLoaded
   setupExportHAR();
   ```

## Best Practices

1. **Keep features modular**: Each feature should be self-contained
2. **Use events for communication**: Avoid direct dependencies between features
3. **Follow naming conventions**: Use descriptive, consistent names
4. **Import from specific modules**: Don't create circular dependencies
5. **Update UI via events**: Emit events instead of directly manipulating DOM from other modules

## Using AI/LLM Assistance

AI can speed you up, but you’re responsible for the code you submit. Please:

1. **Understand the code**: Don’t paste blindly. Read and reason about every change.
2. **Keep diffs small**: Ask the LLM for focused snippets, not large rewrites.
3. **Check security & privacy**: No secrets in code; be mindful of optional permissions, data flow, and user prompts.
4. **Validate logic & side effects**: Ensure event wiring, state updates, and DOM changes make sense; avoid regressions.
5. **Respect licenses**: Don’t include code with incompatible licenses.
6. **Test what you touch**: Run or manually verify the affected paths when possible.

## Module Responsibilities

- **`core/state.js`**: Global application state
- **`core/events.js`**: Event bus for module communication
- **`core/utils/`**: Utility functions (format, dom, network, misc)
- **`ui/main-ui.js`**: DOM element references and UI orchestration
- **`network/`**: Request/response handling
- **`features/`**: Feature implementations

## Adding Kingfisher Rules

rep+ uses [Kingfisher](https://github.com/mongodb/kingfisher) rules for secret detection. These rules are stored locally in the `rules/` directory as YAML files.

### Step 1: Get the Rule from Kingfisher

1. Browse the [Kingfisher rules repository](https://github.com/mongodb/kingfisher/tree/main/data/rules)
2. Find the rule file you want to add (e.g., `aws.yaml`, `github.yaml`)
3. Copy the YAML content for the specific rule(s) you need

### Step 2: Add the Rule File

1. **Create or edit a YAML file** in the `rules/` directory:
   ```bash
   rules/your-service.yaml
   ```

2. **Add the rule structure**:
   ```yaml
   rules:
     - name: Your Service API Key
       id: kingfisher.yourservice.1
       pattern: |
         (?xi)
         \b
         (
           your-service-[A-Z0-9]{32,64}
         )
         \b
       pattern_requirements:
         min_digits: 2
         min_uppercase: 1
       min_entropy: 3.5
       confidence: medium
       examples:
         - your-service-ABC123XYZ789
   ```

3. **Update the manifest** (optional but recommended):
   - Edit `rules/_manifest.json` and add your new file to the `files` array:
   ```json
   {
     "files": [
       "slack.yaml",
       "aws.yaml",
       "yourservice.yaml"
     ]
   }
   ```
   - If `_manifest.json` doesn't exist, rules will be auto-discovered from common filenames

### Step 3: Rule Structure Reference

Kingfisher rules follow this structure:

```yaml
rules:
  - name: Human-readable name
    id: kingfisher.service.1  # Unique identifier
    pattern: |               # PCRE-compatible regex pattern
      (?xi)                  # Flags: x=extended, i=case-insensitive
      \b
      (your-pattern-here)
      \b
    pattern_requirements:    # Optional validation
      min_digits: 2
      min_uppercase: 1
      min_lowercase: 1
      min_special_chars: 1
      ignore_if_contains:    # Skip if contains these terms
        - "test"
        - "example"
    min_entropy: 3.5         # Minimum entropy threshold
    confidence: medium       # low, medium, or high
    examples:                # Example matches
      - example-secret-123
    validation:              # Optional HTTP validation
      type: Http
      content:
        request:
          headers:
            Authorization: Bearer {{ TOKEN }}
          method: POST
          url: https://api.example.com/validate
```

### Step 4: Test Your Rule

1. **Reload the extension** in Chrome (`chrome://extensions/` → Reload)
2. **Open DevTools** → rep+ tab → **Extractors** → **Secrets**
3. **Capture requests** that contain the secret type you're testing
4. **Click "Start Scan"** and verify your rule detects the secrets

### Step 5: PCRE to JavaScript Conversion

⚠️ **Important**: Kingfisher uses PCRE (Perl Compatible Regular Expressions), but JavaScript uses a different regex engine. The conversion handles:

- ✅ Inline flag groups: `(?i:...)` → converted to global flags
- ✅ Named groups: `(?P<name>...)` → `(?<name>...)`
- ✅ Extended mode: `(?x)` flag strips whitespace and comments
- ✅ Standalone flags: `(?i)`, `(?s)` in the middle of patterns

**If your rule fails to compile**, check:
- Balanced parentheses
- Valid character classes `[...]`
- Properly escaped special characters
- No unsupported PCRE features (e.g., variable-length lookbehind)

### Example: Adding a New Service

Let's say you want to add detection for "MyAPI" tokens:

1. **Create `rules/myapi.yaml`**:
   ```yaml
   rules:
     - name: MyAPI Token
       id: kingfisher.myapi.1
       pattern: |
         (?xi)
         \b
         (
           myapi_[A-Z0-9]{40}
         )
         \b
       pattern_requirements:
         min_digits: 2
         min_uppercase: 1
       min_entropy: 3.5
       confidence: medium
       examples:
         - myapi_ABC123XYZ789DEF456UVW012GHI345JKL678
   ```

2. **Add to `rules/_manifest.json`**:
   ```json
   {
     "files": [
       "slack.yaml",
       "aws.yaml",
       "myapi.yaml"
     ]
   }
   ```

3. **Test**: Reload extension → Capture a request with `myapi_...` token → Scan → Verify detection

### Resources

- [Kingfisher Project](https://github.com/mongodb/kingfisher) - Source of rule definitions
- [Kingfisher Rules Directory](https://github.com/mongodb/kingfisher/tree/main/data/rules) - Browse available rules
- [PCRE Documentation](https://www.pcre.org/original/doc/html/) - Regex pattern reference

## Need Help?

- Check existing features for examples (`features/ai/`, `features/bulk-replay/`)
- Review how events are used in `ui/request-list.js` and `ui/request-editor.js`
- Look at `main.js` to see how features are initialized
- Check existing rules in `rules/` directory for examples

Happy contributing! 🚀

