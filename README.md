# Gemini Next Query

A Chrome/Arc browser extension that enhances your chat experience on `gemini.google.com` by predicting and suggesting the next possible questions you might want to ask.

## Features

- **Smart Predictions**: Automatically reads the latest messages in your active conversation and uses Gemini 3.1 Flash Lite via the Google AI Studio API to generate 4 contextually relevant, intelligent follow-up questions.
- **Seamless UI Integration**: Injects a non-intrusive, styled UI container directly below the chat history panel. It dynamically matches the width of the active conversation container using a `ResizeObserver`.
- **Keyboard Shortcuts**: Assign keys (defaulting to `1`, `2`, `3`, `4`) to the query buttons. Pressing a key once inserts the query into the text area. Double-tapping the key in quick succession (under 1 second) inserts the query and automatically submits it.
- **Session-Based Pagination**: Maintains a session-level history of predicted queries. Navigate back and forth using the pagination controls (`<` and `>`) in the header to review or reuse prior recommendations.
- **Smart Hashing & Caching**: Employs DOM text hashing (`hashCode`) to avoid redundant API queries for unchanged chat states, optimizing performance and API token usage when switching tabs or routing.
- **Option Panel Configuration**: Configure settings inside the extension options page:
  - Custom key bindings for triggers.
  - Maximum words limit per prediction.
  - Google Gemini API Key.
- **Integrated Debug Logger**: Includes a real-time console logger in the extension UI, toggleable via a checkbox, to audit status checkings, success messages, and raw API errors.

## Setup Instructions

1. Clone this repository or download the source code locally.
2. Open your browser's extensions management page (`chrome://extensions` or `arc://extensions`).
3. Toggle **Developer Mode** on.
4. Click **Load unpacked** and select this directory.
5. In any active Gemini tab (`gemini.google.com`), the extension interface will render automatically.
6. Click the **⚙️ Settings** button or toggle the "Logs" checkbox to inspect the console logs.
7. Obtain a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey) and paste it into the configuration panel.

## Directory Structure & Files

- `manifest.json`: Configuration manifest declaring Chrome Extension settings, content script matches, options page UI, and background workers (Manifest V3).
- `content.js`: Main execution script injected into `gemini.google.com`. Monitors mutations, computes page hashes, polls Gemini API endpoint, builds DOM elements, and processes user shortcuts.
- `background.js`: Minimal background service worker handles chrome messaging routing to open options page.
- `options.html` & `options.js`: Design/logic for configuring customized user preferences (API keys, max words, keybindings).

## Developer Guides & Unit Testing

The project is equipped with unit tests built on **Vitest** and **JSDOM** to verify critical regression endpoints.

### Run Tests Locally

Install project development dependencies:
```bash
npm install
```

Run the unit tests:
```bash
npm test
```

The tests cover:
- Hash generation logic (`hashCode`)
- Container element creation and layout validation (`getOrCreateContainer`)
- Button rendering, labeling, and event delegation (`renderButtons`)
- Pagination controls behavior and state transitions (`updatePaginationUI`)
- Toggle rules on input container visibility (`setupInputListener`)
- Settings load and save interactions on options panel (`options.js`)
