/* Production core: shared Apps Script API, persistent offline outbox, route data cache and responsive shell. */
(function () {
  'use strict';
  const APP = window.APP = { PAGES: {}, state: { tab: {}, range: {} }, S: null, token: localStorage.getItem('ane_token'), route: 'dashboard', readCache: {}, isOffline: !navigator.onLine, syncing: false };
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Math.round(n).toLocaleString('en-US');
  const usd = c => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const slsh = n => num(n) + ' SLSH';
  const TZ = 'Africa/Mogadishu';
  const dt = iso => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const dday = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const dkey = k => k ? new Date(k + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    pos: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    sales: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2z"/><path d="M8 8h8M8 12h8"/>',
    inventory: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    branches: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    customers: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    purchasing: '<path d="M1 3h13v13H1zM14 8h5l3 3v5h-8z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
    finance: '<path d="M3 7a2 2 0 0 1 2-2h14v4"/><path d="M3 7v11a2 2 0 0 0 2 2h16v-5"/><path d="M21 9h-4a2 2 0 0 0 0 4h4z"/>',
    reports: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
    insights: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
    staff: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    audit: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'
  };
  const ic = n => `<svg class="svg" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const badge = (t, c) => `<span class="badge ${c || ''}">${esc(t)}</span>`;
  const kpi = (v, l, c, s) => `<div class="card kpi ${c || ''}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  const table = (heads, rows, empty) => `<div class="tablewrap"><table><thead><tr>${heads.map(h => `<th class="${h[1] || ''}">${h[0]}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${heads.length}" class="empty">${empty || 'Nothing to show yet.'}</td></tr>`}</tbody></table></div>`;
  const tabs = (page, list, def) => { const cur = APP.state.tab[page] || def || list[0][0]; return `<div class="tabs">${list.map(t => `<button data-tab="${t[0]}" data-page="${page}" class="${t[0] === cur ? 'on' : ''}">${t[1]}</button>`).join('')}</div>`; };
  const curTab = (page, list) => APP.state.tab[page] || list[0][0];
  /* ---- storage ---- */
  const IDB = {
    open() { return new Promise((res, rej) => { const r = indexedDB.open('ane-production-v03', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async get(k) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async set(k, v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
    async del(k) { const d = await this.open(); return new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; }); }
  };
  const DEVICE = localStorage.ane_device || (localStorage.ane_device = 'DEV-' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14)).toUpperCase());
  const API_URL = window.ANE_CONFIG && window.ANE_CONFIG.API_URL;
  const QUEUEABLE = new Set([
    'sales.create', 'sales.reverse', 'payments.recordRepayment', 'payments.reverse',
    'branch.collect', 'branch.directSale', 'branch.setItemStatus', 'branch.inspectReturn', 'branch.approveReturn', 'branch.reviewOverdue',
    'stock.adjust', 'products.create', 'products.update', 'products.setPrice', 'products.setStatus',
    'customers.create', 'customers.update', 'customers.setCredit',
    'suppliers.save', 'po.create', 'po.update', 'po.setStatus', 'po.pay', 'po.receive', 'po.approveReceipt', 'po.rejectReceipt',
    'expenses.create', 'expenses.reverse', 'expenses.addCategory', 'recon.generate', 'recon.pay',
    'branches.update', 'people.save', 'settings.update'
  ]);
  const RATE_ACTIONS = new Set(['sales.create', 'branch.directSale', 'payments.recordRepayment', 'expenses.create', 'recon.pay', 'po.pay', 'branch.setItemStatus', 'branch.reviewOverdue']);
  const clone = x => JSON.parse(JSON.stringify(x == null ? {} : x));
  const txnId = () => 'TXN-' + DEVICE + '-' + Date.now().toString(36) + '-' + (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
  const readKey = (a, p) => a + ':' + JSON.stringify(p || {});
  function makeError(code, message) { const e = new Error(message || code || 'Request failed'); e.code = code || 'NETWORK_ERROR'; return e; }
  /* ---- network: one request at a time (the server handles one at a time anyway), automatic retry when the server was only busy,
     a progress bar while anything is loading, and a calm notice if the server is slow. ---- */
  let chain = Promise.resolve(), inflight = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function barOn(on) { let b = document.getElementById('bar'); if (!b) { b = document.createElement('div'); b.id = 'bar'; document.body.appendChild(b); } b.className = on ? 'on' : ''; }
  const idempotent = (a, txn) => !!txn || /\.(list|get|statement|movements|run|ask)$|^data\.|^dashboard\.|^batch$|^auth\.(login|me)$/.test(a);
  async function once(action, payload, txn) {
    if (!API_URL) throw makeError('CONFIG_ERROR', 'The API address is not configured.');
    let response;
    try {
      response = await fetch(API_URL, { method: 'POST', mode: 'cors', redirect: 'follow', cache: 'no-store', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: APP.token || '', payload: payload || {}, client_txn_id: txn || undefined, device_id: DEVICE }) });
    } catch (e) { e.code = 'NETWORK_ERROR'; throw e; }
    let result;
    try { result = await response.json(); } catch (e) { throw makeError('NETWORK_ERROR', 'The server did not return a valid response. Check your connection and retry.'); }
    if (!response.ok && (!result || result.ok !== false)) throw makeError('NETWORK_ERROR', 'The server is temporarily unavailable.');
    return result;
  }
  async function rawCall(action, payload, txn) {
    inflight++; barOn(true); const slow = setTimeout(() => toast('Still working… the server is slow right now. Please wait, do not tap again.', 'warn'), 7000);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await once(action, payload, txn);
          if (r && r.ok === false && r.error && r.error.code === 'LOCKED_RETRY' && attempt < 2) { await sleep(900 * (attempt + 1)); continue; }   /* nothing ran: safe to retry */
          return r;
        } catch (e) {
          if (e.code === 'NETWORK_ERROR' && navigator.onLine && attempt < 1 && idempotent(action, txn)) { await sleep(900); continue; }
          throw e;
        }
      }
    } finally { clearTimeout(slow); inflight = Math.max(0, inflight - 1); if (!inflight) barOn(false); }
  }
  /* Priority queue: anything the person is waiting for (saves, sign-in, a tab with nothing cached) always goes BEFORE background refreshes;
     background refreshes for a tab the person has already left are skipped. */
  const queue = []; let running = false, fgRunning = false;
  function call(action, payload, txn, opts) { opts = opts || {}; return new Promise((res, rej) => { queue.push({ a: action, p: payload, t: txn, bg: !!opts.bg, stale: opts.stale, res, rej }); pump(); }); }
  async function pump() {
    if (running) return; running = true;
    try {
      while (queue.length) {
        let i = queue.findIndex(x => !x.bg); if (i < 0) i = 0; const x = queue.splice(i, 1)[0];
        if (x.stale && x.stale()) { x.rej(makeError('STALE', 'Skipped')); continue; }
        fgRunning = !x.bg; try { x.res(await rawCall(x.a, x.p, x.t)); } catch (e) { x.rej(e); } finally { fgRunning = false; }
      }
    } finally { running = false; }
  }
  async function api(action, payload, txn, opts) {
    const r = await call(action, payload, txn, opts);
    if (r && r.ok && r.snapshot) APP.fresh = r.snapshot;
    if (!r || !r.ok) { const e = makeError(r && r.error && r.error.code, r && r.error && r.error.message); if (['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(e.code)) logoutLocal(); throw e; }
    return r;
  }
  async function loadRead(action, payload) { const p = payload || {}, key = readKey(action, p); if (!navigator.onLine && Object.prototype.hasOwnProperty.call(APP.readCache, key)) return APP.readCache[key]; try { const r = await api(action, p); APP.readCache[key] = r.data; await IDB.set('readcache', APP.readCache); return r.data; } catch (e) { if (Object.prototype.hasOwnProperty.call(APP.readCache, key) && ['NETWORK_ERROR', 'LOCKED_RETRY'].includes(e.code)) return APP.readCache[key]; throw e; } }
  let saveReadT; const saveReads = () => { clearTimeout(saveReadT); saveReadT = setTimeout(() => IDB.set('readcache', APP.readCache).catch(() => { }), 600); };
  const hasRead = t => Object.prototype.hasOwnProperty.call(APP.readCache, readKey(t[0], t[1] || {}));
  /* Several reads in ONE request / ONE server load. Returns true if anything changed. */
  async function loadReads(tasks, opts) {
    if (!tasks.length) return false; let changed = false;
    for (let i = 0; i < tasks.length; i += 20) {
      const part = tasks.slice(i, i + 20); let res;
      try { res = (await api('batch', { requests: part.map(t => ({ action: t[0], payload: t[1] || {} })) }, undefined, opts)).data; }
      catch (e) { if (e.code === 'STALE') return false; if (['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(e.code)) throw e; if (e.code === 'BAD_REQUEST') { for (const t of part) await loadRead(t[0], t[1] || {}).catch(() => { }); changed = true; continue; } throw e; }
      res.forEach((r, k) => { if (r && r.ok) { const key = readKey(part[k][0], part[k][1] || {}), a = JSON.stringify(APP.readCache[key]), b = JSON.stringify(r.data); if (a !== b) { APP.readCache[key] = r.data; changed = true; } } else if (r && r.error && ['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(r.error.code)) { const e = makeError(r.error.code, r.error.message); logoutLocal(); throw e; } });
    }
    saveReads(); return changed;
  }
  function q(action, payload) { const key = readKey(action, payload || {}); if (Object.prototype.hasOwnProperty.call(APP.readCache, key)) return APP.readCache[key]; throw new Error(APP.isOffline || !navigator.onLine ? 'This detail is not cached on this device. Connect to the internet to load it.' : 'This information has not loaded yet. Please wait a moment and try again.'); }
  function rateId(pair) { const r = (APP.S && APP.S.rateHistory || []).find(x => x.pair === pair); return r && r.id || null; }
  function applyOptimistic(action, payload) {
    if (!APP.S) return;
    const p = payload || {}, prod = id => APP.S.products.find(x => x.id === id), item = id => APP.S.collItems.find(x => x.id === id), customer = id => APP.S.customers.find(x => x.id === id);
    if (action === 'sales.reverse') {
      const sales = APP.readCache[readKey('sales.list', {})] || [], sale = sales.find(x => x.id === p.sale_id);
      if (sale) { (sale.items || []).forEach(x => { const pr = prod(x.product_id); if (pr) pr.available += Number(x.qty || 0); }); if (sale.payment_status === 'CREDIT') { const c = customer(sale.customer_id); if (c) { c.customer_credit_outstanding_usd_cents = Math.max(0, (c.customer_credit_outstanding_usd_cents || 0) - sale.total_usd_cents); c.outstanding_usd_cents = Math.max(0, c.outstanding_usd_cents - sale.total_usd_cents); } } }
    } else if (action === 'sales.create') {
      let total = 0; (p.items || []).forEach(x => { const pr = prod(x.product_id); if (pr) { pr.available = Math.max(0, pr.available - Number(x.qty || 0)); total += (pr.price_usd_cents || 0) * Number(x.qty || 0); } });
      if (p.method_id === 'CREDIT') { const c = customer(p.customer_id); if (c) { c.customer_credit_outstanding_usd_cents = (c.customer_credit_outstanding_usd_cents || 0) + total; c.outstanding_usd_cents = (c.outstanding_usd_cents || 0) + total; } }
    } else if (action === 'payments.recordRepayment') {
      const c = customer(p.customer_id), m = (APP.S.methods || []).find(x => x.id === p.method_id), rr = (APP.S.rateHistory || []).find(x => x.id === p.rate_id) || (APP.S.rateHistory || []).find(x => x.pair === 'USD_SLSH');
      if (c && m) { const amt = Math.round(Number(p.amount) * (m.currency === 'USD' ? 100 : 1)), usd = m.currency === 'USD' ? amt : Math.round(amt * 100 / (rr && rr.rate || APP.S.rates.USD_SLSH)); c.customer_credit_outstanding_usd_cents = Math.max(0, (c.customer_credit_outstanding_usd_cents || 0) - usd); c.outstanding_usd_cents = Math.max(0, c.outstanding_usd_cents - usd); }
    } else if (action === 'branch.directSale') {
      (p.items || []).forEach(x => { const pr = prod(x.product_id); if (pr) pr.available = Math.max(0, pr.available - Number(x.qty || 0)); });
    } else if (action === 'branch.collect') {
      const br = APP.S.branches.find(x => x.id === p.branch_id), as = APP.S.people.find(x => x.id === p.assistant_id), te = APP.S.people.find(x => x.id === p.technician_id), at = p.offline_at || new Date().toISOString();
      (p.items || []).forEach(x => { const pr = prod(x.product_id); if (!pr) return; pr.available = Math.max(0, pr.available - Number(x.qty || 0)); pr.held = (pr.held || 0) + Number(x.qty || 0); APP.S.collItems.unshift({ id: x.client_item_id, collection_id: p.client_collection_id, branch_id: p.branch_id, product_id: x.product_id, qty: Number(x.qty), status: 'PENDING', collected_at: at, assistant: as && as.name || '', technician: te && te.name || '', age_hours: 0, overdue: false, inspection: null, local_pending: true }); });
    } else if (action === 'branch.setItemStatus' || action === 'branch.reviewOverdue') {
      const original = item(p.item_id); if (original) { let target = original, qty = Number(p.qty || original.qty); if (qty > 0 && qty < original.qty && p.client_split_item_id) { original.qty -= qty; target = Object.assign({}, original, { id: p.client_split_item_id, qty, local_pending: true }); APP.S.collItems.unshift(target); } const next = action === 'branch.reviewOverdue' ? (p.decision === 'SOLD' ? 'SOLD' : p.decision === 'RETURN_REPORTED' ? 'RETURN_REPORTED' : 'PENDING') : p.status; if (next) target.status = next; if (next === 'SOLD') { const pr = prod(target.product_id); if (pr) pr.held = Math.max(0, (pr.held || 0) - target.qty); } }
    } else if (action === 'branch.inspectReturn') {
      const it = item(p.item_id); if (it) { it.status = 'RETURN_INSPECTED'; it.inspection = { result: p.result, notes: p.notes || '', by_name: APP.S.me.name }; }
    } else if (action === 'branch.approveReturn') {
      const it = item(p.item_id); if (it) { const pr = prod(it.product_id); if (it.inspection && it.inspection.result === 'RESTOCK') { it.status = 'RETURNED_APPROVED'; if (pr) { pr.available += it.qty; pr.held = Math.max(0, (pr.held || 0) - it.qty); } } else it.status = 'RETURN_REJECTED'; }
    } else if (action === 'stock.adjust') { const pr = prod(p.product_id); if (pr) pr.available = Math.max(0, pr.available + Number(p.delta || 0)); }
    else if (action === 'products.setPrice') { const pr = prod(p.product_id); if (pr) pr.price_usd_cents = Number(p.price_usd_cents); }
    else if (action === 'products.setStatus') { const pr = prod(p.product_id); if (pr) pr.status = p.status; }
    else if (action === 'products.update') { const pr = prod(p.product_id); if (pr) ['name','category','model','variant_tag','min_stock','supplier_id'].forEach(k => { if (p[k] !== undefined) pr[k] = p[k]; }); }
  }
  async function apiQ(action, payload, txn) {
    const p = clone(payload || {}), id = txn || txnId(); APP.lastActionQueued = false;
    if (!QUEUEABLE.has(action)) return api(action, p, txn);
    if (RATE_ACTIONS.has(action) && !p.rate_id) p.rate_id = rateId('USD_SLSH');
    if (action === 'po.create' && !p.aed_usd_rate_id) p.aed_usd_rate_id = rateId('AED_USD');
    if (!navigator.onLine && !p.offline_at) p.offline_at = new Date().toISOString();
    if (action === 'branch.collect' || action === 'branch.directSale') {
      p.client_collection_id = p.client_collection_id || ('COL-' + DEVICE + '-' + id.slice(-12));
      const grouped = {}; (p.items || []).forEach(x => { if (!x.product_id) return; grouped[x.product_id] = (grouped[x.product_id] || 0) + Number(x.qty || 0); });
      p.items = Object.keys(grouped).map((product_id, i) => ({ product_id, qty: grouped[product_id], client_item_id: 'CIT-' + DEVICE + '-' + id.slice(-8) + '-' + i }));
    }
    if ((action === 'branch.setItemStatus' || action === 'branch.reviewOverdue') && Number(p.qty || 0) > 0) p.client_split_item_id = p.client_split_item_id || ('CIT-' + DEVICE + '-' + id.slice(-12));
    try {
      if (!navigator.onLine) throw makeError('NETWORK_ERROR', 'Offline');
      const r = await api(action, p, id); return r;
    } catch (e) {
      if (!['NETWORK_ERROR', 'LOCKED_RETRY'].includes(e.code) && !(e instanceof TypeError)) throw e;
      if (!p.offline_at) p.offline_at = new Date().toISOString();
      const outbox = await IDB.get('outbox') || [];
      if (!outbox.some(x => x.client_txn_id === id)) outbox.push({ id, action, payload: p, client_txn_id: id, user_id: APP.S && APP.S.me.id, created_at: new Date().toISOString(), status: 'QUEUED', error: null });
      await IDB.set('outbox', outbox); applyOptimistic(action, p); await IDB.set('snapshot', APP.S); APP.lastActionQueued = true; updateSyncIndicator();
      return { ok: true, queued: true, data: null, client_txn_id: id };
    }
  }
  /* Install a snapshot the server already sent (login / after a save) without asking again. */
  async function setSnapshot(data) {
    IDB.set('server_snapshot', data).catch(() => { });
    APP.S = clone(data); APP.isOffline = false; if (!Object.keys(APP.readCache || {}).length) APP.readCache = await IDB.get('readcache') || APP.readCache || {};
    const pending = await IDB.get('outbox') || []; pending.forEach(x => applyOptimistic(x.action, x.payload));
    IDB.set('snapshot', APP.S).catch(() => { });
  }
  async function refresh() {
    if (!navigator.onLine) { APP.isOffline = true; APP.readCache = await IDB.get('readcache') || APP.readCache || {}; const cached = await IDB.get('snapshot') || await IDB.get('server_snapshot'); if (cached) { APP.S = cached; return; } throw makeError('OFFLINE_NO_CACHE', 'You need to connect once before this device can work offline.'); }
    try {
      const r = await api('data.snapshot');
      await setSnapshot(r.data);
    } catch (e) {
      const cached = await IDB.get('snapshot') || await IDB.get('server_snapshot');
      if (cached && ['NETWORK_ERROR', 'LOCKED_RETRY'].includes(e.code)) { APP.S = cached; APP.readCache = await IDB.get('readcache') || APP.readCache || {}; APP.isOffline = true; return; }
      throw e;
    }
  }
  async function syncQueue() {
    if (APP.syncing || !navigator.onLine || !APP.token) return;
    APP.syncing = true; updateSyncIndicator();
    try {
      const outbox = await IDB.get('outbox') || [], attempted = outbox.length; let synced = 0;
      for (let i = 0; i < outbox.length; i++) {
        const x = outbox[i];
        if (x.user_id && APP.S && x.user_id !== APP.S.me.id) { x.status = 'CONFLICT'; x.error = 'This transaction belongs to a different staff account. Sign in as that account to sync it.'; await IDB.set('outbox', outbox); break; }
        try {
          const r = await call(x.action, x.payload, x.client_txn_id);
          if (!r || !r.ok) {
            const code = r && r.error && r.error.code || 'NETWORK_ERROR';
            if (['LOCKED_RETRY', 'NETWORK_ERROR'].includes(code)) break;
            x.status = 'CONFLICT'; x.error = (r && r.error && r.error.message) || 'The server rejected this transaction.'; x.error_code = code; await IDB.set('outbox', outbox); break;
          }
          outbox.splice(i, 1); i--; synced++; await IDB.set('outbox', outbox);
        } catch (e) { if (e.code === 'NETWORK_ERROR' || e instanceof TypeError) break; x.status = 'CONFLICT'; x.error = e.message; x.error_code = e.code; await IDB.set('outbox', outbox); break; }
      }
      if (outbox.length === 0) await IDB.set('outbox', []);
      if (navigator.onLine && attempted > 0) await refresh().catch(() => {});
    } finally { APP.syncing = false; updateSyncIndicator(); }
  }
  async function openSyncQueue() {
    const outbox = await IDB.get('outbox') || [];
    const rows = outbox.map(x => `<tr><td><b>${esc(x.action)}</b><br><span class="muted sm">${dt(x.created_at)}</span></td><td>${badge(x.status === 'CONFLICT' ? 'Needs review' : 'Waiting to sync', x.status === 'CONFLICT' ? 'bad' : 'warn')}<br><span class="sm muted">${esc(x.error || '')}</span></td><td class="right nowrap"><button class="btn sm sec" data-retry="${esc(x.id)}">Retry</button> <button class="btn sm bad" data-discard="${esc(x.id)}">Discard</button></td></tr>`).join('');
    modal(`<h2>Offline transactions</h2><p class="muted sm">Transactions are sent in the order they were recorded. A conflict pauses later transactions so dependent stock and branch updates are not applied out of sequence.</p>${table([['Transaction'],['Sync status'],['']],rows,'Everything is synced.')}<div class="row mt"><button class="btn f" id="syncnow">Sync now</button><button class="btn sec" data-close>Close</button></div>`, d => {
      d.querySelector('#syncnow').onclick = async () => { closeModal(); await syncQueue(); await refresh().catch(() => {}); await render(); };
      d.querySelectorAll('[data-retry]').forEach(b => b.onclick = async () => { const q = await IDB.get('outbox') || [], x = q.find(z => z.id === b.dataset.retry); if (x) { x.status = 'QUEUED'; x.error = null; x.error_code = null; await IDB.set('outbox', q); } closeModal(); await syncQueue(); await refresh().catch(() => {}); await render(); });
      d.querySelectorAll('[data-discard]').forEach(b => b.onclick = async () => { const q = await IDB.get('outbox') || [], at = q.findIndex(z => z.id === b.dataset.discard), later = Math.max(0, q.length - at - 1); modal(`<h2>Discard this transaction?</h2><p>This permanently removes the selected local transaction. ${later ? later + ' later transaction(s) will remain in the queue and may depend on it; those may fail when synced.' : 'This is the last queued transaction.'}</p><div class="row mt"><button class="btn bad f" id="confirmdiscard">Discard transaction</button><button class="btn sec" data-close>Keep it</button></div>`, d2 => d2.querySelector('#confirmdiscard').onclick = async () => { const latest = await IDB.get('outbox') || []; await IDB.set('outbox', latest.filter(z => z.id !== b.dataset.discard)); closeModal(); const base = await IDB.get('server_snapshot') || await IDB.get('snapshot'); if (base) { APP.S = clone(base); (await IDB.get('outbox') || []).forEach(x => applyOptimistic(x.action, x.payload)); await IDB.set('snapshot', APP.S); } updateSyncIndicator(); await render(); openSyncQueue(); }); });
    }, true);
  }
  async function updateSyncIndicator() {
    const q = await IDB.get('outbox').catch(() => []) || [], el = $('#syncstat');
    if (el) { const conflicts = q.filter(x => x.status === 'CONFLICT').length; el.textContent = APP.isOffline || !navigator.onLine ? 'Offline · ' + q.length + ' queued' : conflicts ? conflicts + ' conflicts · ' + q.length + ' queued' : q.length ? q.length + ' waiting to sync' : 'Synced'; el.className = 'pill ' + (APP.isOffline || !navigator.onLine || (q.length && !conflicts) ? 'offline' : conflicts ? 'bad' : 'on'); }
  }
  const can = p => !!(APP.S && APP.S.me.perms.includes(p));
  function toast(m, k) { const t = document.createElement('div'); t.className = 'toast ' + (k || ''); t.textContent = m; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200); }
  function modal(html, bind, wide) { const d = $('#dlg'); d.className = wide ? 'wide' : ''; d.innerHTML = '<div class="dbody">' + html + '</div>'; if (!d.open) d.showModal(); $$('[data-close]', d).forEach(b => b.onclick = () => d.close()); if (bind) bind(d); }
  const closeModal = () => { const d = $('#dlg'); if (d.open) d.close(); };
  /* Busy state for the button that was tapped: it is disabled, shows a spinner and "Please wait…" so nobody taps twice. */
  function busyBtn(b, on) { if (!b || !b.isConnected) return; if (on) { if (b.dataset.lbl === undefined) b.dataset.lbl = b.innerHTML; b.classList.add('busy'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Please wait…'; } else { b.classList.remove('busy'); b.disabled = false; if (b.dataset.lbl !== undefined) { b.innerHTML = b.dataset.lbl; delete b.dataset.lbl; } } }
  async function act(fn, okMsg) {
    const ae = document.activeElement, btn = ae && ae.tagName === 'BUTTON' && !ae.hasAttribute('data-close') ? ae : null; busyBtn(btn, true);
    try {
      APP.lastActionQueued = false; APP.fresh = null; const after = await fn(), queued = APP.lastActionQueued || !!(after && after.queued);
      if (queued) toast('Saved offline. It will sync when the connection returns.', 'warn'); else if (okMsg) toast(okMsg, 'ok');
      if (APP.fresh && !queued) { const f = APP.fresh; APP.fresh = null; await setSnapshot(f); } else await refresh();
      render(); if (typeof after === 'function') after();
    } catch (e) { toast(e.message, 'err'); } finally { busyBtn(btn, false); }
  }
  /* ---- forms ---- */
  function fieldHtml(f) {
    const id = 'f_' + f.id; let c;
    if (f.type === 'select') c = `<select id="${id}">${(f.options || []).map(o => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return `<option value="${esc(v)}" ${String(v) === String(f.value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
    else if (f.type === 'textarea') c = `<textarea id="${id}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(f.value || '')}</textarea>`;
    else c = `<input id="${id}" type="${f.type || 'text'}" ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max ? `max="${f.max}"` : ''} value="${esc(f.value == null ? '' : f.value)}" placeholder="${esc(f.ph || '')}" ${f.list ? `list="${f.list}"` : ''} ${f.readonly ? 'readonly' : ''} autocomplete="off">`;
    return `<div class="fld ${f.full ? 'full' : ''}"><label for="${id}">${f.label}</label>${c}${f.help ? `<div class="muted sm">${f.help}</div>` : ''}</div>`;
  }
  function formDlg(o) {
    modal(`<h2>${o.title}</h2>${o.intro ? `<div class="muted sm mt">${o.intro}</div>` : ''}<div class="frow">${o.fields.map(fieldHtml).join('')}</div>${o.extra || ''}<div class="row mt"><button class="btn f" id="ok">${o.ok || 'Save'}</button><button class="btn sec" data-close>Cancel</button></div>`, d => {
      if (o.bind) o.bind(d);
      const submit = d.querySelector('#ok'); submit.onclick = async () => { if (submit.disabled) return; submit.disabled = true; await act(async () => { const v = {}; o.fields.forEach(f => v[f.id] = d.querySelector('#f_' + f.id).value); const after = await o.onSubmit(v, d); if (!o.keepOpen) closeModal(); return after; }, o.okMsg === undefined ? 'Saved' : o.okMsg); if (d.isConnected) submit.disabled = false; };
    }, o.wide);
  }
  /* ---- date ranges ---- */
  const today = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {}); return p.year + '-' + p.month + '-' + p.day; };
  const addDays = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function getRange(key, def) {
    const r = APP.state.range[key] || (APP.state.range[key] = { p: def || 'month' }), t = today(); let from = null, to = null;
    switch (r.p) { case 'today': from = to = t; break; case 'yesterday': from = to = addDays(t, -1); break; case '7d': from = addDays(t, -6); to = t; break; case 'month': from = t.slice(0, 7) + '-01'; to = t; break;
      case 'lastmonth': { const f = new Date(t.slice(0, 7) + '-01T00:00:00Z'); f.setUTCMonth(f.getUTCMonth() - 1); from = f.toISOString().slice(0, 10); to = addDays(t.slice(0, 7) + '-01', -1); break; } case 'all': break; case 'custom': from = r.from || t; to = r.to || t; break; }
    return { from, to, p: r.p };
  }
  function rangeBar(key, def, opts, noAll) {
    const r = getRange(key, def), P = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['all', 'All time'], ['custom', 'Custom']].filter(x => !(noAll && x[0] === 'all'));
    return `<div class="row mb"><select data-rng="${key}" style="width:auto;min-width:150px">${P.map(p => `<option value="${p[0]}" ${p[0] === r.p ? 'selected' : ''}>${p[1]}</option>`).join('')}</select>${r.p === 'custom' ? `<input type="date" data-rngd="${key}:from" value="${r.from || r.to || today()}" style="width:auto"><span class="muted">to</span><input type="date" data-rngd="${key}:to" value="${r.to || today()}" style="width:auto">` : ''}${r.from ? `<span class="muted sm">${dkey(r.from)} – ${dkey(r.to)}</span>` : ''}${opts || ''}</div>`;
  }
  function bindRange() {
    $$('[data-rng]').forEach(s => s.onchange = () => { const k = s.dataset.rng, cur = getRange(k); APP.state.range[k] = { p: s.value, from: cur.from, to: cur.to }; render(); });
    $$('[data-rngd]').forEach(i => i.onchange = () => { const [k, f] = i.dataset.rngd.split(':'); APP.state.range[k][f] = i.value; render(); });
  }
  /* ---- csv / charts ---- */
  function csv(name, cols, rows) {
    const f = (v, t) => t === 'usd' ? (v / 100).toFixed(2) : v == null ? '' : v; const lines = [cols.map(c => c[1]).join(',')].concat(rows.map(r => cols.map(c => '"' + String(f(r[c[0]], c[2])).replace(/"/g, '""') + '"').join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' })); a.download = name + '-' + today() + '.csv'; a.click();
  }
  function bars(series) {
    const W = 640, H = 210, pl = 44, pb = 28, max = Math.max(1, ...series.map(s => s.usd_cents)), bw = (W - pl - 8) / series.length, step = Math.ceil(series.length / 10);
    const yt = [0, .5, 1].map(f => { const y = H - pb - f * (H - pb - 14); return `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="#E1E7F0"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#475569">${f ? '$' + num(max * f / 100) : '0'}</text>`; }).join('');
    const b = series.map((s, i) => { const h = s.usd_cents / max * (H - pb - 14), x = pl + i * bw + bw * .15; return `<rect x="${x}" y="${H - pb - h}" width="${Math.max(2, bw * .7)}" height="${h}" rx="3" fill="#064797"><title>${dkey(s.day)}: ${usd(s.usd_cents)}</title></rect>${i % step === 0 ? `<text x="${x + bw * .35}" y="${H - 9}" text-anchor="middle" font-size="10" fill="#475569">${s.day.slice(8)}/${s.day.slice(5, 7)}</text>` : ''}`; }).join('');
    return `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales by day">${yt}${b}</svg>`;
  }
  Object.assign(APP, { $, $$, esc, num, usd, slsh, dt, dday, dkey, ic, badge, kpi, table, tabs, curTab, api, apiQ, q, call, loadRead, refresh, syncQueue, openSyncQueue, can, toast, modal, closeModal, act, formDlg, fieldHtml, today, addDays, getRange, rangeBar, csv, bars, IDB, DEVICE });
  APP.slshOf = c => Math.round(c * APP.S.rates.USD_SLSH / 100);

  /* ---- login ---- */
  function loginView(setupFor) {
    $('#app').innerHTML = `<div class="login"><div class="box"><img class="lg" src="assets/logo/AdamNokia_Primary_FullColor.svg" alt="Adam Nokia Electronics">
      <h2 class="center">${setupFor ? 'Create your password' : 'Sign in'}</h2><p class="muted sm center">${setupFor ? 'Enter the one-time setup code provided by an owner. Passwords must be at least 8 characters.' : 'Adam Nokia Electronics · Smart Management System'}</p>
      <label>Username</label><input id="u" autocapitalize="off" autocomplete="username" value="${esc(setupFor || '')}" ${setupFor ? 'readonly' : ''}>
      ${setupFor ? '<label>One-time setup code</label><input id="sc" autocomplete="one-time-code" placeholder="ABCDE-12345">' : ''}
      <label>${setupFor ? 'New password' : 'Password'}</label><input id="p" type="password" autocomplete="${setupFor ? 'new-password' : 'current-password'}">
      ${setupFor ? '<label>Repeat password</label><input id="p2" type="password" autocomplete="new-password">' : ''}
      <button class="btn" id="go" style="width:100%;margin-top:18px">${setupFor ? 'Save and sign in' : 'Sign in'}</button><p class="sm center mt" id="hint" style="color:var(--blue);min-height:20px;font-weight:500"></p><p class="muted sm center mt">Shared business data syncs with the central system. Offline transactions are saved on this device until connection returns.</p></div></div>`;
    const go = async () => {
      const username = $('#u').value.trim(), password = $('#p').value; let r; const btn = $('#go');
      if (btn.disabled) return; if (!username || !password) return toast('Enter your username and password', 'err');
      if (setupFor && !$('#sc').value.trim()) return toast('Enter your one-time setup code', 'err');
      btn.disabled = true; btn.classList.add('busy'); btn.innerHTML = '<span class="spin"></span>' + (setupFor ? 'Setting up your account…' : 'Signing in…'); $$('input', $('#app')).forEach(i => i.readOnly = true);
      const hint = $('#hint'); if (hint) hint.textContent = 'Please wait — this can take a few seconds. Do not close this page.';
      try {
        if (setupFor) { if (password !== $('#p2').value) return toast('Passwords do not match', 'err'); r = await api('auth.setup', { username, setup_code: $('#sc').value, password }); }
        else { try { r = await api('auth.login', { username, password }); } catch (e) { if (e.code === 'NEEDS_SETUP') { loginView(username.toLowerCase()); return toast('Enter the one-time setup code issued by an owner.', 'warn'); } throw e; } }
        APP.token = r.data.token; localStorage.setItem('ane_token', APP.token); if (r.data.snapshot) await setSnapshot(r.data.snapshot); else await refresh(); APP.route = 'dashboard'; location.hash = '#dashboard'; await render(); syncQueue().then(() => warmCache()).catch(() => { });
      } catch (e) { toast(e.message, 'err'); const b2 = $('#go'); if (b2) { b2.disabled = false; b2.classList.remove('busy'); b2.textContent = setupFor ? 'Save and sign in' : 'Sign in'; $$('input', $('#app')).forEach(i => { if (!(setupFor && i.id === 'u')) i.readOnly = false; }); const h = $('#hint'); if (h) h.textContent = ''; } }
    };
    $('#go').onclick = go; $$('input', $('#app')).forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); }); (setupFor ? $('#sc') : $('#u')).focus();
  }
  function logoutLocal() { APP.token = null; localStorage.removeItem('ane_token'); APP.S = null; closeModal(); loginView(); }
  APP.logout = async () => { const q = await IDB.get('outbox').catch(() => []) || []; if (q.length) { modal(`<h2>Transactions are waiting to sync</h2><p>You have ${q.length} unsynced transaction(s). Signing out keeps them on this device, but they will sync only after the same staff account signs in again.</p><div class="row mt"><button class="btn bad f" id="signoutanyway">Sign out anyway</button><button class="btn sec" data-close>Stay signed in</button></div>`, d => d.querySelector('#signoutanyway').onclick = async () => { closeModal(); try { await api('auth.logout'); } catch (e) { } logoutLocal(); }); return; } try { await api('auth.logout'); } catch (e) { } logoutLocal(); };

  /* ---- shell ---- */
  const NAV = [['dashboard', 'Dashboard', null], ['branches', 'Branch Collections', 'branch.view'], ['pos', 'Sell', 'sales.create'], ['sales', 'Sales & Invoices', 'sales.view'], ['inventory', 'Inventory', 'inventory.view'], ['customers', 'Customers', 'customers.view'], ['purchasing', 'Purchasing', 'purchasing.view'], ['finance', 'Finance', 'finance.view'], ['reports', 'Reports', 'reports.view'], ['insights', 'Smart Insights', 'insights.view'], ['staff', 'Staff & Permissions', 'users.manage'], ['settings', 'Settings', null], ['audit', 'Audit Log', 'audit.view']];
  APP.NAV = NAV;
  let renderSeq = 0, lastRoute = null;
  function routeTasks(route) {
    if (!APP.S) return [];
    const t = today(), tasks = [], add = (a, p) => tasks.push([a, p || {}]);
    if (route === 'dashboard') { const r = getRange('dash', '7d'); add('dashboard.get', { from: r.from || addDays(t, -29), to: r.to || t }); }
    if (route === 'sales') { const r = getRange('sales', 'today'); add('sales.list', { from: r.from, to: r.to }); add('sales.list', {}); }
    if (route === 'branches') { add('recon.list', {}); (APP.S.branches || []).forEach(b => add('recon.list', { branch_id: b.id })); }
    if (route === 'purchasing') { add('po.list', {}); if (can('finance.view')) add('payments.list', {}); }
    if (route === 'finance') {
      const r = getRange('fin', 'month'); add('payments.list', r); add('recon.list', {}); add('po.list', {}); add('expenses.list', r);
      add('reports.run', Object.assign({ name: 'finance_summary' }, r)); add('reports.run', Object.assign({ name: 'payments_summary' }, r)); add('reports.run', Object.assign({ name: 'expenses_report' }, r));
    }
    if (route === 'reports') { const cur = APP.state.rep || (APP.state.rep = { name: 'sales_summary', group: 'day' }), r = getRange('rep', 'month'); add('reports.run', Object.assign({ name: cur.name, group: cur.group }, r)); }
    if (route === 'customers' && can('customers.view')) add('customers.breakdowns', {});
    if (route === 'insights') add('insights.get', {});
    if (route === 'staff') add('users.list', {});
    if (route === 'audit') add('audit.list', {});
    return tasks;
  }
  const SKELETON = '<div class="skel"><i></i><i></i><i></i><p>Loading…</p></div>';
  function paint(loading) {
    if (!APP.S) return loginView();
    const nav = NAV.filter(n => !n[2] || can(n[2])); if (APP.route !== 'more' && !nav.find(n => n[0] === APP.route)) APP.route = 'dashboard';
    const pg = APP.route === 'more' ? APP.PAGES.more : APP.PAGES[APP.route], over = APP.S.collItems.filter(i => i.overdue).reduce((s, i) => s + i.qty, 0), bottom = ['dashboard', 'branches', 'pos', 'inventory'].filter(k => nav.find(n => n[0] === k));
    let body; if (loading) body = SKELETON; else try { body = pg.html(); } catch (e) { console.error(e); body = `<div class="notice bad">Something went wrong showing this page: ${esc(e.message)}</div>`; }
    $('#app').innerHTML = `<div class="shell"><aside class="side"><div class="brand"><img src="assets/logo/AdamNokia_Primary_FullColor.svg" alt="Adam Nokia Electronics"></div>
      ${nav.map(n => `<a class="nav ${n[0] === APP.route ? 'on' : ''}" href="#${n[0]}">${ic(n[0])}${n[1]}</a>`).join('')}<div class="grow"></div><div class="me"><b>${esc(APP.S.me.name)}</b><span class="muted" style="text-transform:capitalize">${esc(APP.S.me.role)}</span></div><a class="nav" href="#" id="lo">${ic('logout')}Sign out</a></aside>
      <div class="main"><div class="top"><img class="mlogo" src="assets/logo/AdamNokia_Secondary_Horizontal_FullColor.svg" alt="Adam Nokia"><h1>${pg.title}</h1><span class="pill ${APP.isOffline || !navigator.onLine ? 'offline' : 'on'}" id="syncstat" role="button" tabindex="0">${APP.isOffline || !navigator.onLine ? 'Offline' : 'Synced'}</span>${can('branch.view') && over ? `<a class="bell" href="#branches" title="${over} overdue branch item(s)">${ic('bell')}<i>${over}</i></a>` : ''}</div><div class="page" id="page">${body}</div></div>
      <nav class="bottom">${bottom.map(k => { const n = nav.find(x => x[0] === k); return `<a href="#${k}" class="${k === APP.route ? 'on' : ''}">${ic(k)}${k === 'branches' ? 'Branches' : n[1]}</a>`; }).join('')}<a href="#more" class="${APP.route === 'more' ? 'on' : ''}">${ic('more')}More</a></nav></div>`;
    $('#lo').onclick = e => { e.preventDefault(); APP.logout(); };
    $('#syncstat').onclick = () => openSyncQueue(); $('#syncstat').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') openSyncQueue(); };
    updateSyncIndicator();
    $$('[data-tab]').forEach(b => b.onclick = () => { APP.state.tab[b.dataset.page] = b.dataset.tab; render(); }); bindRange();
    { const pgEl = $('#page'); if (pgEl && lastRoute !== APP.route) { pgEl.classList.add('enter'); setTimeout(() => pgEl.classList.remove('enter'), 250); } lastRoute = APP.route; }
    if (!loading) try { if (pg.bind) pg.bind(); } catch (e) { console.error(e); toast(e.message, 'err'); }
  }
  /* Show the page at once from what we already have; fetch what is missing / out of date in the background and repaint only if it changed. */
  async function render() {
    const seq = ++renderSeq;
    if (!APP.S) return loginView();
    const route = APP.route, tasks = routeTasks(route), online = navigator.onLine && !APP.isOffline, missing = tasks.filter(t => !hasRead(t));
    paint(online && missing.length > 0);
    if (!online || !tasks.length) return;
    loadReads(tasks, { bg: missing.length === 0, stale: () => seq !== renderSeq }).then(changed => {
      if (seq !== renderSeq) return;
      const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && $('#page') && $('#page').contains(document.activeElement);
      if ((changed || missing.length) && !(($('#dlg') || {}).open) && !(typing && !missing.length)) { const y = window.scrollY; paint(false); if (!missing.length) window.scrollTo(0, y); }
    }).catch(e => { if (seq !== renderSeq) return; if (['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(e.code)) return; if (missing.length) { paint(false); } if (!missing.length) return; toast(e.message || 'Could not load this page.', 'err'); });
  }
  APP.render = render;
  /* ---- every tap gets immediate feedback ---- */
  (function tapFeedback() {
    const fgBusy = () => running ? fgRunning || queue.some(x => !x.bg) : queue.some(x => !x.bg);
    document.addEventListener('touchstart', () => { }, { passive: true });   /* lets :active work on iOS */
    document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('button,.btn,.pitem'); if (b && !b.disabled) { b.classList.add('press'); if (navigator.vibrate) try { navigator.vibrate(8); } catch (x) { } setTimeout(() => b.classList.remove('press'), 160); } }, true);
    let lastB = null, lastT = 0;
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button.btn'); if (!b || b.hasAttribute('data-close')) return;
      if (b.classList.contains('busy') || b.disabled) { e.stopImmediatePropagation(); e.preventDefault(); return; }       /* ignore repeated taps while working */
      const now = Date.now(); if (b === lastB && now - lastT < 700 && fgBusy()) { e.stopImmediatePropagation(); e.preventDefault(); return; } lastB = b; lastT = now;
      setTimeout(() => { if (b.isConnected && !b.classList.contains('busy') && fgBusy()) { busyBtn(b, true); const iv = setInterval(() => { if (!fgBusy() || !b.isConnected) { clearInterval(iv); busyBtn(b, false); } }, 120); } }, 140);
    }, true);
  })();
  APP.PAGES.more = { title: 'All modules', html() { return `<div class="menu">${NAV.filter(n => n[0] !== 'dashboard' && (!n[2] || can(n[2]))).map(n => `<a href="#${n[0]}">${ic(n[0])}${n[1]}</a>`).join('')}<a href="#" id="lo2">${ic('logout')}Sign out</a></div>`; }, bind() { $('#lo2').onclick = e => { e.preventDefault(); APP.logout(); }; } };

  /* After the first screen is up, quietly load the other tabs (one small request each, only when the app is idle) so switching tabs is instant. */
  let warmed = false;
  async function warmCache() {
    if (warmed || !APP.S || !navigator.onLine) return; warmed = true;
    const routes = ['sales', 'branches', 'purchasing', 'finance', 'reports', 'insights', 'staff', 'audit', 'dashboard'].filter(r => r !== APP.route && (NAV.find(n => n[0] === r) ? can(NAV.find(n => n[0] === r)[2] || '') || !NAV.find(n => n[0] === r)[2] : false));
    for (const r of routes) { await sleep(800); while (inflight || queue.length) await sleep(500); if (!APP.S || !navigator.onLine) return; const t = routeTasks(r).filter(x => !hasRead(x)); if (t.length) await loadReads(t, { bg: true }).catch(() => { }); }
  }
  APP.boot = async function () {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    window.addEventListener('hashchange', () => { APP.route = location.hash.slice(1) || 'dashboard'; if (APP.S) { closeModal(); render(); window.scrollTo(0, 0); } });
    window.addEventListener('online', async () => { APP.isOffline = false; if (APP.token) { await syncQueue(); await refresh().catch(() => {}); await render(); } else updateSyncIndicator(); });
    window.addEventListener('offline', async () => { APP.isOffline = true; updateSyncIndicator(); });
    APP.route = location.hash.slice(1) || 'dashboard';
    if (APP.token) {
      try {
        const cached = await IDB.get('snapshot').catch(() => null); APP.readCache = await IDB.get('readcache') || {};
        if (cached) { APP.S = cached; await render(); refresh().then(() => { updateSyncIndicator(); render(); return syncQueue(); }).then(() => warmCache()).catch(e => { if (['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(e.code)) logoutLocal(); }); return; }
        await refresh(); await render(); syncQueue().then(() => warmCache()).catch(() => { }); return;
      }
      catch (e) { if (['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(e.code)) logoutLocal(); else { const cached = await IDB.get('snapshot').catch(() => null); if (cached) { APP.S = cached; APP.isOffline = true; await render(); return; } toast(e.message, 'err'); } }
    }
    loginView();
  };
})();
