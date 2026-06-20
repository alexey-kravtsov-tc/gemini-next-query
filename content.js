if (!document.getElementById('gemini-ext-styles')) {
    const style = document.createElement('style');
    style.id = 'gemini-ext-styles';
    style.textContent = `
        @keyframes geminiExtLoading {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
    `;
    document.head.appendChild(style);
}

let isInjecting = false;
let debounceTimer;
let lastProcessedHash = null;
let showLogs = false;
let lastUrl = location.href;
const predictionCache = {};

chrome.storage.sync.get(['showLogs'], (res) => {
    if (res.showLogs !== undefined) showLogs = res.showLogs;
});

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash.toString();
}

const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastProcessedHash = null;
        const container = document.getElementById('gemini-ext-container');
        if (container) container.remove();
    }

    if (isInjecting) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processChat, 2000);

    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    if (inputArea && !inputArea.dataset.extListenerAdded) {
        inputArea.dataset.extListenerAdded = 'true';
        inputArea.addEventListener('input', () => {
            const container = document.getElementById('gemini-ext-container');
            if (container) {
                const text = inputArea.innerText || inputArea.value || '';
                container.style.display = text.trim().length > 0 ? 'none' : 'block';
            }
        });
    }
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

function getOrCreateContainer(chatHistoryElem) {
    let container = document.getElementById('gemini-ext-container');
    if (!container) {
        isInjecting = true;
        container = document.createElement('div');
        container.id = 'gemini-ext-container';
        
        // Match width properties natively relative to the parent bounding constraints
        container.style.cssText = 'width: 100%; box-sizing: border-box; font-family: system-ui, sans-serif; position: relative; z-index: 10; margin-top: 16px; margin-bottom: 16px; padding: 0 4px;';

        const syncWidth = () => {
            if (chatHistoryElem) {
                container.style.width = chatHistoryElem.offsetWidth + 'px';
            }
        };
        
        syncWidth();
        const resizeObserver = new ResizeObserver(syncWidth);
        resizeObserver.observe(chatHistoryElem);

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: #888;';

        const title = document.createElement('div');
        title.textContent = 'Gemini Next Query';
        title.style.cssText = 'font-weight: 600; color: #e8eaed; font-size: 13px; letter-spacing: 0.3px;';

        const controls = document.createElement('div');
        controls.style.cssText = 'display: flex; gap: 16px; align-items: center;';

        const toggleLabel = document.createElement('label');
        toggleLabel.style.cssText = 'cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none;';
        toggleLabel.innerHTML = `<input type="checkbox" id="gemini-log-toggle" ${showLogs ? 'checked' : ''}> Logs`;
        toggleLabel.querySelector('input').addEventListener('change', (e) => {
            showLogs = e.target.checked;
            chrome.storage.sync.set({ showLogs });
            document.getElementById('gemini-ext-logs').style.display = showLogs ? 'block' : 'none';
        });

        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙️ Settings';
        settingsBtn.style.cssText = 'background: transparent; border: 1px solid rgba(128,128,128,0.5); color: inherit; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 11px; display: flex; align-items: center;';
        settingsBtn.onclick = (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({ action: 'openOptions' });
        };

        controls.appendChild(toggleLabel);
        controls.appendChild(settingsBtn);

        header.appendChild(title);
        header.appendChild(controls);

        const logs = document.createElement('div');
        logs.id = 'gemini-ext-logs';
        logs.style.cssText = `display: ${showLogs ? 'block' : 'none'}; max-height: 150px; overflow-y: auto; background: rgba(30,30,30,0.8); border: 1px solid rgba(128,128,128,0.2); border-radius: 8px; padding: 10px; margin-bottom: 12px; font-family: monospace; font-size: 11px; color: #a8c7fa; word-wrap: break-word;`;

        const loader = document.createElement('div');
        loader.id = 'gemini-ext-loader';
        loader.style.cssText = 'display: none; width: 100%; height: 2px; background: linear-gradient(90deg, transparent, rgba(138, 180, 248, 0.8), transparent); background-size: 200% 100%; animation: geminiExtLoading 1.5s infinite linear; border-radius: 2px; margin-bottom: 12px;';

        const buttons = document.createElement('div');
        buttons.id = 'gemini-ext-buttons';
        buttons.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%;';

        container.appendChild(header);
        container.appendChild(logs);
        container.appendChild(loader);
        container.appendChild(buttons);

        // Insert explicitly right below the chat-history element container boundary
        chatHistoryElem.insertAdjacentElement('afterend', container);
        isInjecting = false;
    }

    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    if (inputArea) {
        const text = inputArea.innerText || inputArea.value || '';
        container.style.display = text.trim().length > 0 ? 'none' : 'block';
    }

    return container;
}

