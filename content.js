if (!document.getElementById('gemini-ext-styles')) {
    const style = document.createElement('style');
    style.id = 'gemini-ext-styles';
    style.textContent = `
        @keyframes geminiExtLoading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .pagination-btn { cursor: pointer; padding: 2px 6px; border: 1px solid #555; background: #333; color: #fff; border-radius: 4px; font-size: 11px; }
    `;
    document.head.appendChild(style);
}

let debounceTimer;
let scrollDebounceTimer;
let lastProcessedHash = null;
const chatSession = { history: [], currentIndex: -1 };

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return hash.toString();
}

function processChat() {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    const chatHistoryElem = document.getElementById('chat-history');
    if (!inputArea || !chatHistoryElem) return;

    // Throttle: Ensure user stopped scrolling
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const chatText = document.body.innerText.trim();
        if (chatText.length < 50) return;
        
        const currentHash = hashCode(chatText);
        if (currentHash === lastProcessedHash) return;

        chrome.storage.sync.get(['apiKey', 'selectedModel', 'maxWords'], async (items) => {
            if (!items.apiKey) return;
            lastProcessedHash = currentHash;
            
            const model = items.selectedModel || 'models/gemini-1.5-flash';
            document.getElementById('gemini-ext-loader').style.display = 'block';

            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${items.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: `Provide 4 follow-up questions (under ${items.maxWords} words each).\nContext:\n${chatText.slice(-3000)}` }] }] })
                });
                const data = await res.json();
                const queries = JSON.parse(data.candidates[0].content.parts[0].text.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']'));
                
                chatSession.history.push(queries);
                chatSession.currentIndex = chatSession.history.length - 1;
                document.getElementById('gemini-ext-loader').style.display = 'none';
                renderButtons(queries);
                updatePaginationUI();
            } catch (e) { document.getElementById('gemini-ext-loader').style.display = 'none'; }
        });
    }, 2000); // Settle down timer of 2 seconds
}

// Attach scroll listener for throttling
const observer = new MutationObserver(() => {
    const chatHistory = document.getElementById('chat-history');
    if (chatHistory && !chatHistory.dataset.listenerAdded) {
        chatHistory.dataset.listenerAdded = 'true';
        chatHistory.addEventListener('scroll', processChat);
    }
    processChat();
});

observer.observe(document.body, { childList: true, subtree: true });

function renderButtons(queries) {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    const buttonsDiv = document.getElementById('gemini-ext-buttons');
    if(!buttonsDiv) return;
    buttonsDiv.innerHTML = '';
    queries.forEach((q) => {
        const btn = document.createElement('button');
        btn.textContent = q;
        btn.style.cssText = 'padding: 10px 14px; border-radius: 20px; border: 1px solid #555; background: transparent; color: inherit; cursor: pointer; text-align: left; font-size: 13px; width: 100%;';
        btn.onclick = () => { inputArea.focus(); document.execCommand('insertText', false, q); };
        buttonsDiv.appendChild(btn);
    });
}

function updatePaginationUI() {
    const pag = document.getElementById('gemini-pagination');
    if (!pag) return;
    pag.innerHTML = `
        <button class="pagination-btn" id="prev-btn" ${chatSession.currentIndex <= 0 ? 'disabled' : ''}>&lt;</button>
        <span style="margin: 0 8px; font-size: 12px;">${chatSession.currentIndex + 1} / ${chatSession.history.length}</span>
        <button class="pagination-btn" id="next-btn" ${chatSession.currentIndex >= chatSession.history.length - 1 ? 'disabled' : ''}>&gt;</button>
    `;
    document.getElementById('prev-btn').onclick = () => { chatSession.currentIndex--; renderButtons(chatSession.history[chatSession.currentIndex]); updatePaginationUI(); };
    document.getElementById('next-btn').onclick = () => { chatSession.currentIndex++; renderButtons(chatSession.history[chatSession.currentIndex]); updatePaginationUI(); };
}
