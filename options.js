document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['apiKey', 'maxWords'], (data) => {
        if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
        document.getElementById('maxWords').value = data.maxWords || 20;
    });
});

document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const maxWords = parseInt(document.getElementById('maxWords').value, 10) || 20;
    
    chrome.storage.sync.set({ apiKey, maxWords }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Saved successfully';
        setTimeout(() => status.textContent = '', 2000);
    });
});