function addLog(message, isError = false) {
    const logsDiv = document.getElementById('gemini-ext-logs');
    if (!logsDiv) return;
    const entry = document.createElement('div');
    entry.style.cssText = `margin-bottom: 4px; ${isError ? 'color: #ff6b6b; font-weight: bold;' : ''}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsDiv.appendChild(entry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

function toggleLoader(show) {
    const loader = document.getElementById('gemini-ext-loader');
    const buttonsDiv = document.getElementById('gemini-ext-buttons');
    if (loader) loader.style.display = show ? 'block' : 'none';
    if (buttonsDiv && show) buttonsDiv.innerHTML = '';
}

function renderButtons(queries, inputArea) {
    isInjecting = true;
    const buttonsDiv = document.getElementById('gemini-ext-buttons');
    buttonsDiv.innerHTML = '';
    
    queries.forEach((q, i) => {
        const btn = document.createElement('button');
        btn.textContent = q;
        btn.style.cssText = 'padding: 10px 14px; border-radius: 20px; border: 1px solid rgba(128,128,128,0.3); background: transparent; color: inherit; cursor: pointer; text-align: left; font-size: 13px; transition: background 0.2s; line-height: 1.4; width: 100%; box-sizing: border-box;';
        btn.onmouseover = () => btn.style.background = 'rgba(128,128,128,0.1)';
        btn.onmouseout = () => btn.style.background = 'transparent';
        
        btn.onclick = (e) => {
            e.preventDefault();
            addLog(`Action: Button ${i + 1} clicked.`);
            inputArea.focus();
            document.execCommand('selectAll', false, null);
            const success = document.execCommand('insertText', false, q);
            if (!success) {
                inputArea.textContent = q;
                inputArea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        buttonsDiv.appendChild(btn);
    });
    isInjecting = false;
}

async function processChat() {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    if (!inputArea) return;

    const isGenerating = document.querySelector('button[aria-label*="stop" i], button[aria-label*="Stop generating"]');
    if (isGenerating) return;

    const chatHistoryElem = document.getElementById('chat-history');
    if (!chatHistoryElem) return;

    let chatText = document.body.innerText || "";
    const containerElem = document.getElementById('gemini-ext-container');
    if (containerElem) {
        chatText = chatText.replace(containerElem.innerText, '');
    }
    chatText = chatText.trim();

    if (chatText.length < 50) return;

    const currentHash = hashCode(chatText);
    if (currentHash === lastProcessedHash) return;

    getOrCreateContainer(chatHistoryElem);
    
    if (predictionCache[currentHash]) {
        addLog(`--- Process Triggered ---`);
        addLog(`Cache hit for current context. Rendering saved predictions.`);
        lastProcessedHash = currentHash;
        toggleLoader(false);
        renderButtons(predictionCache[currentHash], inputArea);
        return;
    }

    addLog('--- Process Triggered ---');
    addLog(`Chat text length: ${chatText.length} | Hash: ${currentHash}`);

    chrome.storage.sync.get(['apiKey', 'maxWords'], async (items) => {
        if (!items.apiKey) {
            addLog('ERROR: Gemini API Key missing. Click Settings to configure.', true);
            toggleLoader(false);
            return;
        }

        lastProcessedHash = currentHash;
        addLog('Valid API Key found. Requesting 4 predictions from Gemini 3.1 Flash Lite...');
        toggleLoader(true);

        try {
            const maxWords = items.maxWords || 20;
            const prompt = `Based on the following chat context, provide exactly 4 distinct follow-up questions the user might ask next.\nReturn ONLY a valid JSON array of 4 strings. No markdown formatting, no introduction.\nEach question MUST be under ${maxWords} words.\n\nChat context:\n${chatText.slice(-3000)}`;

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${items.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            if (!res.ok) {
                const errorData = await res.text();
                throw new Error(`API returned ${res.status}: ${errorData}`);
            }

            const data = await res.json();
            const resultText = data.candidates[0].content.parts[0].text;
            addLog(`Raw response received. Length: ${resultText.length}`);
            
            const cleanJson = resultText.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']');
            const queries = JSON.parse(cleanJson);

            if (!Array.isArray(queries) || queries.length === 0) {
                throw new Error('Parsed response is not a valid JSON array.');
            }

            addLog(`Successfully parsed ${queries.length} queries. Saving to cache and rendering...`);
            predictionCache[currentHash] = queries;
            
            toggleLoader(false);
            renderButtons(queries, inputArea);

        } catch (e) {
            toggleLoader(false);
            addLog(`ERROR: ${e.message}`, true);
        }
    });
}
