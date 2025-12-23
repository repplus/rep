<p align="center">
  <!-- Chrome Supported -->
  <img src="https://img.shields.io/badge/Chrome-Supported-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Supported">

  <!-- AppSec Tool -->
  <img src="https://img.shields.io/badge/AppSec-Tool-blueviolet" alt="AppSec Tool">

  <!-- Bug Bounty Friendly -->
  <img src="https://img.shields.io/badge/Bug%20Bounty-Friendly-orange" alt="Bug Bounty Friendly">

  <!-- Stars -->
  <a href="https://github.com/bscript/rep/stargazers">
    <img src="https://img.shields.io/github/stars/bscript/rep?style=social" alt="GitHub Stars">
  </a>

   <!-- Discord -->
  <a href="https://github.com/repplus">
        <img src="https://img.shields.io/discord/1442955541293961429.svg?label=&logo=discord&logoColor=ffffff&color=7389D8&labelColor=6A7EC2" alt="Discord">
  </a>

  <!-- Sponsor -->
  <a href="https://github.com/sponsors/bscript">
    <img src="https://img.shields.io/badge/Sponsor-%F0%9F%92%96-ea4aaa?style=flat-square" alt="Sponsor">
  </a>
</p>

# rep+

rep+ is a lightweight Chrome DevTools extension inspired by Burp Suite's Repeater, now supercharged with AI. I often need to poke at a few requests without spinning up the full Burp stack, so I built this extension to keep my workflow fast, focused, and intelligent with integrated LLM support.

<img width="1661" height="985" alt="Screenshot 2025-11-27 at 18 07 32" src="https://github.com/user-attachments/assets/3e529124-ab0c-4f8f-9e70-d10b2ce29c9e" />


