# Gemini Next Query

A Chrome/Arc browser extension that enhances your chat experience on `gemini.google.com` by predicting and suggesting the next possible questions you might want to ask.

## Features

- **Smart Predictions**: Analyzes the active conversation and uses Gemini 3.1 Flash Lite to generate 4 contextually relevant follow-up questions.
- **Seamless UI Integration**: Injects a non-intrusive UI container perfectly matched to the width of your chat history, separate from the text input field.
- **One-Click Insert**: Click any suggested query to instantly populate your chat input box automatically without immediately sending it, allowing you to edit or append context.
- **Efficiency**: Built-in hashing and caching prevents redundant API calls for identical chat states, even when switching between tabs.
- **Customizable**: Set the maximum word count for each generated prediction via the extension settings.
- **Transparency**: Includes an integrated debug log viewer directly in the UI.

## Setup Instructions

1. Clone this repository or download the source code locally.
2. Open your browser's extensions page (`arc://extensions` or `chrome://extensions`).
3. Toggle **Developer Mode** on.
4. Click **Load unpacked** and select the extension directory.
5. In any active Gemini tab (`gemini.google.com`), the extension interface will render.
6. Click the **⚙️ Settings** button or click on the "API Key Required" warning.
7. Obtain a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey) and paste it into the configuration panel.

## Architecture & Logic

- Built purely with Vanilla JavaScript (`content.js`, `background.js`) and Manifest V3.
- Tracks structural changes in Gemini DOM via `MutationObserver` to maintain insertion logic upon route changes.
- Syncs sizing parameters using `ResizeObserver` bound to `#chat-history`.
- Communicates directly with the `generativelanguage.googleapis.com` REST endpoint.
