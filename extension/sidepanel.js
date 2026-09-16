const state = {
  items: [],
  settings: { budget: 500, currency: 'USD', bills: [], backendUrl: 'http://localhost:8787', sharedSecret: '' },
  chatMessages: [],
  purchaseNudge: null,
  sessionId: crypto.randomUUID(),
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of ['items', 'settings', 'chatMessages', 'purchaseNudge']) {
    if (changes[key]) state[key] = changes[key].newValue;
  }
  render();
});

async function init() {
  const saved = await chrome.storage.local.get(['items', 'settings', 'chatMessages', 'purchaseNudge']);
  Object.assign(state, saved);
  bindEvents();
  render();
}

function bindEvents() {
  $('letsTalk').addEventListener('click', openChat);
  $('closeChat').addEventListener('click', closeChat);
  $('chatForm').addEventListener('submit', sendChat);
  $('editBudget').addEventListener('click', openBudgetDialog);
  $('addBill').addEventListener('click', () => addBillRow());
  $('budgetForm').addEventListener('submit', saveBudgetDialog);
  $('dismissNudge').addEventListener('click', () => chrome.storage.local.set({ purchaseNudge: null }));
  $('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function render() {
  renderBudget();
  renderItems();
  renderNudge();
  renderChat();
}

function renderBudget() {
  const currency = state.settings?.currency || 'USD';
  const budget = Number(state.settings?.budget || 0);
  const sameCurrency = state.items.filter((item) => !item.currency || item.currency === currency);
  const bought = sameCurrency.filter((item) => item.status === 'bought');
  const considering = sameCurrency.filter((item) => item.status !== 'bought');
  const spent = sumItems(bought);
  const consideringTotal = sumItems(considering);
  const remaining = budget - spent;

  $('budgetValue').textContent = money(budget, currency);
  $('spentValue').textContent = money(spent, currency);
  $('remainingValue').textContent = money(remaining, currency);
  $('consideringValue').textContent = money(consideringTotal, currency);
  $('budgetProgress').style.width = `${Math.min(100, budget > 0 ? Math.max(0, spent / budget * 100) : 0)}%`;

  const omitted = state.items.filter((item) => item.currency && item.currency !== currency).length;
  $('currencyNote').textContent = omitted ? `${omitted} item${omitted === 1 ? '' : 's'} in another currency are kept in the list but left out of this total.` : '';
}

function renderItems() {
  const considering = state.items.filter((item) => item.status !== 'bought');
  const bought = state.items.filter((item) => item.status === 'bought');
  $('consideringCount').textContent = considering.length;
  $('boughtCount').textContent = bought.length;
  renderCardList($('consideringCards'), considering, false);
  renderCardList($('boughtCards'), bought, true);
}

function renderCardList(container, items, isBought) {
  container.textContent = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = isBought ? 'Nothing marked bought yet.' : 'Add something to a cart and it’ll appear here.';
    container.append(empty);
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'item-card';

    const media = item.image ? document.createElement('img') : document.createElement('div');
    media.className = `item-image${item.image ? '' : ' placeholder'}`;
    if (item.image) {
      media.src = item.image;
      media.alt = '';
      media.referrerPolicy = 'no-referrer';
      media.addEventListener('error', () => {
        const placeholder = document.createElement('div');
        placeholder.className = 'item-image placeholder';
        placeholder.textContent = '◌';
        media.replaceWith(placeholder);
      });
    } else {
      media.textContent = '◌';
    }

    const body = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'item-title';
    title.textContent = item.title || 'Shopping item';
    if (item.intent === 'buying' && !isBought) {
      const chip = document.createElement('span');
      chip.className = 'intent-chip';
      chip.textContent = 'buying now';
      title.append(chip);
    }

    const meta = document.createElement('p');
    meta.className = 'item-meta';
    meta.textContent = item.site || 'shopping site';

    const price = document.createElement('div');
    price.className = 'item-price';
    price.textContent = item.price == null ? 'Price not detected' : money(item.price, item.currency || state.settings.currency);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const toggle = document.createElement('button');
    toggle.textContent = isBought ? 'Move back' : 'Mark bought';
    toggle.addEventListener('click', () => updateItem(item.fingerprint, { status: isBought ? 'considering' : 'bought', intent: isBought ? 'considering' : 'bought' }));

    const visit = document.createElement('button');
    visit.className = 'quiet';
    visit.textContent = 'Open';
    visit.disabled = !item.url;
    visit.addEventListener('click', () => item.url && chrome.tabs.create({ url: item.url }));

    const remove = document.createElement('button');
    remove.className = 'quiet';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => removeItem(item.fingerprint));

    actions.append(toggle, visit, remove);
    body.append(title, meta, price, actions);
    card.append(media, body);
    container.append(card);
  }
}

function renderNudge() {
  const nudge = state.purchaseNudge;
  $('purchaseNudge').classList.toggle('hidden', !nudge);
  $('purchaseNudgeText').textContent = nudge?.text || '';
}

