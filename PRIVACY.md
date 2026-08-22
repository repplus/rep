# Privacy Policy for rep+

**Last Updated**: August 22, 2026

## Overview

rep+ is a Chrome DevTools extension that helps developers and security researchers capture, modify, and replay HTTP requests. This privacy policy explains how we handle your data.

## Data Collection

### What We Collect

**We do NOT collect any personal data or browsing information.**

rep+ operates entirely locally in your browser. All data is stored locally using Chrome's `localStorage` API and is never transmitted to external servers (except as described below for AI features).

### Local Storage

The following data is stored locally on your device:

- **Captured HTTP Requests**: Stored in memory only, cleared when you close DevTools
- **User Preferences**: Theme preference, dismissed banners
- **AI API Keys** (Optional): If you choose to use AI features, your API keys are stored locally in `localStorage`
- **OpenCode Session Cleanup State**: Active rep+ OpenCode session identifiers and connection settings are held in Chrome local storage until cleanup succeeds so retries survive extension and browser restarts
- **Export Data**: Any exported request data is stored locally if you choose to save it

### What We DON'T Collect

- ❌ No browsing history
- ❌ No personal information
- ❌ No analytics or tracking
- ❌ No telemetry data
- ❌ No usage statistics
- ❌ No data sent to our servers

## Third-Party Services

### AI Features (Optional)

If you choose to use the AI-powered features (Request Explanation, Attack Vector Suggestions), rep+ uses third-party AI services:

- **Anthropic Claude API**: When you use Claude for explanations
- **Google Gemini API**: When you use Gemini for explanations
- **OpenAI Responses API**: When you use a Codex model. rep+ requests that OpenAI does not store the response by setting `store: false`.
- **OpenCode**: When you connect rep+ to a local OpenCode server. OpenCode may forward request/response data to the cloud or local model you select and temporarily stores active rep+ chat sessions in its local database.

**Important Notes:**
- You must provide your own API keys (stored locally in your browser)
- Your API keys are never shared with us
- Request/response data is sent directly to the AI provider you choose
- rep+ requests deletion of OpenCode sessions when their chat or request is cleared and retains retry state when deletion fails; cleanup is best-effort if the extension is uninstalled or its storage is cleared while OpenCode is unavailable
- OpenCode tools are disabled for rep+ sessions to prevent captured content from accessing your workspace or executing commands
- OpenCode may include project and global instruction files in model context; use the isolated launch guidance in the setup guide if those files may contain sensitive information
- We have no access to this data
- Please review Anthropic's, Google's, OpenAI's, and your configured OpenCode provider's privacy policies for how they handle your data

### Extension Permissions

rep+ uses a required local-storage permission and requests broader network permissions only when you explicitly enable features:

- **`storage`**: Required for durable OpenCode session-cleanup retries
- **`webRequest`**: Requested when you enable multi-tab capture
- **`<all_urls>`**: Requested when you enable multi-tab capture or replay requests outside the inspected origin; it also covers an approved loopback OpenCode origin
- **`https://api.openai.com/*`**: Requested when you configure the direct OpenAI Codex provider
- These permissions allow the extension to capture network requests from all tabs
- You can revoke these permissions at any time through Chrome's extension settings
- Without these permissions, rep+ only captures requests from the currently inspected tab

## Data Security

- All data is stored locally in your browser
- No data is transmitted to external servers (except AI API calls you initiate)
- API keys and OpenCode credentials are stored in extension localStorage as ordinary browser profile data
- Clearing browser storage or uninstalling the extension deletes extension-owned data; OpenCode or cloud AI providers may retain data according to their own storage and privacy policies

## Your Rights

- **Access**: All data is stored locally - you can access it through Chrome DevTools
- **Deletion**: Clear browser storage or uninstall the extension to delete extension-owned data, and use OpenCode/provider controls for data retained by those services
- **Control**: You control which permissions to grant and which features to use

## Changes to This Policy

We may update this privacy policy. The "Last Updated" date at the top indicates when changes were made.

## Contact

For questions about this privacy policy, please open an issue on [GitHub](https://github.com/bscript/rep/issues).

## Open Source

rep+ is open source. You can review the code to verify our privacy claims:
- [GitHub Repository](https://github.com/bscript/rep)
