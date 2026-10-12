const STORAGE_KEY = 'shopify-wishlist';
const OWNER_KEY = 'shopify-wishlist-customer';
const UPDATE_EVENT = 'shopify-wishlist:updated';
const MAX_ITEMS = 250;
const config = window.ShopifyWishlistConfig || {};
const memory = { items: [] };
const cardCache = new Map();
const gridRevisions = new WeakMap();

const validHandle = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value);
const normalize = (items) => [...new Set((Array.isArray(items) ? items : []).filter(validHandle))].slice(0, MAX_ITEMS);

function read() {
  try { memory.items = normalize((localStorage.getItem(STORAGE_KEY) || '').split(',')); } catch { /* Keep the in-memory fallback. */ }
  return [...memory.items];
}

function write(items, source) {
  const next = normalize(items);
  memory.items = next;
  try { if (next.length) localStorage.setItem(STORAGE_KEY, next.join(',')); else localStorage.removeItem(STORAGE_KEY); } catch { announce(config.strings?.storageError); }
  document.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: { wishlist: next, source } }));
}

function announce(message) {
  if (!message) return;
  document.querySelectorAll('[data-wishlist-status]').forEach((node) => { node.textContent = message; });
}

function syncUi() {
  const saved = new Set(read());
  document.querySelectorAll('[data-wishlist-button]').forEach((button) => {
    const active = saved.has(button.dataset.productHandle);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `${active ? config.strings?.remove : config.strings?.add} ${button.dataset.productTitle || config.strings?.product}`);
    const label = button.querySelector('[data-wishlist-label]');
    if (label) label.textContent = active ? config.strings?.saved : config.strings?.save;
  });
  document.querySelectorAll('[data-wishlist-count]').forEach((badge) => { badge.textContent = String(saved.size); badge.hidden = !config.showCount || saved.size === 0; });
}

async function requestCard(handle) {
  const root = window.Shopify?.routes?.root || '/';
  const response = await fetch(`${root}products/${encodeURIComponent(handle)}?view=wishlist-card`, { credentials: 'same-origin' });
  if (!response.ok) return null;
  const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
  const card = parsed.querySelector('[data-wishlist-card]');
  return card?.dataset.productHandle === handle ? card : null;
}

async function fetchCard(handle) {
  if (!cardCache.has(handle)) cardCache.set(handle, requestCard(handle));
  const card = await cardCache.get(handle).catch(() => null);
  if (!card) cardCache.delete(handle);
  return card?.cloneNode(true) || null;
}

async function renderGrid(section) {
  const grid = section.querySelector('[data-wishlist-grid]');
  if (!grid) return;
  const revision = (gridRevisions.get(grid) || 0) + 1;
  gridRevisions.set(grid, revision);
  const handles = read();
  grid.setAttribute('aria-busy', 'true');
  const cards = await Promise.all(handles.map(fetchCard));
  if (!section.isConnected || gridRevisions.get(grid) !== revision) return;
  const availableCards = cards.filter(Boolean);
  grid.replaceChildren(...availableCards);
  grid.removeAttribute('aria-busy');
  section.querySelector('[data-wishlist-empty]')?.toggleAttribute('hidden', availableCards.length > 0);
  const addAll = section.querySelector('[data-wishlist-add-all]');
  if (addAll) addAll.hidden = availableCards.length === 0;
  syncUi();
  if (handles.length && !availableCards.length) announce(config.strings?.unavailable);
}

async function addAll(button) {
  const section = button.closest('[data-wishlist-section]');
  if (!section || button.disabled) return;
  const items = [...section.querySelectorAll('[data-wishlist-card]')].filter((card) => card.dataset.productAvailable === 'true').map((card) => ({ id: Number(card.dataset.variantId), quantity: 1 })).filter((item) => Number.isSafeInteger(item.id) && item.id > 0);
  if (!items.length) { announce(config.strings?.noneAvailable); return; }
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const root = window.Shopify?.routes?.root || '/';
    const response = await fetch(`${root}cart/add.js`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items }) });
    if (!response.ok) throw new Error(config.strings?.cartError);
    window.location.assign(window.Shopify?.routes?.cart_url || `${root}cart`);
  } catch (error) {
    announce(error.message || config.strings?.cartError);
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
  }
}

function init() { syncUi(); document.querySelectorAll('[data-wishlist-section]').forEach(renderGrid); }

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('[data-wishlist-button]') : null;
  if (button) {
    event.preventDefault(); event.stopPropagation();
    const handle = button.dataset.productHandle;
    if (!validHandle(handle)) return;
    const items = read();
    const active = items.includes(handle);
    write(active ? items.filter((item) => item !== handle) : [...items, handle]);
    announce(`${button.dataset.productTitle || config.strings?.product} ${active ? config.strings?.removed : config.strings?.added}`);
    return;
  }
  const addAllButton = event.target instanceof Element ? event.target.closest('[data-wishlist-add-all]') : null;
  if (addAllButton instanceof HTMLButtonElement) addAll(addAllButton);
});
document.addEventListener(UPDATE_EVENT, init);
document.addEventListener('shopify:section:load', init);
window.addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) init(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();

if (!config.customerId) {
  try {
    if (localStorage.getItem(OWNER_KEY)) {
      localStorage.removeItem(OWNER_KEY);
      write([], 'logout');
    }
  } catch { /* Storage is optional. */ }
}

if (config.syncEnabled && config.customerId && config.endpoint) {
  let revision = null;
  let baseline = [];
  let timer;
  let syncing = false;
  const customerId = String(config.customerId);
  const request = async (method, body) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(config.endpoint, { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error?.message || 'Wishlist synchronization failed.'), { status: response.status, code: data.error?.code, data });
      return data;
    } finally { clearTimeout(timeout); }
  };
  const persist = async (attempt = 0) => {
    if (syncing) return;
    syncing = true;
    let retry = false;
    try {
      const data = await request('POST', { wishlist: read(), revision });
      baseline = normalize(data.wishlist);
      revision = typeof data.revision === 'string' ? data.revision : null;
    } catch (error) {
      if (error.code === 'WISHLIST_CONFLICT' && Array.isArray(error.data?.wishlist)) {
        const remote = normalize(error.data.wishlist);
        const local = read();
        const removed = baseline.filter((item) => !local.includes(item));
        write(normalize([...remote.filter((item) => !removed.includes(item)), ...local]), 'sync-conflict');
        revision = typeof error.data.revision === 'string' ? error.data.revision : null;
        retry = attempt < 1;
      } else if ((!error.status || error.status === 429 || error.status >= 500) && attempt < 3) {
        retry = true;
      }
    } finally {
      syncing = false;
      if (retry) setTimeout(() => persist(attempt + 1), [1000, 3000, 10000][attempt]);
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(persist, 600); };
  document.addEventListener(UPDATE_EVENT, (event) => { if (!event.detail?.source) schedule(); });
  (async () => {
    try {
      const previousOwner = localStorage.getItem(OWNER_KEY);
      if (previousOwner && previousOwner !== customerId) write([], 'customer-change');
      const data = await request('GET');
      if (!data.authenticated) return;
      baseline = normalize(data.wishlist);
      revision = typeof data.revision === 'string' ? data.revision : null;
      localStorage.setItem(OWNER_KEY, customerId);
      const merged = normalize([...read(), ...baseline]);
      write(merged, 'initial-sync');
      if (merged.join(',') !== baseline.join(',')) schedule();
    } catch { /* Browser-local wishlist remains available. */ }
  })();
}
