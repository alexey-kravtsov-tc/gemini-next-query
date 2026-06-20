document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['apiKey', 'maxWords', 'selectedModel'], (data) => {
        if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
        if (data.maxWords) document.getElementById('maxWords').value = data.maxWords;
        if (data.selectedModel) {
            const select = document.getElementById('modelSelect');
            const opt = document.createElement('option');
            opt.value = data.selectedModel;
            opt.textContent = data.selectedModel;
            select.appendChild(opt);
            select.value = data.selectedModel;
        }
    });
});

async function testApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const status = document.getElementById('status');
    const select = document.getElementById('modelSelect');
    
    if (!apiKey) {
        status.textContent = 'Please enter an API Key';
        return;
    }

    try {
        status.textContent = 'Testing...';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) throw new Error('Invalid API Key');
        
        const data = await response.json();
        const models = data.models.filter(m => m.supportedMethodNames.includes('generateContent'));
        
        select.innerHTML = '';
        let targetModel = models[models.length - 1].name; // Default to last
        
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            select.appendChild(opt);
            if (m.name.toLowerCase().includes('lite')) targetModel = m.name;
        });
        
        select.value = targetModel;
        chrome.storage.sync.set({ apiKey, selectedModel: targetModel });
        status.textContent = 'Success! Models updated.';
    } catch (e) {
        status.textContent = 'Error: ' + e.message;
    }
}

document.getElementById('testApiKey').addEventListener('click', testApiKey);

document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const maxWords = parseInt(document.getElementById('maxWords').value, 10) || 20;
    const selectedModel = document.getElementById('modelSelect').value;
    
    chrome.storage.sync.set({ apiKey, maxWords, selectedModel }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Saved successfully';
        setTimeout(() => status.textContent = '', 2000);
    });
});
