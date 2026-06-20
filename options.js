document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['apiKey', 'maxWords', 'k1', 'k2', 'k3', 'k4'], (data) => {
        document.getElementById('apiKey').value = data.apiKey || '';
        document.getElementById('maxWords').value = data.maxWords || 20;
        document.getElementById('k1').value = data.k1 || '1';
        document.getElementById('k2').value = data.k2 || '2';
        document.getElementById('k3').value = data.k3 || '3';
        document.getElementById('k4').value = data.k4 || '4';
    });
});

document.getElementById('saveBtn').addEventListener('click', () => {
    chrome.storage.sync.set({
        apiKey: document.getElementById('apiKey').value.trim(),
        maxWords: parseInt(document.getElementById('maxWords').value, 10),
        k1: document.getElementById('k1').value || '1',
        k2: document.getElementById('k2').value || '2',
        k3: document.getElementById('k3').value || '3',
        k4: document.getElementById('k4').value || '4'
    }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Saved successfully';
        setTimeout(() => status.textContent = '', 2000);
    });
});