[![Watch Demo](https://img.shields.io/badge/Demo-Video-red?style=for-the-badge&logo=youtube)](https://video.twimg.com/amplify_video/1992382891196571648/pl/zE5-oOXgVua1ZBQn.m3u8?tag=14)

## 🚀 Install rep+ Chrome Extension  
[![rep+](https://img.shields.io/badge/rep%2B%20Chrome%20Extension-Install%20Now-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/rep+/dhildnnjbegaggknfkagdpnballiepfm)


## Table of Contents
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Permissions & Privacy](#permissions--privacy)
- [Limitations](#-limitations)
- [Star History](#star-history)
- [Found a Bug or Issue?](#found-a-bug-or-issue)
- [❤️ Support the Project](#️-support-the-project)

## Features

### Capture & Replay
- No proxy setup; works directly in Chrome (no CA certs needed).
- Capture every HTTP request and replay with modified method, headers, or body.
- Multi-tab capture (optional permission) with visual indicators 🌍 and deduplication.
- Clear workspace quickly; export/import requests as JSON for sharing or later reuse.

### Organization & Filtering
- Hierarchical grouping by page and domain (first-party prioritized).
- Third-party detection and collapsible groups; domain badges for quick context.
- Starring for requests, pages, and domains (auto-star for new matches).
- Timeline view (flat, chronological) to see what loaded before a request.
- Filters: method, domain, color tags, text search, regex mode.

### Views & Editing
- Pretty / Raw / Hex views; layout toggle (horizontal/vertical).
- Converters: Base64, URL encode/decode, JWT decode, Hex/UTF-8.
- History, undo/redo, and syntax highlighting for requests/responses.
- Context menu helpers on the request editor:
  - Convert selected text (Base64, URL encode/decode, JWT decode).
  - **Copy as** full HTTP request in multiple languages: `curl`, PowerShell (`Invoke-WebRequest`), Python (`requests`), and JavaScript `fetch`.
- Screenshot editor for request/response pairs: full-content capture, side‑by‑side or stacked layout, zoom, highlight and black-box redaction, resizable/movable annotations, keyboard delete, and undo/redo for all edits.

### Bulk & Automation
- Bulk replay with 4 attack modes: Sniper, Battering Ram, Pitchfork, Cluster Bomb.
- Mark positions with `§`, configure payloads, pause/resume long runs.
- Response diff view to spot changes between baseline and attempts.

### Extractors & Search
- Unified Extractor: secrets, endpoints, and parameters from captured JS.
- **Secret Scanner**: entropy + patterns with confidence scores; pagination and domain filter.
  - Powered by [Kingfisher](https://github.com/mongodb/kingfisher) rules for comprehensive secret detection
  - Supports AWS, GitHub, Google, Slack, Stripe, Twilio, Azure, and many more service providers
  - Rules stored locally in `rules/` directory for offline use
  - **Note**: Secret scanning only analyzes JavaScript files from the **current inspected tab**.
  - **Export**: Export all secrets to CSV for analysis and reporting
- **Endpoint Extractor**: full URLs, relative paths, GraphQL; method detection; one-click copy (rebuilds base URL).
  - **Export**: Export all endpoints to CSV with method, endpoint path, confidence, and source file
- **Parameter Extractor**: passive JavaScript parameter discovery with intelligent grouping and risk assessment.
  - **Parameter Types**: Extracts query, body, header, and path parameters from JavaScript files
  - **Grouped by Endpoint**: Parameters are organized by endpoint with expandable/collapsible groups
  - **Risk Classification**: Automatically identifies high-risk parameters (auth, admin, debug flags, IDOR, feature flags)
  - **Confidence Scoring**: Stricter confidence model than endpoints to reduce false positives
  - **Smart Filtering**: Suppresses common false positives (webpack, React, jQuery, DOM events, telemetry)
  - **Copy as cURL**: One-click copy generates curl commands with all parameters properly formatted
  - **Location Badges**: Visual indicators for parameter location (query/body/header/path)
  - **Domain Filtering**: Filter parameters by source domain with accurate counts
  - **Column Sorting**: Sort by parameter name, location, endpoint, method, risk level, or confidence
  - **Export Options**:
    - **CSV Export**: Export all parameters with location, endpoint, method, risk level, and confidence
    - **Postman Collection Export**: Generate ready-to-import Postman collection JSON with all endpoints and parameters
      - Automatically groups parameters by endpoint
      - Includes query, body, and header parameters
      - Uses Postman variable syntax (`{{paramName}}`) for easy testing
      - Perfect for security testers who want to quickly import discovered APIs into Postman
- **Response Search**: regex support, match preview, pagination, domain filter.

### AI Assistance
- Explain Request (Claude/Gemini) with streaming responses.
- Suggest Attack Vectors: request + response analysis; auto-send if no response; payload suggestions; reflections/errors/multi-step chains; fallback to request-only with warning.
- Context menu “Explain with AI” for selected text.
- Attack Surface Analysis per domain: categorization (Auth/Payments/Admin/etc.), color-coded icons, toggle between list and attack-surface view.
- Multi-provider support (Claude/Gemini).
- Export AI outputs as Markdown or PDF to save RPD/TPM.

### Productivity & Theming
- Light/dark theme with smooth transitions.
- Request color tags and filters.
- Syntax highlighting for JSON/XML/HTML.

## Quick Start
1) Open Chrome DevTools → “rep+” tab.  
2) Browse: requests auto-capture.  
3) Click a request: see raw request/response immediately.  
4) Edit and “Send” to replay; use AI buttons for explain/attack suggestions.  
5) Use timeline, filters, and bulk replay for deeper testing.

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/bscript/rep.git
   ```
2. **Open Chrome Extensions**:
   - Navigate to `chrome://extensions/` in your browser.
   - Enable **Developer mode** (toggle in the top right corner).
3. **Load the Extension**:
   - Click **Load unpacked**.
   - Select the `rep` folder you just cloned.
4. **Open DevTools**:
   - Press `F12` or right-click -> Inspect.
   - Look for the **rep+** tab (you might need to click the `>>` overflow menu).

This combo makes rep+ handy for bug bounty hunters and vulnerability researchers who want Burp-like iteration without the heavyweight UI. Install the extension, open DevTools, head to the rep+ panel, and start hacking. 😎

### Local Model (Ollama) Setup
If you use a local model (e.g., Ollama) you must allow Chrome extensions to call it, otherwise you’ll see 403/CORS errors.

1. Stop any running Ollama instance.
2. Start Ollama with CORS enabled (pick one):
   - Allow only Chrome extensions:
     ```bash
     OLLAMA_ORIGINS="chrome-extension://*" ollama serve
     ```
   - Allow everything (easier for local dev):
     ```bash
     OLLAMA_ORIGINS="*" ollama serve
     ```
3. Verify your model exists (e.g., `gemma3:4b`) with `ollama list`.
4. Reload the extension and try again. If you still see 403, check Ollama logs for details.


## Permissions & Privacy
- **Optional**: `webRequest` + `<all_urls>` only when you enable multi-tab capture.  
- **Data**: Stored locally; no tracking/analytics.  
- **AI**: Your API keys stay local; request/response content is sent only to the provider you choose (Claude/Gemini) when you invoke AI features.


## ⚠️ Limitations

rep+ runs inside Chrome DevTools, so:

- No raw HTTP/1 or malformed requests (fetch() limitation)
- Some headers can’t be overridden (browser sandbox)
- No raw TCP sockets (no smuggling/pipelining tests)
- DevTools panel constraints limit certain UI setups

rep+ is best for quick testing, replaying, and experimenting — not full low-level HTTP work.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=bscript/rep&type=date&legend=top-left)](https://www.star-history.com/#bscript/rep&type=date&legend=top-left)

## Found a Bug or Issue?

If you encounter any bugs, unexpected behavior, or have feature requests, please help me improve **rep+** by [opening an issue here](https://github.com/bscript/rep/issues).  
I’ll do my best to address it as quickly as possible! 🙏

## ❤️ Support the Project

I maintain **rep+** alone, in my free time.  
Sponsorship helps me keep improving the extension, adding new features, and responding to issues quickly.

If **rep+ saved you time** during testing, development, or bug bounty work, please consider supporting the project.  
**Every dollar helps. ❤️**

## Contributors 🤝

<a href="https://github.com/bscript/rep/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=bscript/rep" alt="Contributors" />
</a>

---

<h3 align="center">Sponsors</h3>
<p align="center">
  <a href="https://github.com/projectdiscovery">
    <img src="https://avatars.githubusercontent.com/u/50994705?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/Snownin9">
    <img src="https://avatars.githubusercontent.com/u/218675317?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/exxoticx">
    <img src="https://avatars.githubusercontent.com/u/50809037?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/eduquintanilha">
    <img src="https://avatars.githubusercontent.com/u/14018253?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
  &nbsp;&nbsp;
   <a href="https://github.com/Snownull">
    <img src="https://avatars.githubusercontent.com/u/190537179?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
   &nbsp;&nbsp;
   <a href="https://github.com/assem-ch">
    <img src="https://avatars.githubusercontent.com/u/315228?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
   &nbsp;&nbsp;
   <a href="https://github.com/MrTurvey">
    <img src="https://avatars.githubusercontent.com/u/5578593?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
   &nbsp;&nbsp;
   <a href="https://github.com/greenat92">
    <img src="https://avatars.githubusercontent.com/u/8342706?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
   &nbsp;&nbsp;
   <a href="https://github.com/tixxdz">
    <img src="https://avatars.githubusercontent.com/u/1549291?s=60" width="60" style="border-radius:50%;" alt="Sponsor"/>
  </a>
</p>

<p align="center">
  <a href="https://github.com/sponsors/bscript">
    <img src="https://img.shields.io/badge/Become%20a%20Sponsor-%F0%9F%92%96-ea4aaa?style=for-the-badge" alt="Become a Sponsor"/>
  </a>
  <a href="https://github.com/user-attachments/assets/8e6933b5-8579-480b-99cf-161a392b4153">
    <img src="https://img.shields.io/badge/Bitcoin%20Sponsor-₿-f7931a?style=for-the-badge&logo=bitcoin&logoColor=white" alt="Bitcoin Sponsor"/>
  </a>
</p>