function openChat() {
  $('chatView').classList.add('open');
  $('chatView').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('chatInput').focus(), 220);
  scrollChat();
}

function closeChat() {
  $('chatView').classList.remove('open');
  $('chatView').setAttribute('aria-hidden', 'true');
}

function renderChat() {
  const log = $('chatLog');
  log.textContent = '';
  if (!state.chatMessages.length) {
    const intro = document.createElement('div');
    intro.className = 'message agent';
    intro.innerHTML = '<span class="speaker">Room</span>Ask about an item, your remaining budget, or the bills you entered. Both agents will answer from different angles.';
    log.append(intro);
  }

  for (const message of state.chatMessages.slice(-40)) {
    const node = document.createElement('div');
    node.className = `message ${message.role === 'user' ? 'user' : 'agent'}`;
    const speaker = document.createElement('span');
    speaker.className = 'speaker';
    speaker.textContent = message.role === 'user' ? 'You' : (message.agent || 'Agent');
    node.append(speaker, document.createTextNode(message.content));
    log.append(node);
  }
  scrollChat();
}

async function sendChat(event) {
  event.preventDefault();
  const input = $('chatInput');
  const content = input.value.trim();
  if (!content) return;

  input.value = '';
  const history = [...state.chatMessages, { role: 'user', content, at: Date.now() }].slice(-40);
  state.chatMessages = history;
  await chrome.storage.local.set({ chatMessages: history });
  setSending(true);

  try {
    const backendUrl = String(state.settings.backendUrl || 'http://localhost:8787').replace(/\/+$/, '');
    const response = await fetch(`${backendUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(state.settings.sharedSecret ? { 'x-cartside-secret': state.settings.sharedSecret } : {}),
      },
      body: JSON.stringify({
        sessionId: state.sessionId,
        messages: history.map(({ role, content: text }) => ({ role, content: text })),
        state: {
          items: state.items,
          settings: {
            budget: state.settings.budget,
            currency: state.settings.currency,
            bills: state.settings.bills || [],
          },
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Backend returned ${response.status}`);
    const replies = (data.replies || []).map((reply) => ({ role: 'assistant', agent: reply.agent, content: reply.content, at: Date.now() }));
    state.chatMessages = [...history, ...replies].slice(-40);
    await chrome.storage.local.set({ chatMessages: state.chatMessages });
  } catch (error) {
    state.chatMessages = [...history, { role: 'assistant', agent: 'Room', content: `I couldn't reach the budgeting agents: ${error.message}`, at: Date.now() }].slice(-40);
    await chrome.storage.local.set({ chatMessages: state.chatMessages });
  } finally {
    setSending(false);
  }
}

function setSending(sending) {
  $('sendChat').disabled = sending;
  $('chatInput').disabled = sending;
  $('sendChat').textContent = sending ? '…' : 'Send';
}

function openBudgetDialog() {
  $('budgetInput').value = Number(state.settings.budget || 0);
  $('currencyInput').value = state.settings.currency || 'USD';
  $('billRows').textContent = '';
  for (const bill of state.settings.bills || []) addBillRow(bill);
  $('budgetDialog').showModal();
}

function addBillRow(bill = {}) {
  const row = document.createElement('div');
  row.className = 'bill-row';
  row.innerHTML = `
    <input data-key="name" aria-label="Bill name" placeholder="Rent" value="${escapeAttr(bill.name || '')}">
    <input data-key="amount" aria-label="Bill amount" type="number" min="0" step="0.01" placeholder="0" value="${escapeAttr(bill.amount ?? '')}">
    <input data-key="dueDate" aria-label="Bill due date" type="date" value="${escapeAttr(bill.dueDate || '')}">
    <button type="button" aria-label="Remove bill">×</button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  $('billRows').append(row);
}

async function saveBudgetDialog(event) {
  event.preventDefault();
  const bills = [...$('billRows').querySelectorAll('.bill-row')].map((row) => ({
    name: row.querySelector('[data-key="name"]').value.trim(),
    amount: Number(row.querySelector('[data-key="amount"]').value || 0),
    dueDate: row.querySelector('[data-key="dueDate"]').value,
  })).filter((bill) => bill.name || bill.amount);

  const settings = {
    ...state.settings,
    budget: Math.max(0, Number($('budgetInput').value || 0)),
    currency: $('currencyInput').value,
    bills,
  };
  await chrome.storage.local.set({ settings });
  $('budgetDialog').close();
}

async function updateItem(fingerprint, patch) {
  const items = state.items.map((item) => item.fingerprint === fingerprint ? { ...item, ...patch, updatedAt: Date.now() } : item);
  await chrome.storage.local.set({ items });
}

async function removeItem(fingerprint) {
  await chrome.storage.local.set({ items: state.items.filter((item) => item.fingerprint !== fingerprint) });
}

function sumItems(items) {
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

function money(value, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function scrollChat() {
  requestAnimationFrame(() => {
    const log = $('chatLog');
    log.scrollTop = log.scrollHeight;
  });
}

function escapeAttr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
