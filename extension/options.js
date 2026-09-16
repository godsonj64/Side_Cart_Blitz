const backendUrl = document.getElementById('backendUrl');
const sharedSecret = document.getElementById('sharedSecret');
const status = document.getElementById('status');

document.addEventListener('DOMContentLoaded', load);
document.getElementById('optionsForm').addEventListener('submit', save);
document.getElementById('testConnection').addEventListener('click', testConnection);

async function load() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  backendUrl.value = settings.backendUrl || 'http://localhost:8787';
  sharedSecret.value = settings.sharedSecret || '';
}

async function save(event) {
  event.preventDefault();
  const { settings = {} } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({
    settings: {
      ...settings,
      backendUrl: backendUrl.value.trim().replace(/\/+$/, ''),
      sharedSecret: sharedSecret.value,
    },
  });
  showStatus('Saved.');
}

async function testConnection() {
  showStatus('Testing…');
  try {
    const url = backendUrl.value.trim().replace(/\/+$/, '');
    const response = await fetch(`${url}/health`, {
      headers: sharedSecret.value ? { 'x-cartside-secret': sharedSecret.value } : {},
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    showStatus(`Connected. OpenRouter key: ${data.openRouterConfigured ? 'configured' : 'missing'}. Model: ${data.model}.`);
  } catch (error) {
    showStatus(`Connection failed: ${error.message}`);
  }
}

function showStatus(text) {
  status.textContent = text;
}
