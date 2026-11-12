/* Adam Nokia Electronics SMS — business engine (runs in browser demo mode AND Apps Script). 
   All rules enforced here: permissions, stock movements, idempotency, rate snapshots, branch workflow. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ANE = factory();
})(this, function () {
  'use strict';
  function E(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

  /* ---------- SHA-256 (pure JS so it works in browser, Node and Apps Script) ---------- */
  var K = [], H0 = [];
  (function () {
    var p = [], n = 2; while (p.length < 64) { var ok = true; for (var i = 0; i < p.length; i++) if (n % p[i] === 0) { ok = false; break; } if (ok) p.push(n); n++; }
    for (var j = 0; j < 64; j++) { var c = Math.pow(p[j], 1 / 3); K.push(Math.floor((c - Math.floor(c)) * 4294967296) >>> 0); }
    for (var k = 0; k < 8; k++) { var s = Math.sqrt(p[k]); H0.push(Math.floor((s - Math.floor(s)) * 4294967296) >>> 0); }
  })();
  function sha256(str) {
    var bytes = unescape(encodeURIComponent(str)), l = bytes.length, w = [], i, j;
    for (i = 0; i < l; i++) w[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8);
    w[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    w[(((l + 8) >> 6) << 4) + 15] = l * 8;
    var h = H0.slice();
    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (i = 0; i < w.length; i += 16) {
      var a = h.slice(), x = [];
      for (j = 0; j < 64; j++) {
        if (j < 16) x[j] = w[i + j] | 0;
        else { var s0 = rr(x[j - 15], 7) ^ rr(x[j - 15], 18) ^ (x[j - 15] >>> 3), s1 = rr(x[j - 2], 17) ^ rr(x[j - 2], 19) ^ (x[j - 2] >>> 10); x[j] = (x[j - 16] + s0 + x[j - 7] + s1) | 0; }
        var S1 = rr(a[4], 6) ^ rr(a[4], 11) ^ rr(a[4], 25), ch = (a[4] & a[5]) ^ (~a[4] & a[6]);
        var t1 = (a[7] + S1 + ch + K[j] + x[j]) | 0;
        var S0 = rr(a[0], 2) ^ rr(a[0], 13) ^ rr(a[0], 22), mj = (a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]);
        var t2 = (S0 + mj) | 0;
        a = [(t1 + t2) | 0, a[0], a[1], a[2], (a[3] + t1) | 0, a[4], a[5], a[6]];
      }
      for (j = 0; j < 8; j++) h[j] = (h[j] + a[j]) | 0;
    }
    var out = ''; for (i = 0; i < 8; i++) out += pad((h[i] >>> 0).toString(16), 8); return out;
  }
  function randHex(n) {
    var g = (typeof globalThis !== 'undefined') ? globalThis : {}, s = '', i;
    if (typeof ANE_RANDOM_HEX === 'function') return ANE_RANDOM_HEX(n); /* Apps Script supplies a CSPRNG-backed generator */
    if (g.crypto && g.crypto.getRandomValues) { var a = new Uint8Array(n); g.crypto.getRandomValues(a); for (i = 0; i < n; i++) s += pad(a[i].toString(16), 2); return s; }
    for (i = 0; i < n; i++) s += pad(Math.floor(Math.random() * 256).toString(16), 2); return s;
  }
  function hashPw(salt, pw) { var h = salt + pw; for (var i = 0; i < 1000; i++) h = sha256(h + salt); return h; }

  /* ---------- v2 helpers: SKU/IDs, dates, migration ---------- */
  var CAT_PREFIX = { 'iPhone LCD': 'IL', 'Samsung LCD': 'SL', 'Back Cover': 'BC', 'iPhone Battery': 'IB', 'iPhone Flex Cable': 'IF', 'iPhone Sensor': 'IS' };
  function catPrefix(db, cat) {
    var m = db.meta.catPrefix = db.meta.catPrefix || {}; if (m[cat]) return m[cat];
    var base = CAT_PREFIX[cat];
    if (!base) { base = String(cat).replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 3); if (base.length < 2) base = (String(cat).replace(/[^A-Za-z]/g, '').toUpperCase() + 'XX').slice(0, 2); }
    var used = Object.keys(m).map(function (k) { return m[k]; }), cand = base, i = 2; while (used.indexOf(cand) >= 0) { cand = base + i; i++; } m[cat] = cand; return cand;
  }
  function nextSku(db, cat) { var pre = catPrefix(db, cat), s = db.meta.skuSeq = db.meta.skuSeq || {}; s[pre] = (s[pre] || 0) + 1; return 'ANE-' + pre + '-' + pad(s[pre], 3); }
  function addDays(key, n) { var d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekStart(key, dow) { var d = new Date(key + 'T00:00:00Z').getUTCDay(); return addDays(key, -((d - dow + 7) % 7)); }
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fU(c) { return (c < 0 ? '-' : '') + '$' + comma((Math.abs(c) / 100).toFixed(2)); }
  function fS(n) { return comma(Math.round(n)) + ' SLSH'; }
  var EXP_CATS = ['Rent', 'Salaries', 'Transport', 'Utilities', 'Internet & airtime', 'Maintenance', 'Supplies', 'Other'];
  function migrate(db) {
    if (!db.meta) db.meta = { counters: {}, version: 1 };
    if (!db.meta.counters) db.meta.counters = {};
    ['suppliers', 'pos', 'poItems', 'receipts', 'expenses', 'reconPeriods', 'reconRevs'].forEach(function (t) { if (!Array.isArray(db[t])) db[t] = []; });
    if (!db.settings) db.settings = {};
    if (!Array.isArray(db.settings.expense_categories) || !db.settings.expense_categories.length) db.settings.expense_categories = EXP_CATS.slice();
    if (db.settings.reorder_cover_days == null) db.settings.reorder_cover_days = 30;
    db.branches = db.branches || [];
    db.branches.forEach(function (b) {
      if (b.due_offset_days == null) b.due_offset_days = (b.id === 'BR-1' || b.id === 'BR-4') ? 1 : 0;
      if (b.week_start_dow == null) b.week_start_dow = 3;
    });
    db.products = db.products || [];
    var skuSeq = db.meta.skuSeq = db.meta.skuSeq || {};
    db.products.forEach(function (p) {
      var m = String(p.id || '').match(/^ANE-([A-Z0-9]+)-(\d+)$/);
      if (m) skuSeq[m[1]] = Math.max(skuSeq[m[1]] || 0, Number(m[2]));
    });
    if ((db.meta.version || 1) < 2) {
      var legacyManager = ['sales.create','sales.view','inventory.view','inventory.manage','price.update','stock.adjust','rates.update','customers.view','customers.create','customers.manage','credit.approve','payments.record','finance.view','branch.view','branch.collect','branch.setStatus','branch.inspect','branch.approve','audit.view','settings.manage'];
      var manager = db.roles && db.roles.manager;
      if (manager && Array.isArray(manager.perms)) {
        var a = manager.perms.slice().sort().join('|'), b = legacyManager.slice().sort().join('|');
        /* Only upgrade the untouched default manager role. Preserve deliberate custom permission restrictions. */
        if (a === b) manager.perms = ROLE_PERMS.manager.slice();
      }
    }
    db.meta.version = 2;
    return db;
  }

  /* ---------- constants ---------- */
  var ALL_PERMS = ['sales.create', 'sales.view', 'inventory.view', 'inventory.manage', 'price.update', 'stock.adjust', 'rates.update',
    'customers.view', 'customers.create', 'customers.manage', 'credit.approve', 'payments.record', 'finance.view',
    'branch.view', 'branch.collect', 'branch.setStatus', 'branch.inspect', 'branch.approve', 'users.manage', 'audit.view', 'settings.manage',
    'sales.reverse', 'purchasing.view', 'purchasing.manage', 'purchasing.pay', 'purchasing.receive', 'purchasing.approve', 'finance.reverse', 'expenses.view', 'expenses.manage', 'reports.view', 'recon.view', 'recon.manage', 'insights.view', 'branch.manage'];
  var ROLE_PERMS = {
    owner: ['*'],
    manager: ALL_PERMS.filter(function (p) { return p !== 'users.manage'; }),
    employee: ['sales.create', 'sales.view', 'inventory.view', 'customers.view', 'customers.create', 'branch.view', 'branch.collect', 'branch.setStatus', 'branch.inspect']
  };
  var OVERDUE_MS = 48 * 3600 * 1000;
  var METHODS = [
    { id: 'ZAAD_USD', name: 'ZAAD USD', currency: 'USD', enabled: true }, { id: 'ZAAD_SLSH', name: 'ZAAD SLSH', currency: 'SLSH', enabled: true },
    { id: 'EDAHAB_USD', name: 'eDahab USD', currency: 'USD', enabled: true }, { id: 'EDAHAB_SLSH', name: 'eDahab SLSH', currency: 'SLSH', enabled: true },
    { id: 'CREDIT', name: 'Customer Credit (pay later)', currency: 'USD', enabled: true }, { id: 'CASH', name: 'Cash', currency: 'USD', enabled: false }];

  /* ---------- seed ---------- */
  function seed(src, now) {
    var iso = now.toISOString(), db = { meta: { counters: {}, version: 1, seeded_at: iso }, settings: {}, roles: {}, users: [], sessions: [], rates: [], products: [], balances: [], movements: [],
      customers: [], sales: [], saleItems: [], payments: [], branches: [], people: [], collections: [], collItems: [], history: [], inspections: [], audit: [], syncLog: [], methods: METHODS.slice(), suppliers: [], pos: [], poItems: [], receipts: [], expenses: [], reconPeriods: [], reconRevs: [] };
    Object.keys(ROLE_PERMS).forEach(function (r) { db.roles[r] = { id: r, perms: ROLE_PERMS[r] }; });
    db.settings = { business_name: 'Adam Nokia Electronics', phone: '', address: 'Hargeisa, Somaliland', email: '', website: '',
      timezone_offset_min: 180, default_min_stock: 3, reorder_cover_days: 30, expense_categories: EXP_CATS.slice(), credit_customer_name: 'Aadan Nokia Repairing and Software Solutions' };
    /* Exchange rates are NEVER invented: they exist only if the seed supplies them; otherwise the manager must set them (rates.set). */
    if (src.usd_slsh > 0) db.rates.push({ id: 'RATE-0001', pair: 'USD_SLSH', rate: src.usd_slsh, previous: null, effective_at: iso, by: 'SYSTEM', note: 'Initial rate from seed' });
    if (src.aed_per_usd > 0) db.rates.push({ id: 'RATE-0002', pair: 'AED_USD', rate: src.aed_per_usd, previous: null, effective_at: iso, by: 'SYSTEM', note: 'Initial rate from seed' });
    (src.staff || []).forEach(function (u) { db.users.push({ id: u[0], full_name: u[1], username: u[2], role: u[3], status: 'active', password_hash: null, salt: null, failed: 0, locked_until: 0, setup_salt: null, setup_hash: null, setup_expires: 0, setup_failed: 0 }); });
    src.items.forEach(function (it, idx) {
      var aedMinor = Math.round((it.unit_cost_aed || 0) * 100), usd = src.aed_per_usd > 0 ? Math.round(aedMinor / src.aed_per_usd) : 0;
      db.products.push({ id: it.product_id, sku: it.sku, name: it.supplier_item_name, supplier_item_name: it.supplier_item_name, category: it.category, variant_tag: it.variant_tag,
        model: it.model_derived, model_is_derived: true, cost_aed_minor: aedMinor, aed_usd_rate_snapshot: src.aed_per_usd || null, cost_usd_cents: usd,
        price_usd_cents: Math.round((it.selling_price_usd || 0) * 100), min_stock: null, supplier_id: null, status: 'active' });
      db.balances.push({ product_id: it.product_id, loc: 'AVAILABLE', qty: it.source_qty || 0 });
      db.movements.push({ id: 'MOV-OPEN-' + pad(idx + 1, 4), product_id: it.product_id, type: 'OPENING', from: null, to: 'AVAILABLE', qty: it.source_qty, reason: 'Opening stock', ref: 'IMPORT', at: iso, by: 'SYSTEM' });
    });
    db.customers.push({ id: 'CUS-WALKIN', name: 'Walk-in Customer', phone: '', category: 'WALK_IN', address: '', notes: 'System default for anonymous walk-in sales', credit_approved: false, credit_limit_usd_cents: 0, status: 'active', system: true });
    db.customers.push({ id: 'CUS-AANR', name: db.settings.credit_customer_name, phone: '', category: 'BUSINESS', address: '', notes: 'Independent business with 4 branches. Uses Branch Collections workflow.', credit_approved: false, credit_limit_usd_cents: 0, status: 'active', system: true });
    var R = src.branches || {};
    Object.keys(R).forEach(function (b) {
      var id = 'BR-' + b; db.branches.push({ id: id, customer_id: 'CUS-AANR', name: R[b].name, cycle: R[b].cycle, active: true, due_offset_days: (id === 'BR-1' || id === 'BR-4') ? 1 : 0, week_start_dow: 3 });
      R[b].tech.forEach(function (n, i) { db.people.push({ id: id + '-T' + pad(i + 1, 2), branch_id: id, name: n, role: 'TECHNICIAN', active: true }); });
      R[b].asst.forEach(function (n, i) { db.people.push({ id: id + '-A' + pad(i + 1, 2), branch_id: id, name: n, role: 'ASSISTANT', active: true }); });
    });
    return db;
  }

  /* ---------- Engine ---------- */
  function Engine(db, opt) { this.db = db; opt = opt || {}; this.now = opt.now || function () { return new Date(); }; this.onChange = opt.onChange || function () { }; }
  var P = Engine.prototype;
  P.iso = function () { return this.now().toISOString(); };
  P.eventTime = function (value) { if (!value) return null; var ms = new Date(value).getTime(), now = this.now().getTime(); if (!isFinite(ms) || ms > now + 5 * 60000 || ms < now - 90 * 86400000) throw E('VALIDATION_FAILED', 'Offline transaction time is invalid or outside the permitted 90-day window.'); return new Date(ms).toISOString(); };
  P.dayKey = function (d) { d = d || this.now(); return new Date(d.getTime() + this.db.settings.timezone_offset_min * 60000).toISOString().slice(0, 10); };
  P.id = function (prefix) { var d = this.dayKey().replace(/-/g, ''), k = prefix + d, c = this.db.meta.counters; c[k] = (c[k] || 0) + 1; return prefix + '-' + d + '-' + pad(c[k], 4); };
  P.find = function (t, id) { var a = this.db[t]; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; };
  P.must = function (t, id, code) { var r = this.find(t, id); if (!r) throw E(code || 'NOT_FOUND', t + ' not found: ' + id); return r; };
  P.rate = function (pair) { for (var i = this.db.rates.length - 1; i >= 0; i--) if (this.db.rates[i].pair === pair) return this.db.rates[i].rate; return null; };
  P.rateRecord = function (pair, id) { if (id) { var r = this.find('rates', id); if (!r || r.pair !== pair) throw E('RATE_NOT_FOUND', 'The saved exchange rate is no longer available. Refresh and retry.'); return r; } for (var i = this.db.rates.length - 1; i >= 0; i--) if (this.db.rates[i].pair === pair) return this.db.rates[i]; return null; };
  P.permsOf = function (u) { var r = this.db.roles[u.role]; return r.perms.indexOf('*') >= 0 ? ALL_PERMS.slice() : r.perms; };
  P.need = function (u, perm) { if (this.permsOf(u).indexOf(perm) < 0) throw E('PERMISSION_DENIED', 'You do not have permission: ' + perm); };
  P.audit = function (u, action, entity, eid, oldv, newv, reason) { this.db.audit.push({ id: this.id('AUD'), at: this.iso(), user_id: u ? u.id : 'SYSTEM', user: u ? u.full_name : 'SYSTEM', action: action, entity: entity, entity_id: eid, old: oldv == null ? null : oldv, new: newv == null ? null : newv, reason: reason || null }); };
  P.bal = function (pid, loc) { var b = this.db.balances; for (var i = 0; i < b.length; i++) if (b[i].product_id === pid && b[i].loc === loc) return b[i]; var n = { product_id: pid, loc: loc, qty: 0 }; b.push(n); return n; };
  P.qty = function (pid, loc) { var b = this.db.balances; for (var i = 0; i < b.length; i++) if (b[i].product_id === pid && b[i].loc === loc) return b[i].qty; return 0; };
  /* every stock change goes through here; negative balances are refused, never silently created */
  P.move = function (u, pid, type, from, to, qty, reason, ref) {
    if (!(qty > 0) || Math.floor(qty) !== qty) throw E('VALIDATION_FAILED', 'Quantity must be a whole number above 0');
    if (from && this.qty(pid, from) < qty) throw E('INSUFFICIENT_STOCK', 'Not enough stock for ' + pid + ' (have ' + this.qty(pid, from) + ', need ' + qty + ')');
    if (from) this.bal(pid, from).qty -= qty; if (to) this.bal(pid, to).qty += qty;
    this.db.movements.push({ id: this.id('MOV'), product_id: pid, type: type, from: from, to: to, qty: qty, reason: reason || null, ref: ref || null, at: this.iso(), by: u ? u.id : 'SYSTEM' });
  };
  P.held = function (pid) { var t = 0, b = this.db.balances; for (var i = 0; i < b.length; i++) if (b[i].product_id === pid && b[i].loc.indexOf('BRANCH:') === 0) t += b[i].qty; return t; };
  P.customerCreditOutstanding = function (cid) {
    var t = 0, i, s = this.db.sales, p = this.db.payments;
    for (i = 0; i < s.length; i++) if (s[i].customer_id === cid && s[i].source !== 'BRANCH_COLLECTION' && s[i].status === 'ACTIVE' && s[i].payment_status === 'CREDIT') t += s[i].total_usd_cents;
    for (i = 0; i < p.length; i++) if (p[i].party_id === cid && ek(p[i]) === 'CREDIT_REPAYMENT') t -= p[i].usd_cents;
    return Math.max(0, t);
  };
  P.branchOutstanding = function (cid) {
    var self = this, t = 0;
    (this.db.reconPeriods || []).forEach(function (per) { if (per.customer_id === cid) t += self.periodView(per).balance_usd_cents; });
    return Math.max(0, t);
  };
  P.outstanding = function (cid) { return this.customerCreditOutstanding(cid) + this.branchOutstanding(cid); };
  P.slsh = function (usdCents, rate) { return Math.round(usdCents * rate / 100); };

  /* ---------- auth ---------- */
  P.userByName = function (n) { n = String(n || '').trim().toLowerCase(); return this.db.users.filter(function (u) { return u.username === n; })[0] || null; };
  P.login = function (p) {
    var u = this.userByName(p.username), t = this.now().getTime();
    if (!u || u.status !== 'active') throw E('INVALID_CREDENTIALS', 'Wrong username or password');
    if (u.locked_until > t) throw E('LOCKED', 'Account temporarily locked. Try again later.');
    if (!u.password_hash) throw E('NEEDS_SETUP', 'Create a password using your one-time setup code');
    if (hashPw(u.salt, String(p.password || '')) !== u.password_hash) { u.failed++; if (u.failed >= 5) { u.locked_until = t + 600000; u.failed = 0; } this.audit(u, 'LOGIN_FAILED', 'User', u.id); this.onChange(); throw E('INVALID_CREDENTIALS', 'Wrong username or password'); }
    u.failed = 0; return this.startSession(u);
  };
  function normCode(c) { return String(c || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); }
  /* First password can only be created with a one-time setup code issued by an owner (never guessable from the public repo). */
  P.setup = function (p) {
    var u = this.userByName(p.username), t = this.now().getTime(), bad = E('INVALID_CREDENTIALS', 'Setup code is not valid or has expired');
    if (!u || u.status !== 'active' || u.password_hash || !u.setup_hash || u.setup_expires < t) throw bad;
    if (sha256(u.setup_salt + normCode(p.setup_code)) !== u.setup_hash) {
      u.setup_failed = (u.setup_failed || 0) + 1; if (u.setup_failed >= 5) { u.setup_hash = null; u.setup_salt = null; }
      this.audit(u, 'SETUP_FAILED', 'User', u.id); this.onChange(); throw bad;
    }
    if (String(p.password || '').length < 8) throw E('VALIDATION_FAILED', 'Password must be at least 8 characters');
    u.salt = randHex(8); u.password_hash = hashPw(u.salt, p.password); u.setup_hash = null; u.setup_salt = null; u.setup_expires = 0; u.setup_failed = 0;
    this.audit(u, 'PASSWORD_SET', 'User', u.id); return this.startSession(u);
  };
  /* Issue (or reset) a one-time setup code. Plaintext is returned once and never stored. */
  P.issueSetupCode = function (actor, username) {
    var u = this.userByName(username); if (!u || u.status !== 'active') throw E('NOT_FOUND', 'User not found');
    var code = randHex(5).toUpperCase(), shown = code.slice(0, 5) + '-' + code.slice(5);
    u.setup_salt = randHex(8); u.setup_hash = sha256(u.setup_salt + code); u.setup_expires = this.now().getTime() + 72 * 3600000; u.setup_failed = 0;
    u.password_hash = null; u.salt = null; u.failed = 0; u.locked_until = 0; this.db.sessions = this.db.sessions.filter(function (x) { return x.user_id !== u.id; });
    this.audit(actor, 'SETUP_CODE_ISSUED', 'User', u.id); this.onChange(); return { username: u.username, code: shown, expires_hours: 72 };
  };
  P.startSession = function (u) {
    var tok = randHex(24), nowT = this.now().getTime(); this.db.sessions = this.db.sessions.filter(function (x) { return x.expires > nowT; }); this.db.sessions.push({ hash: sha256(tok), user_id: u.id, expires: this.now().getTime() + 12 * 3600000 });
    this.audit(u, 'LOGIN', 'User', u.id); this.onChange(); return { token: tok, user: { id: u.id, name: u.full_name, role: u.role } };
  };
  P.session = function (tok) {
    if (!tok) throw E('UNAUTHENTICATED', 'Please sign in'); var h = sha256(tok), t = this.now().getTime(), s = this.db.sessions;
    for (var i = 0; i < s.length; i++) if (s[i].hash === h) { if (s[i].expires < t) throw E('SESSION_EXPIRED', 'Session expired'); var u = this.find('users', s[i].user_id); if (!u || u.status !== 'active') throw E('UNAUTHENTICATED', 'Account inactive'); return u; }
    throw E('UNAUTHENTICATED', 'Please sign in');
  };

  /* ---------- actions ---------- */
  var A = {};
  function def(name, perm, write, fn) { A[name] = { perm: perm, write: write, fn: fn }; }

  def('auth.me', null, false, function (u) { return { id: u.id, name: u.full_name, role: u.role, perms: this.permsOf(u) }; });
  def('auth.logout', null, false, function (u, p, req) { var h = sha256(req.token); this.db.sessions = this.db.sessions.filter(function (s) { return s.hash !== h; }); this.audit(u, 'LOGOUT', 'User', u.id); return {}; });

  def('data.snapshot', null, false, function (u) {
    var self = this, perms = this.permsOf(u), fin = perms.indexOf('finance.view') >= 0, dmin = this.db.settings.default_min_stock;
    var products = this.db.products.map(function (p) {
      var o = { id: p.id, sku: p.sku, legacy_id: p.legacy_id, supplier_id: p.supplier_id, name: p.name, category: p.category, variant_tag: p.variant_tag, model: p.model, status: p.status, price_usd_cents: p.price_usd_cents,
        min_stock: p.min_stock == null ? dmin : p.min_stock, available: self.qty(p.id, 'AVAILABLE'), held: self.held(p.id) };
      if (fin) { o.cost_usd_cents = p.cost_usd_cents; o.cost_aed_minor = p.cost_aed_minor; } return o;
    });
    var now = this.now().getTime();
    var items = this.db.collItems.slice(-800).map(function (it) {
      var c = self.find('collections', it.collection_id), age = now - new Date(c.collected_at).getTime();
      return { id: it.id, collection_id: it.collection_id, branch_id: c.branch_id, product_id: it.product_id, qty: it.qty, status: it.status, collected_at: c.collected_at,
        assistant: (self.find('people', c.assistant_id) || {}).name, technician: (self.find('people', c.technician_id) || {}).name, age_hours: Math.floor(age / 3600000),
        overdue: it.status === 'PENDING' && age > OVERDUE_MS, inspection: self.db.inspections.filter(function (x) { return x.item_id === it.id; }).pop() || null };
    });
    return { me: { id: u.id, name: u.full_name, role: u.role, perms: perms }, settings: this.db.settings, products: products,
      customers: this.db.customers.map(function (c) { var o = {}; for (var k in c) o[k] = c[k]; o.customer_credit_outstanding_usd_cents = self.customerCreditOutstanding(c.id); o.branch_reconciliation_outstanding_usd_cents = self.branchOutstanding(c.id); o.outstanding_usd_cents = o.customer_credit_outstanding_usd_cents + o.branch_reconciliation_outstanding_usd_cents; return o; }),
      rates: { USD_SLSH: this.rate('USD_SLSH'), AED_USD: this.rate('AED_USD') }, rateHistory: this.db.rates.slice(-20).reverse(),
      methods: this.db.methods.filter(function (m) { return m.enabled; }), branches: this.db.branches, people: this.db.people, collItems: items,
      suppliers: perms.indexOf('purchasing.view') < 0 ? [] : this.db.suppliers.map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; var b = self.supplierBalances(x.id); o.payable_usd_cents = b.payable; o.prepaid_usd_cents = b.prepaid; return o; }),
      users: perms.indexOf('users.manage') >= 0 ? this.db.users.map(function (x) { return { id: x.id, full_name: x.full_name, username: x.username, role: x.role, status: x.status, has_password: !!x.password_hash }; }) : [] };
  });

  def('dashboard.get', null, false, function (u) {
    var self = this, perms = this.permsOf(u), fin = perms.indexOf('finance.view') >= 0, today = this.dayKey(), month = today.slice(0, 7), now = this.now().getTime();
    var d = { today_sales_usd: 0, today_txns: 0, month_sales_usd: 0, month_gross_profit_usd: 0, stock_value_usd: 0, low_stock: [], out_of_stock: [], customer_owed_usd: 0, branch_held_units: 0, pending_items: 0, overdue_items: 0, recent_sales: [] };
    this.db.sales.forEach(function (s) {
      if (s.status !== 'ACTIVE' || s.source === 'BRANCH_COLLECTION' && false) return; var k = self.dayKey(new Date(s.at));
      if (k === today) { d.today_sales_usd += s.total_usd_cents; d.today_txns++; } if (k.slice(0, 7) === month) { d.month_sales_usd += s.total_usd_cents; d.month_gross_profit_usd += s.total_usd_cents - s.cost_usd_cents; } });
    this.db.products.forEach(function (p) {
      if (p.status !== 'active') return; var a = self.qty(p.id, 'AVAILABLE'), mn = p.min_stock == null ? self.db.settings.default_min_stock : p.min_stock, h = self.held(p.id);
      d.stock_value_usd += a * p.cost_usd_cents; d.branch_held_units += h;
      if (a === 0) d.out_of_stock.push({ id: p.id, name: p.name }); else if (a <= mn) d.low_stock.push({ id: p.id, name: p.name, available: a, min: mn }); });
    this.db.customers.forEach(function (c) { var o = self.outstanding(c.id); if (o > 0) d.customer_owed_usd += o; });
    this.db.collItems.forEach(function (it) { if (it.status !== 'PENDING') return; d.pending_items += it.qty; var c = self.find('collections', it.collection_id); if (now - new Date(c.collected_at).getTime() > OVERDUE_MS) d.overdue_items += it.qty; });
    d.recent_sales = this.db.sales.slice(-8).reverse().map(function (s) { return { id: s.id, at: s.at, total_usd_cents: s.total_usd_cents, customer: (self.find('customers', s.customer_id) || {}).name, status: s.payment_status, source: s.source }; });
    if (!fin) { delete d.month_gross_profit_usd; delete d.stock_value_usd; } return d;
  });

  def('rates.set', 'rates.update', true, function (u, p) {
    var pair = p.pair, r = Number(p.rate); if (['USD_SLSH', 'AED_USD'].indexOf(pair) < 0) throw E('VALIDATION_FAILED', 'Unknown currency pair'); if (!(r > 0)) throw E('VALIDATION_FAILED', 'Rate must be above 0');
    var prev = this.rate(pair); this.db.rates.push({ id: this.id('RATE'), pair: pair, rate: r, previous: prev, effective_at: this.iso(), by: u.full_name }); this.audit(u, 'RATE_CHANGED', 'ExchangeRate', pair, prev, r); return { pair: pair, rate: r };
  });

  def('products.setPrice', 'price.update', true, function (u, p) {
    var pr = this.must('products', p.product_id), c = Number(p.price_usd_cents); if (!(c > 0) || Math.floor(c) !== c) throw E('VALIDATION_FAILED', 'Invalid price');
    var old = pr.price_usd_cents; pr.price_usd_cents = c; this.audit(u, 'PRICE_CHANGED', 'Product', pr.id, old, c, p.reason); return { id: pr.id, price_usd_cents: c };
  });
  def('products.create', 'inventory.manage', true, function (u, p) {
    if (!p.name || !p.category) throw E('VALIDATION_FAILED', 'Name and category are required');
    var id = nextSku(this.db, String(p.category).trim());
    var aed = Math.round(Number(p.cost_aed || 0) * 100), rate = this.rate('AED_USD'), price = Math.round(Number(p.price_usd) * 100); if (!(rate > 0)) throw E('RATE_NOT_SET', 'AED/USD rate is not set'); if (!(price > 0)) throw E('VALIDATION_FAILED', 'Selling price required');
    var pr = { id: id, sku: id, legacy_id: null, name: p.name, supplier_item_name: p.name, category: String(p.category).trim(), variant_tag: p.variant_tag || '', model: p.model || '', model_is_derived: false, cost_aed_minor: aed, aed_usd_rate_snapshot: rate, cost_usd_cents: Math.round(aed / rate), price_usd_cents: price, min_stock: p.min_stock == null || p.min_stock === '' ? null : Number(p.min_stock), supplier_id: p.supplier_id || null, status: 'active' };
    this.db.products.push(pr); this.audit(u, 'PRODUCT_CREATED', 'Product', id, null, { name: p.name, price_usd_cents: price }); return pr;
  });
  def('products.setStatus', 'inventory.manage', true, function (u, p) { var pr = this.must('products', p.product_id), old = pr.status; pr.status = p.status === 'inactive' ? 'inactive' : 'active'; this.audit(u, 'PRODUCT_STATUS', 'Product', pr.id, old, pr.status, p.reason); return {}; });
  def('stock.adjust', 'stock.adjust', true, function (u, p) {
    var pr = this.must('products', p.product_id), d = Number(p.delta); if (!p.reason || String(p.reason).trim().length < 3) throw E('VALIDATION_FAILED', 'A reason is required');
    if (!d || Math.floor(d) !== d) throw E('VALIDATION_FAILED', 'Adjustment must be a non-zero whole number'); var before = this.qty(pr.id, 'AVAILABLE');
    if (d > 0) this.move(u, pr.id, 'ADJUSTMENT', null, 'AVAILABLE', d, p.reason, 'ADJ'); else this.move(u, pr.id, 'ADJUSTMENT', 'AVAILABLE', null, -d, p.reason, 'ADJ');
    this.audit(u, 'STOCK_ADJUSTED', 'Product', pr.id, before, before + d, p.reason); return { available: before + d };
  });
  def('stock.movements', 'inventory.view', false, function (u, p) { return this.db.movements.filter(function (m) { return m.product_id === p.product_id; }).slice(-60).reverse(); });

  def('customers.create', 'customers.create', true, function (u, p) {
    if (!p.name || !String(p.name).trim()) throw E('VALIDATION_FAILED', 'Name required'); if (['WALK_IN', 'TECHNICIAN', 'BUSINESS'].indexOf(p.category) < 0) throw E('VALIDATION_FAILED', 'Invalid category');
    var c = { id: this.id('CUS'), name: String(p.name).trim(), phone: p.phone || '', category: p.category, address: p.address || '', notes: p.notes || '', credit_approved: false, credit_limit_usd_cents: 0, status: 'active' };
    this.db.customers.push(c); this.audit(u, 'CUSTOMER_CREATED', 'Customer', c.id, null, { name: c.name, category: c.category }); return c;
  });
  def('customers.setCredit', 'credit.approve', true, function (u, p) {
    var c = this.must('customers', p.customer_id), old = { approved: c.credit_approved, limit: c.credit_limit_usd_cents }; c.credit_approved = !!p.approved; c.credit_limit_usd_cents = Math.max(0, Math.round(Number(p.limit_usd || 0) * 100));
    this.audit(u, 'CREDIT_CHANGED', 'Customer', c.id, old, { approved: c.credit_approved, limit: c.credit_limit_usd_cents }, p.reason); return c;
  });
  def('payments.recordRepayment', 'payments.record', true, function (u, p) {
    var c = this.must('customers', p.customer_id), m = this.must('methods', p.method_id, 'VALIDATION_FAILED'); if (m.id === 'CREDIT' || !m.enabled) throw E('VALIDATION_FAILED', 'Invalid payment method');
    var amt = Math.round(Number(p.amount) * (m.currency === 'USD' ? 100 : 1)); if (!(amt > 0)) throw E('VALIDATION_FAILED', 'Amount required');
    var rateRec = this.rateRecord('USD_SLSH', p.rate_id), rate = rateRec && rateRec.rate; if (m.currency === 'SLSH' && !rate) throw E('RATE_NOT_SET', 'USD/SLSH rate is not set'); var usd = m.currency === 'USD' ? amt : Math.round(amt * 100 / rate), owed = this.customerCreditOutstanding(c.id);
    if (usd > owed) throw E('VALIDATION_FAILED', 'Payment is more than the outstanding balance');
    var pay = { id: this.id('PAY'), direction: 'IN', party_type: 'CUSTOMER', party_id: c.id, kind: 'CREDIT_REPAYMENT', method_id: m.id, currency: m.currency, amount_minor: amt, usd_cents: usd, rate_usd_slsh: rate, rate_id: rateRec && rateRec.id, at: this.iso(), offline_at: this.eventTime(p.offline_at), synced_at: this.iso(), by: u.id, reference: p.reference || '' };
    this.db.payments.push(pay); this.audit(u, 'PAYMENT_RECEIVED', 'Payment', pay.id, null, { customer: c.id, usd_cents: usd }); return pay;
  });

  /* POS sale: price/total/stock all computed here, never trusted from the client */
  def('sales.create', 'sales.create', true, function (u, p) {
    var self = this, cust = this.must('customers', p.customer_id || 'CUS-WALKIN'), m = this.must('methods', p.method_id, 'VALIDATION_FAILED'), want = {};
    if (!m.enabled) throw E('VALIDATION_FAILED', 'Payment method is disabled'); if (!p.items || !p.items.length) throw E('VALIDATION_FAILED', 'Cart is empty');
    p.items.forEach(function (i) { var q = Number(i.qty); if (!(q > 0) || Math.floor(q) !== q) throw E('VALIDATION_FAILED', 'Invalid quantity'); want[i.product_id] = (want[i.product_id] || 0) + q; });
    var lines = [], total = 0, cost = 0;
    Object.keys(want).forEach(function (pid) { var pr = self.must('products', pid); if (pr.status !== 'active') throw E('VALIDATION_FAILED', pr.name + ' is inactive');
      if (self.qty(pid, 'AVAILABLE') < want[pid]) throw E('INSUFFICIENT_STOCK', pr.name + ': only ' + self.qty(pid, 'AVAILABLE') + ' available');
      lines.push({ pr: pr, qty: want[pid] }); total += pr.price_usd_cents * want[pid]; cost += pr.cost_usd_cents * want[pid]; });
    var rateRec = this.rateRecord('USD_SLSH', p.rate_id), rate = rateRec && rateRec.rate; if (m.currency === 'SLSH' && !rate) throw E('RATE_NOT_SET', 'USD/SLSH rate is not set');
    var status = 'PAID';
    if (m.id === 'CREDIT') {
      if (!cust.credit_approved) throw E('CREDIT_NOT_APPROVED', cust.name + ' is not approved for credit');
      if (cust.credit_limit_usd_cents > 0 && this.customerCreditOutstanding(cust.id) + total > cust.credit_limit_usd_cents) throw E('CREDIT_LIMIT_EXCEEDED', 'Credit limit would be exceeded'); status = 'CREDIT';
    }
    var sale = { id: this.id('SAL'), customer_id: cust.id, at: this.iso(), source: 'POS', offline_at: this.eventTime(p.offline_at), rate_id: rateRec && rateRec.id, rate_usd_slsh: rate, total_usd_cents: total, cost_usd_cents: cost, payment_status: status, payment_method: m.id, status: 'ACTIVE', by: u.id, by_name: u.full_name, synced_at: this.iso() };
    this.db.sales.push(sale);
    lines.forEach(function (l) { self.db.saleItems.push({ id: self.id('SIT'), sale_id: sale.id, product_id: l.pr.id, name: l.pr.name, qty: l.qty, unit_price_usd_cents: l.pr.price_usd_cents, unit_cost_usd_cents: l.pr.cost_usd_cents, collection_item_id: null });
      self.move(u, l.pr.id, 'SALE', 'AVAILABLE', null, l.qty, null, sale.id); });
    var pay = null;
    if (m.id !== 'CREDIT') { var amt = m.currency === 'USD' ? total : this.slsh(total, rate); pay = { id: this.id('PAY'), direction: 'IN', party_type: 'CUSTOMER', party_id: cust.id, kind: 'SALE_PAYMENT', ref: sale.id, method_id: m.id, currency: m.currency, amount_minor: amt, usd_cents: total, rate_usd_slsh: rate, rate_id: rateRec && rateRec.id, at: this.iso(), offline_at: sale.offline_at, synced_at: this.iso(), by: u.id }; this.db.payments.push(pay); }
    this.audit(u, 'SALE_CREATED', 'Sale', sale.id, null, { total_usd_cents: total, method: m.id }); return { sale: sale, payment: pay };
  });

  /* ---------- branch collections ---------- */
  def('branch.collect', 'branch.collect', true, function (u, p) {
    var self = this, br = this.must('branches', p.branch_id), asst = this.must('people', p.assistant_id), tech = this.must('people', p.technician_id), want = {};
    if (asst.branch_id !== br.id || asst.role !== 'ASSISTANT') throw E('VALIDATION_FAILED', 'Assistant does not belong to this branch'); if (tech.branch_id !== br.id || tech.role !== 'TECHNICIAN') throw E('VALIDATION_FAILED', 'Technician does not belong to this branch');
    if (!p.items || !p.items.length) throw E('VALIDATION_FAILED', 'Add at least one product');
    p.items.forEach(function (i) { var q = Number(i.qty); if (!(q > 0) || Math.floor(q) !== q) throw E('VALIDATION_FAILED', 'Invalid quantity'); var pr = self.must('products', i.product_id); if (pr.status !== 'active') throw E('VALIDATION_FAILED', pr.name + ' is inactive'); want[i.product_id] = (want[i.product_id] || 0) + q; });
    Object.keys(want).forEach(function (pid) { if (self.qty(pid, 'AVAILABLE') < want[pid]) throw E('INSUFFICIENT_STOCK', self.must('products', pid).name + ': only ' + self.qty(pid, 'AVAILABLE') + ' available'); });
    var colId = p.client_collection_id && /^[A-Za-z0-9_.:-]{6,80}$/.test(p.client_collection_id) ? p.client_collection_id : this.id('COL'); if (this.find('collections', colId)) throw E('DUPLICATE_ID', 'Collection ID already exists'); var col = { id: colId, customer_id: br.customer_id, branch_id: br.id, assistant_id: asst.id, technician_id: tech.id, collected_at: this.eventTime(p.offline_at) || this.iso(), synced_at: this.iso(), by: u.id }; this.db.collections.push(col);
    Object.keys(want).forEach(function (pid) { var reqItem = (p.items || []).filter(function (x) { return x.product_id === pid; })[0] || {}; var itemId = reqItem.client_item_id && /^[A-Za-z0-9_.:-]{6,80}$/.test(reqItem.client_item_id) ? reqItem.client_item_id : self.id('CIT'); if (self.find('collItems', itemId)) throw E('DUPLICATE_ID', 'Collection item ID already exists'); var it = { id: itemId, collection_id: col.id, product_id: pid, qty: want[pid], status: 'PENDING', parent_id: null }; self.db.collItems.push(it);
      self.move(u, pid, 'BRANCH_COLLECTION', 'AVAILABLE', 'BRANCH:' + br.id, want[pid], null, col.id); });
    this.audit(u, 'BRANCH_COLLECTION', 'Collection', col.id, null, { branch: br.id, items: want }); return col;
  });
  P.age = function (it) { return this.now().getTime() - new Date(this.find('collections', it.collection_id).collected_at).getTime(); };
  P.splitItem = function (it, qty, clientId) {
    if (!(qty > 0) || Math.floor(qty) !== qty || qty > it.qty) throw E('VALIDATION_FAILED', 'Quantity must be between 1 and ' + it.qty);
    if (qty === it.qty) return it; var splitId = clientId && /^[A-Za-z0-9_.:-]{6,80}$/.test(clientId) ? clientId : this.id('CIT'); if (this.find('collItems', splitId)) throw E('DUPLICATE_ID', 'Collection item ID already exists'); it.qty -= qty; var n = { id: splitId, collection_id: it.collection_id, product_id: it.product_id, qty: qty, status: it.status, parent_id: it.id }; this.db.collItems.push(n); return n;
  };
  P.hist = function (u, it, prev, next, reason, type) { this.db.history.push({ id: this.id('HST'), item_id: it.id, previous: prev, next: next, by: u.id, by_name: u.full_name, at: this.iso(), reason: reason || null, type: type || 'NORMAL' }); };
  /* Sold: stock already left Available at collection, so only branch-held is reduced. No second deduction. */
  P.markSold = function (u, it, reason, type, rateId, offlineAt) {
    var col = this.find('collections', it.collection_id), pr = this.must('products', it.product_id), rr = this.rateRecord('USD_SLSH', rateId), rate = rr && rr.rate, prev = it.status;
    this.move(u, it.product_id, 'BRANCH_SOLD', 'BRANCH:' + col.branch_id, null, it.qty, reason, it.id);
    it.status = 'SOLD'; this.hist(u, it, prev, 'SOLD', reason, type);
    for (var i = 0; i < this.db.saleItems.length; i++) if (this.db.saleItems[i].collection_item_id === it.id) throw E('DUPLICATE_SALE', 'Item already billed');
    var sale = { id: this.id('SAL'), customer_id: col.customer_id, at: this.iso(), offline_at: this.eventTime(offlineAt), source: 'BRANCH_COLLECTION', branch_id: col.branch_id, rate_id: rr && rr.id, rate_usd_slsh: rate, synced_at: this.iso(), total_usd_cents: pr.price_usd_cents * it.qty, cost_usd_cents: pr.cost_usd_cents * it.qty, payment_status: 'CREDIT', payment_method: 'BRANCH_ACCOUNT', status: 'ACTIVE', invoice_id: null, by: u.id, by_name: u.full_name };
    this.db.sales.push(sale); this.db.saleItems.push({ id: this.id('SIT'), sale_id: sale.id, product_id: pr.id, name: pr.name, qty: it.qty, unit_price_usd_cents: pr.price_usd_cents, unit_cost_usd_cents: pr.cost_usd_cents, collection_item_id: it.id });
    return sale;
  };
  def('branch.setItemStatus', 'branch.setStatus', true, function (u, p) {
    var it = this.must('collItems', p.item_id); if (it.status !== 'PENDING') throw E('VALIDATION_FAILED', 'Only pending items can be updated'); if (['SOLD', 'RETURN_REPORTED'].indexOf(p.status) < 0) throw E('VALIDATION_FAILED', 'Invalid status');
    if (this.age(it) > OVERDUE_MS) throw E('OVERDUE_REVIEW_REQUIRED', 'Item is overdue. A manager or owner must review it.');
    var part = this.splitItem(it, Number(p.qty || it.qty), p.client_split_item_id);
    if (p.status === 'SOLD') this.markSold(u, part, p.reason, null, p.rate_id, p.offline_at || null); else { var prev = part.status; part.status = 'RETURN_REPORTED'; this.hist(u, part, prev, 'RETURN_REPORTED', p.reason); }
    this.audit(u, 'BRANCH_ITEM_' + p.status, 'CollectionItem', part.id, 'PENDING', p.status); return part;
  });
  def('branch.inspectReturn', 'branch.inspect', true, function (u, p) {
    var it = this.must('collItems', p.item_id); if (it.status !== 'RETURN_REPORTED') throw E('VALIDATION_FAILED', 'Item is not awaiting inspection'); if (['RESTOCK', 'REJECT'].indexOf(p.result) < 0) throw E('VALIDATION_FAILED', 'Result must be RESTOCK or REJECT');
    this.db.inspections.push({ id: this.id('INS'), item_id: it.id, result: p.result, notes: p.notes || '', by: u.id, by_name: u.full_name, at: this.iso() }); it.status = 'RETURN_INSPECTED'; this.hist(u, it, 'RETURN_REPORTED', 'RETURN_INSPECTED', p.notes);
    this.audit(u, 'RETURN_INSPECTED', 'CollectionItem', it.id, null, p.result, p.notes); return it;
  });
  /* Approval is the only place returned stock goes back to Available, and only once. */
  def('branch.approveReturn', 'branch.approve', true, function (u, p) {
    var it = this.must('collItems', p.item_id); if (it.status !== 'RETURN_INSPECTED') throw E('VALIDATION_FAILED', 'Item has not been inspected'); var ins = this.db.inspections.filter(function (x) { return x.item_id === it.id; }).pop(), col = this.find('collections', it.collection_id);
    if (ins.result === 'RESTOCK') { this.move(u, it.product_id, 'RETURN_APPROVED', 'BRANCH:' + col.branch_id, 'AVAILABLE', it.qty, p.notes, it.id); it.status = 'RETURNED_APPROVED'; this.hist(u, it, 'RETURN_INSPECTED', 'RETURNED_APPROVED', p.notes); }
    else { it.status = 'RETURN_REJECTED'; this.hist(u, it, 'RETURN_INSPECTED', 'RETURN_REJECTED', p.notes); }
    this.audit(u, 'RETURN_APPROVED', 'CollectionItem', it.id, 'RETURN_INSPECTED', it.status, p.notes); return it;
  });
  def('branch.reviewOverdue', 'branch.approve', true, function (u, p) {
    var it = this.must('collItems', p.item_id); if (it.status !== 'PENDING' || this.age(it) <= OVERDUE_MS) throw E('VALIDATION_FAILED', 'Item is not an overdue pending item');
    if (!p.reason || String(p.reason).trim().length < 3) throw E('VALIDATION_FAILED', 'A reason is required'); if (['SOLD', 'RETURN_REPORTED', 'KEEP_PENDING'].indexOf(p.decision) < 0) throw E('VALIDATION_FAILED', 'Invalid decision');
    if (p.decision === 'KEEP_PENDING') { this.hist(u, it, 'PENDING', 'PENDING', p.reason, 'OVERDUE_REVIEW'); }
    else { var part = this.splitItem(it, Number(p.qty || it.qty), p.client_split_item_id); if (p.decision === 'SOLD') this.markSold(u, part, p.reason, 'OVERDUE_REVIEW', p.rate_id, p.offline_at || null); else { part.status = 'RETURN_REPORTED'; this.hist(u, part, 'PENDING', 'RETURN_REPORTED', p.reason, 'OVERDUE_REVIEW'); } }
    this.audit(u, 'OVERDUE_REVIEWED', 'CollectionItem', it.id, 'PENDING', p.decision, p.reason); return {};
  });
  def('audit.list', 'audit.view', false, function () { return this.db.audit.slice(-300).reverse(); });
  def('item.history', 'branch.view', false, function (u, p) { return this.db.history.filter(function (h) { return h.item_id === p.item_id; }); });

  /* =====================  v2 ENGINE: money, suppliers, purchasing, reconciliation, expenses, reports, insights, staff  ===================== */
  function ek(p) { return p.kind === 'REVERSAL' ? p.reverses_kind : p.kind; }
  P.docNo = function (prefix) { var d = this.dayKey().replace(/-/g, ''), k = 'DOC' + prefix + d, c = this.db.meta.counters; c[k] = (c[k] || 0) + 1; return prefix + '-' + d + '-' + pad(c[k], 3); };
  P.sumPay = function (fn) { var t = 0, a = this.db.payments; for (var i = 0; i < a.length; i++) if (fn(a[i])) t += a[i].usd_cents; return t; };
  P.inRange = function (iso, from, to) { var k = this.dayKey(new Date(iso)); return (!from || k >= from) && (!to || k <= to); };
  P.endOfDay = function (key) { return new Date(Date.parse(key + 'T23:59:59.999Z') - this.db.settings.timezone_offset_min * 60000).toISOString(); };
  P.salesIn = function (from, to) { var self = this; return this.db.sales.filter(function (s) { return s.status === 'ACTIVE' && self.inRange(s.offline_at || s.at, from, to); }); };
  P.money = function (m, input, rateId) {
    var n = Number(input); if (!(n > 0)) throw E('VALIDATION_FAILED', 'Amount required'); var rr = this.rateRecord('USD_SLSH', rateId), rate = rr && rr.rate; if (m.currency === 'SLSH' && !rate) throw E('RATE_NOT_SET', 'USD/SLSH rate is not set');
    var amt = Math.round(n * (m.currency === 'USD' ? 100 : 1)); return { amt: amt, usd: m.currency === 'USD' ? amt : Math.round(amt * 100 / rate), rate: rate, rate_id: rr && rr.id, currency: m.currency };
  };
  P.payMethod = function (id) { var m = this.must('methods', id, 'VALIDATION_FAILED'); if (m.id === 'CREDIT' || !m.enabled) throw E('VALIDATION_FAILED', 'Invalid payment method'); return m; };
  P.clamp = function (usd, remaining) { if (usd > remaining) { if (usd - remaining <= 5) return remaining; throw E('VALIDATION_FAILED', 'Payment is more than the remaining balance (' + fU(remaining) + ')'); } return usd; };
  P.nm = function (t, id) { var r = this.find(t, id); return r ? (r.name || r.full_name || r.po_no || id) : id; };

  /* ----- product / customer edits ----- */
  def('products.update', 'inventory.manage', true, function (u, p) {
    var pr = this.must('products', p.product_id), old = { name: pr.name, category: pr.category, model: pr.model, variant_tag: pr.variant_tag, min_stock: pr.min_stock, supplier_id: pr.supplier_id };
    if (p.name != null) { if (!String(p.name).trim()) throw E('VALIDATION_FAILED', 'Name required'); pr.name = String(p.name).trim(); } if (p.category != null && String(p.category).trim()) pr.category = String(p.category).trim();
    if (p.model != null) { pr.model = p.model; pr.model_is_derived = false; } if (p.variant_tag != null) pr.variant_tag = p.variant_tag;
    if (p.min_stock !== undefined) pr.min_stock = (p.min_stock === '' || p.min_stock === null) ? null : Math.max(0, Math.floor(Number(p.min_stock)));
    if (p.supplier_id !== undefined) { if (p.supplier_id) this.must('suppliers', p.supplier_id); pr.supplier_id = p.supplier_id || null; }
    this.audit(u, 'PRODUCT_UPDATED', 'Product', pr.id, old, { name: pr.name, category: pr.category, model: pr.model, variant_tag: pr.variant_tag, min_stock: pr.min_stock, supplier_id: pr.supplier_id }); return pr;
  });
  def('customers.update', 'customers.manage', true, function (u, p) {
    var c = this.must('customers', p.customer_id), old = { name: c.name, phone: c.phone, category: c.category }; if (c.system && p.category && p.category !== c.category) throw E('VALIDATION_FAILED', 'System customers keep their category');
    if (p.name != null && String(p.name).trim()) c.name = String(p.name).trim(); ['phone', 'address', 'notes'].forEach(function (k) { if (p[k] != null) c[k] = p[k]; }); if (p.category && ['WALK_IN', 'TECHNICIAN', 'BUSINESS'].indexOf(p.category) >= 0) c.category = p.category;
    this.audit(u, 'CUSTOMER_UPDATED', 'Customer', c.id, old, { name: c.name, phone: c.phone, category: c.category }); return c;
  });
  def('settings.update', 'settings.manage', true, function (u, p) {
    var allowed = { default_min_stock: 'n', reorder_cover_days: 'n', business_name: 's', phone: 's', address: 's', email: 's', website: 's' }, st = this.db.settings, self = this;
    Object.keys(p).forEach(function (k) { if (!allowed[k]) return; var v = allowed[k] === 'n' ? Math.max(0, Math.floor(Number(p[k]))) : String(p[k]); if (allowed[k] === 'n' && isNaN(v)) throw E('VALIDATION_FAILED', 'Invalid number'); var old = st[k]; st[k] = v; self.audit(u, 'SETTING_CHANGED', 'Setting', k, old, v); }); return st;
  });
  def('branches.update', 'settings.manage', true, function (u, p) {
    var b = this.must('branches', p.branch_id), old = { cycle: b.cycle, due: b.due_offset_days }; if (['DAILY', 'WEEKLY'].indexOf(p.cycle) < 0) throw E('VALIDATION_FAILED', 'Cycle must be DAILY or WEEKLY');
    b.cycle = p.cycle; b.due_offset_days = Math.max(0, Math.min(14, Math.floor(Number(p.due_offset_days || 0)))); this.audit(u, 'BRANCH_SCHEDULE_CHANGED', 'Branch', b.id, old, { cycle: b.cycle, due: b.due_offset_days }); return b;
  });
  def('people.save', 'branch.approve', true, function (u, p) {
    var br = this.must('branches', p.branch_id); if (!p.name || !String(p.name).trim()) throw E('VALIDATION_FAILED', 'Name required'); if (['TECHNICIAN', 'ASSISTANT'].indexOf(p.role) < 0) throw E('VALIDATION_FAILED', 'Role must be TECHNICIAN or ASSISTANT');
    var per; if (p.id) { per = this.must('people', p.id); var old = { name: per.name, active: per.active }; per.name = String(p.name).trim(); per.active = p.active !== false; this.audit(u, 'PERSON_UPDATED', 'Person', per.id, old, { name: per.name, active: per.active }); }
    else { var n = this.db.people.filter(function (x) { return x.branch_id === br.id && x.role === p.role; }).length + 1, id = br.id + '-' + p.role[0] + pad(n, 2); while (this.find('people', id)) { n++; id = br.id + '-' + p.role[0] + pad(n, 2); } per = { id: id, branch_id: br.id, name: String(p.name).trim(), role: p.role, active: true }; this.db.people.push(per); this.audit(u, 'PERSON_ADDED', 'Person', per.id, null, { name: per.name, role: per.role }); }
    return per;
  });

  /* ----- reversals (nothing is ever deleted) ----- */
  def('sales.list', 'sales.view', false, function (u, p) {
    var self = this, from = p.from || null, to = p.to || null, items = {}; this.db.saleItems.forEach(function (i) { (items[i.sale_id] = items[i.sale_id] || []).push(i); });
    return this.db.sales.filter(function (s) { return self.inRange(s.offline_at || s.at, from, to); }).slice(-1000).reverse().slice(0, 400).map(function (s) { var c = self.find('customers', s.customer_id) || {}; var o = {}; for (var k in s) o[k] = s[k]; o.customer = c.name; o.customer_category = c.category; o.customer_phone = c.phone; o.items = items[s.id] || []; return o; });
  });
  def('sales.reverse', 'sales.reverse', true, function (u, p) {
    var s = this.must('sales', p.sale_id), self = this; if (s.status !== 'ACTIVE') throw E('VALIDATION_FAILED', 'Sale is already reversed'); if (s.source !== 'POS') throw E('VALIDATION_FAILED', 'Branch sales cannot be reversed here. Use the branch workflow.');
    if (!p.reason || String(p.reason).trim().length < 3) throw E('VALIDATION_FAILED', 'A reason is required');
    this.db.saleItems.filter(function (i) { return i.sale_id === s.id; }).forEach(function (i) { self.move(u, i.product_id, 'SALE_REVERSAL', null, 'AVAILABLE', i.qty, 'Sale ' + s.id + ' reversed: ' + p.reason, s.id); });
    s.status = 'REVERSED'; s.reversed_at = this.iso(); s.reversed_by = u.full_name; s.reverse_reason = p.reason;
    this.db.payments.filter(function (x) { return x.ref === s.id && x.kind === 'SALE_PAYMENT'; }).forEach(function (x) { self.db.payments.push({ id: self.id('PAY'), direction: 'OUT', party_type: x.party_type, party_id: x.party_id, kind: 'REVERSAL', reverses: x.id, reverses_kind: x.kind, ref: s.id, method_id: x.method_id, currency: x.currency, amount_minor: -x.amount_minor, usd_cents: -x.usd_cents, rate_usd_slsh: x.rate_usd_slsh, rate_id: x.rate_id || null, at: self.iso(), offline_at: self.eventTime(p.offline_at), synced_at: self.iso(), by: u.id, reference: 'Reversal: ' + p.reason }); x.reversed = true; });
    this.audit(u, 'SALE_REVERSED', 'Sale', s.id, 'ACTIVE', 'REVERSED', p.reason); return s;
  });
  def('payments.list', 'finance.view', false, function (u, p) {
    var self = this; return this.db.payments.filter(function (x) { return self.inRange(x.offline_at || x.at, p.from || null, p.to || null); }).slice().reverse().slice(0, 500).map(function (x) {
      var party = x.party_type === 'SUPPLIER' ? self.nm('suppliers', x.party_id) : self.nm('customers', x.party_id); var o = {}; for (var k in x) o[k] = x[k]; o.party = party; o.amount_text = x.currency === 'USD' ? fU(x.amount_minor) : fS(x.amount_minor); o.by_name = (self.find('users', x.by) || {}).full_name || x.by; return o; });
  });
  def('payments.reclassifyToBranch', 'finance.reverse', true, function (u, p) {
    var x = this.must('payments', p.payment_id), per = this.must('reconPeriods', p.period_id);
    if (x.kind !== 'CREDIT_REPAYMENT' || x.party_type !== 'CUSTOMER' || x.direction !== 'IN' || x.reversed) throw E('VALIDATION_FAILED', 'Only an active ordinary customer repayment can be reallocated.');
    if (x.party_id !== per.customer_id) throw E('VALIDATION_FAILED', 'The payment and branch report must belong to the same customer.');
    if (!p.reason || String(p.reason).trim().length < 3) throw E('VALIDATION_FAILED', 'A reason is required for historical payment reallocation.');
    var m = this.must('methods', x.method_id), mm, balance = this.periodView(per).balance_usd_cents; if (m.currency !== x.currency) throw E('VALIDATION_FAILED', 'The original payment currency no longer matches its method.');
    if (x.rate_id) mm = this.money(m, p.amount, x.rate_id);
    else if (x.currency === 'USD' || x.rate_usd_slsh > 0) { var nativeAmount = Math.round(Number(p.amount) * (m.currency === 'USD' ? 100 : 1)); if (!(nativeAmount > 0)) throw E('VALIDATION_FAILED', 'Enter an amount greater than zero.'); mm = { amt: nativeAmount, usd: m.currency === 'USD' ? nativeAmount : Math.round(nativeAmount * 100 / x.rate_usd_slsh), rate: x.rate_usd_slsh, rate_id: null }; }
    else throw E('RATE_NOT_FOUND', 'This legacy payment has no stored exchange rate. It requires manual review.');
    if (mm.amt > x.amount_minor || mm.usd > x.usd_cents) throw E('VALIDATION_FAILED', 'The allocated amount cannot exceed the original payment.');
    if (mm.usd > balance) throw E('VALIDATION_FAILED', 'The allocated amount cannot exceed the selected branch report balance (' + fU(balance) + ').');
    if (mm.amt <= 0 || mm.usd <= 0) throw E('VALIDATION_FAILED', 'Enter an amount greater than zero.');
    var remainingMinor = x.amount_minor - mm.amt, remainingUsd = x.usd_cents - mm.usd, branchPay;
    if (remainingMinor === 0 && remainingUsd === 0) {
      x.kind = 'RECON_PAYMENT'; x.ref = per.id; x.reclass_reason = String(p.reason).trim();
      branchPay = x;
    } else {
      x.amount_minor = remainingMinor; x.usd_cents = remainingUsd;
      branchPay = { id: this.id('PAY'), direction: 'IN', party_type: 'CUSTOMER', party_id: x.party_id, kind: 'RECON_PAYMENT', ref: per.id, method_id: x.method_id, currency: x.currency, amount_minor: mm.amt, usd_cents: mm.usd, rate_usd_slsh: x.rate_usd_slsh, rate_id: x.rate_id || null, at: x.at, offline_at: x.offline_at || null, synced_at: this.iso(), by: x.by, reference: x.reference || '', reclassified_from: x.id, reclass_reason: String(p.reason).trim() };
      this.db.payments.push(branchPay);
    }
    this.audit(u, 'PAYMENT_REALLOCATED_TO_BRANCH', 'Payment', x.id, { kind: 'CREDIT_REPAYMENT', amount_minor: mm.amt, usd_cents: mm.usd }, { kind: 'RECON_PAYMENT', period_id: per.id, branch_payment_id: branchPay.id, amount_minor: mm.amt, usd_cents: mm.usd }, p.reason);
    return { original_payment_id: x.id, branch_payment_id: branchPay.id, period: this.periodView(per), ordinary_credit_outstanding_usd_cents: this.customerCreditOutstanding(x.party_id), branch_reconciliation_outstanding_usd_cents: this.branchOutstanding(x.party_id) };
  });
  def('payments.reverse', 'finance.reverse', true, function (u, p) {
    var x = this.must('payments', p.payment_id); if (['CREDIT_REPAYMENT', 'RECON_PAYMENT', 'DEPOSIT', 'BALANCE'].indexOf(x.kind) < 0) throw E('VALIDATION_FAILED', 'This payment type cannot be reversed here'); if (x.reversed) throw E('VALIDATION_FAILED', 'Already reversed');
    if (!p.reason || String(p.reason).trim().length < 3) throw E('VALIDATION_FAILED', 'A reason is required');
    x.reversed = true; this.db.payments.push({ id: this.id('PAY'), direction: x.direction === 'IN' ? 'OUT' : 'IN', party_type: x.party_type, party_id: x.party_id, kind: 'REVERSAL', reverses: x.id, reverses_kind: x.kind, ref: x.ref, method_id: x.method_id, currency: x.currency, amount_minor: -x.amount_minor, usd_cents: -x.usd_cents, rate_usd_slsh: x.rate_usd_slsh, rate_id: x.rate_id || null, at: this.iso(), offline_at: this.eventTime(p.offline_at), synced_at: this.iso(), by: u.id, reference: 'Reversal: ' + p.reason });
    this.audit(u, 'PAYMENT_REVERSED', 'Payment', x.id, x.usd_cents, 0, p.reason); return {};
  });
  def('customers.statement', 'customers.view', false, function (u, p) {
    var c = this.must('customers', p.customer_id), self = this, rows = [];
    this.db.sales.forEach(function (s) {
      if (s.customer_id === c.id && s.source !== 'BRANCH_COLLECTION' && s.status === 'ACTIVE' && s.payment_status === 'CREDIT')
        rows.push({ at: s.offline_at || s.at, type: 'Customer credit sale', ref: s.id, debit: s.total_usd_cents, credit: 0, ledger: 'CUSTOMER_CREDIT' });
    });
    this.db.reconPeriods.forEach(function (per) {
      if (per.customer_id !== c.id) return;
      var view = self.periodView(per);
      if (view.total_usd_cents > 0) rows.push({ at: per.created_at, type: 'Branch reconciliation invoice · ' + self.nm('branches', per.branch_id), ref: per.invoice_no || per.id, debit: view.total_usd_cents, credit: 0, ledger: 'BRANCH_RECONCILIATION' });
    });
    this.db.payments.forEach(function (x) {
      if (x.party_id !== c.id || ['CREDIT_REPAYMENT', 'RECON_PAYMENT'].indexOf(ek(x)) < 0) return;
      var isRecon = ek(x) === 'RECON_PAYMENT';
      rows.push({ at: x.offline_at || x.at, type: isRecon ? (x.kind === 'REVERSAL' ? 'Branch report payment reversed' : 'Branch report payment') : (x.kind === 'REVERSAL' ? 'Customer payment reversed' : 'Customer credit repayment'), ref: (isRecon ? ((self.find('reconPeriods', x.ref) || {}).invoice_no || x.ref) + ' · ' : '') + x.id + (x.method_id ? ' · ' + x.method_id : ''), debit: x.usd_cents < 0 ? -x.usd_cents : 0, credit: x.usd_cents > 0 ? x.usd_cents : 0, ledger: isRecon ? 'BRANCH_RECONCILIATION' : 'CUSTOMER_CREDIT' });
    });
    rows.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    var bal = 0, customerBal = 0, branchBal = 0;
    rows.forEach(function (r) { var delta = r.debit - r.credit; bal += delta; if (r.ledger === 'CUSTOMER_CREDIT') customerBal += delta; else branchBal += delta; r.balance = bal; r.ledger_balance = r.ledger === 'CUSTOMER_CREDIT' ? customerBal : branchBal; });
    return { customer: Object.assign({}, c, { customer_credit_outstanding_usd_cents: this.customerCreditOutstanding(c.id), branch_reconciliation_outstanding_usd_cents: this.branchOutstanding(c.id) }), rows: rows, balance: bal, customer_credit_balance: this.customerCreditOutstanding(c.id), branch_reconciliation_balance: this.branchOutstanding(c.id), as_of: this.iso() };
  });

  /* ----- suppliers & purchasing ----- */

  /* ----- suppliers & purchasing ----- */
  def('suppliers.save', 'purchasing.manage', true, function (u, p) {
    if (!p.name || !String(p.name).trim()) throw E('VALIDATION_FAILED', 'Supplier name required'); var s;
    if (p.id) { s = this.must('suppliers', p.id); var old = { name: s.name, terms: s.payment_terms }; ['name', 'contact_person', 'phone', 'address', 'notes', 'payment_terms'].forEach(function (k) { if (p[k] != null) s[k] = p[k]; }); if (p.status) s.status = p.status; this.audit(u, 'SUPPLIER_UPDATED', 'Supplier', s.id, old, { name: s.name, terms: s.payment_terms }); }
    else { s = { id: this.id('SUP'), name: String(p.name).trim(), contact_person: p.contact_person || '', phone: p.phone || '', address: p.address || '', notes: p.notes || '', payment_terms: p.payment_terms || '', status: 'active' }; this.db.suppliers.push(s); this.audit(u, 'SUPPLIER_CREATED', 'Supplier', s.id, null, { name: s.name }); } return s;
  });
  P.poPaid = function (po) { return this.sumPay(function (p) { return p.party_type === 'SUPPLIER' && p.ref === po.id && (ek(p) === 'DEPOSIT' || ek(p) === 'BALANCE'); }); };
  P.poTotal = function (po) { return po.final_usd_cents != null ? po.final_usd_cents : po.total_usd_cents; };
  P.poView = function (po) {
    var o = {}; for (var k in po) o[k] = po[k]; var paid = this.poPaid(po), tot = this.poTotal(po), s = this.find('suppliers', po.supplier_id), self = this;
    o.items = this.db.poItems.filter(function (x) { return x.po_id === po.id; }).map(function (x) { var y = {}; for (var k in x) y[k] = x[k]; var pr = self.find('products', x.product_id) || {}; y.name = pr.name; y.sku = pr.sku; return y; });
    o.supplier_name = s && s.name; o.supplier_phone = s && s.phone; o.paid_usd_cents = paid; o.total_effective_usd_cents = tot; o.remaining_usd_cents = po.status === 'CANCELLED' ? 0 : tot - paid; return o;
  };
  P.buildPo = function (p) {
    if (!p.items || !p.items.length) throw E('VALIDATION_FAILED', 'Add at least one product'); var rateRec = this.rateRecord('AED_USD', p.aed_usd_rate_id), rate = rateRec && rateRec.rate; if (!(rate > 0)) throw E('RATE_NOT_SET', 'AED/USD rate is not set');
    var self = this, lines = [], seen = {}, totA = 0, totU = 0;
    p.items.forEach(function (i) { var pr = self.must('products', i.product_id), q = Number(i.qty), c = Number(i.unit_cost_aed); if (!(q > 0) || Math.floor(q) !== q) throw E('VALIDATION_FAILED', 'Invalid quantity'); if (!(c >= 0)) throw E('VALIDATION_FAILED', 'Invalid cost');
      if (seen[pr.id]) throw E('VALIDATION_FAILED', pr.name + ' is listed twice'); seen[pr.id] = 1; var am = Math.round(c * 100), um = Math.round(am / rate);
      lines.push({ product_id: pr.id, supplier_item_name: i.supplier_item_name || pr.supplier_item_name || pr.name, qty_ordered: q, unit_cost_aed_minor: am, unit_cost_usd_cents: um }); totA += q * am; totU += q * um; });
    return { lines: lines, rate: rate, rate_id: rateRec.id, totA: totA, totU: totU };
  };
  def('po.create', 'purchasing.manage', true, function (u, p) {
    var s = this.must('suppliers', p.supplier_id), b = this.buildPo(p), self = this;
    var po = { id: this.id('PO'), po_no: this.docNo('ANE-PO'), supplier_id: s.id, status: 'DRAFT', aed_usd_rate: b.rate, aed_usd_rate_id: b.rate_id, total_aed_minor: b.totA, total_usd_cents: b.totU, final_usd_cents: null, payment_terms: p.payment_terms || s.payment_terms || '', notes: p.notes || '', created_at: this.iso(), created_by: u.id, created_by_name: u.full_name, sent_at: null, received_at: null };
    this.db.pos.push(po); b.lines.forEach(function (l) { l.id = self.id('POI'); l.po_id = po.id; l.qty_received = null; l.actual_unit_cost_aed_minor = null; self.db.poItems.push(l); });
    this.audit(u, 'PO_CREATED', 'PurchaseOrder', po.id, null, { po_no: po.po_no, total_usd_cents: po.total_usd_cents }); return this.poView(po);
  });
  def('po.update', 'purchasing.manage', true, function (u, p) {
    var po = this.must('pos', p.po_id), self = this; if (po.status !== 'DRAFT') throw E('VALIDATION_FAILED', 'Only draft orders can be edited'); var s = this.must('suppliers', p.supplier_id || po.supplier_id), b = this.buildPo(p);
    this.db.poItems = this.db.poItems.filter(function (x) { return x.po_id !== po.id; }); b.lines.forEach(function (l) { l.id = self.id('POI'); l.po_id = po.id; l.qty_received = null; l.actual_unit_cost_aed_minor = null; self.db.poItems.push(l); });
    po.supplier_id = s.id; po.aed_usd_rate = b.rate; po.aed_usd_rate_id = b.rate_id; po.total_aed_minor = b.totA; po.total_usd_cents = b.totU; po.payment_terms = p.payment_terms || po.payment_terms; po.notes = p.notes != null ? p.notes : po.notes;
    this.audit(u, 'PO_EDITED', 'PurchaseOrder', po.id, null, { total_usd_cents: po.total_usd_cents }); return this.poView(po);
  });
  def('po.list', 'purchasing.view', false, function (u, p) { var self = this; return this.db.pos.slice().reverse().map(function (po) { return self.poView(po); }); });
  def('po.get', 'purchasing.view', false, function (u, p) {
    var po = this.must('pos', p.po_id), self = this;
    return { po: this.poView(po), payments: this.db.payments.filter(function (x) { return x.party_type === 'SUPPLIER' && x.ref === po.id; }).map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; o.amount_text = x.currency === 'USD' ? fU(x.amount_minor) : fS(x.amount_minor); o.by_name = (self.find('users', x.by) || {}).full_name; return o; }), receipts: this.db.receipts.filter(function (r) { return r.po_id === po.id; }) };
  });
  def('po.setStatus', 'purchasing.manage', true, function (u, p) {
    var po = this.must('pos', p.po_id), flow = { DRAFT: ['SENT', 'CANCELLED'], SENT: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['CANCELLED'] }, to = p.status; if (!(flow[po.status] || []).length || flow[po.status].indexOf(to) < 0) throw E('VALIDATION_FAILED', 'Cannot change from ' + po.status + ' to ' + to);
    if (to === 'CANCELLED') { if (this.poPaid(po) !== 0) throw E('VALIDATION_FAILED', 'Payments exist. Reverse them first.'); if (!p.reason || String(p.reason).trim().length < 3) throw E('VALIDATION_FAILED', 'A reason is required'); po.cancel_reason = p.reason; }
    var old = po.status; po.status = to; if (to === 'SENT') po.sent_at = this.iso(); this.audit(u, 'PO_STATUS', 'PurchaseOrder', po.id, old, to, p.reason); return this.poView(po);
  });
  def('po.pay', 'purchasing.pay', true, function (u, p) {
    var po = this.must('pos', p.po_id); if (['SENT', 'CONFIRMED', 'RECEIVED', 'REVIEW'].indexOf(po.status) < 0) throw E('VALIDATION_FAILED', 'Order must be sent before it can be paid'); var m = this.payMethod(p.method_id), mm = this.money(m, p.amount, p.rate_id);
    var remaining = this.poTotal(po) - this.poPaid(po); if (remaining <= 0) throw E('VALIDATION_FAILED', 'This order is already fully paid'); var usd = this.clamp(mm.usd, remaining), amountMinor = m.currency === 'USD' ? usd : Math.round(usd * 100 / mm.rate);
    var kind = po.status === 'RECEIVED' ? 'BALANCE' : 'DEPOSIT', pay = { id: this.id('PAY'), direction: 'OUT', party_type: 'SUPPLIER', party_id: po.supplier_id, kind: kind, ref: po.id, method_id: m.id, currency: m.currency, amount_minor: amountMinor, usd_cents: usd, rate_usd_slsh: mm.rate, rate_id: mm.rate_id, at: this.iso(), offline_at: this.eventTime(p.offline_at), synced_at: this.iso(), by: u.id, reference: p.reference || '' };
    this.db.payments.push(pay); this.audit(u, kind === 'DEPOSIT' ? 'SUPPLIER_DEPOSIT' : 'SUPPLIER_PAYMENT', 'PurchaseOrder', po.id, null, { usd_cents: usd, method: m.id }); return this.poView(po);
  });
  P.applyReceipt = function (u, po, rc) {
    var self = this, fin = 0;
    rc.lines.forEach(function (l) { var it = self.must('poItems', l.po_item_id); it.qty_received = l.qty; it.actual_unit_cost_aed_minor = l.unit_cost_aed_minor; var uu = Math.round(l.unit_cost_aed_minor / po.aed_usd_rate); fin += l.qty * uu;
      if (l.qty > 0) { self.move(u, it.product_id, 'PURCHASE_RECEIPT', null, 'AVAILABLE', l.qty, 'Received ' + po.po_no, po.id); var pr = self.must('products', it.product_id); pr.cost_aed_minor = l.unit_cost_aed_minor; pr.aed_usd_rate_snapshot = po.aed_usd_rate; pr.cost_usd_cents = uu; } });
    po.final_usd_cents = fin; po.status = 'RECEIVED'; po.received_at = rc.received_at || this.iso(); rc.status = 'APPLIED'; this.audit(u, 'STOCK_RECEIVED', 'PurchaseOrder', po.id, null, { po_no: po.po_no, final_usd_cents: fin });
  };
  def('po.receive', 'purchasing.receive', true, function (u, p) {
    var po = this.must('pos', p.po_id); if (['SENT', 'CONFIRMED'].indexOf(po.status) < 0) throw E('VALIDATION_FAILED', 'Order must be Sent or Confirmed to receive'); var rec = {}, disc = false, lines = [];
    (p.lines || []).forEach(function (l) { rec[l.po_item_id] = l; });
    this.db.poItems.filter(function (x) { return x.po_id === po.id; }).forEach(function (it) { var l = rec[it.id] || {}, q = l.qty == null || l.qty === '' ? it.qty_ordered : Number(l.qty), c = l.unit_cost_aed == null || l.unit_cost_aed === '' ? it.unit_cost_aed_minor : Math.round(Number(l.unit_cost_aed) * 100);
      if (isNaN(q) || q < 0 || Math.floor(q) !== q || isNaN(c) || c < 0) throw E('VALIDATION_FAILED', 'Invalid received quantity or cost'); if (q !== it.qty_ordered) throw E('VALIDATION_FAILED', 'Partial deliveries are not supported. Receive the full ordered quantity or leave the order open.'); if (c !== it.unit_cost_aed_minor) disc = true; lines.push({ po_item_id: it.id, product_id: it.product_id, qty: q, unit_cost_aed_minor: c }); });
    if (disc && (!p.notes || String(p.notes).trim().length < 3)) throw E('VALIDATION_FAILED', 'The delivery differs from the order. Explain the difference in the notes.');
    var rc = { id: this.id('RCP'), po_id: po.id, received_at: this.eventTime(p.offline_at) || this.iso(), by: u.id, by_name: u.full_name, lines: lines, discrepancy: disc, notes: p.notes || '', status: disc ? 'REVIEW' : 'APPLIED', synced_at: this.iso() }; this.db.receipts.push(rc);
    if (disc) { po.status = 'REVIEW'; this.audit(u, 'PO_RECEIPT_DISCREPANCY', 'PurchaseOrder', po.id, null, p.notes); return { po: this.poView(po), review: true }; }
    this.applyReceipt(u, po, rc); return { po: this.poView(po), review: false };
  });
  def('po.approveReceipt', 'purchasing.approve', true, function (u, p) {
    var po = this.must('pos', p.po_id); if (po.status !== 'REVIEW') throw E('VALIDATION_FAILED', 'No receipt awaiting review'); var rc = this.db.receipts.filter(function (r) { return r.po_id === po.id && r.status === 'REVIEW'; }).pop();
    rc.approved_by = u.full_name; rc.approved_at = this.iso(); rc.review_notes = p.notes || ''; this.applyReceipt(u, po, rc); this.audit(u, 'PO_RECEIPT_APPROVED', 'PurchaseOrder', po.id, null, p.notes); return this.poView(po);
  });
  def('po.rejectReceipt', 'purchasing.approve', true, function (u, p) {
    var po = this.must('pos', p.po_id); if (po.status !== 'REVIEW') throw E('VALIDATION_FAILED', 'No receipt awaiting review'); var rc = this.db.receipts.filter(function (r) { return r.po_id === po.id && r.status === 'REVIEW'; }).pop();
    rc.status = 'REJECTED'; rc.review_notes = p.notes || ''; po.status = 'CONFIRMED'; this.audit(u, 'PO_RECEIPT_REJECTED', 'PurchaseOrder', po.id, null, p.notes); return this.poView(po);
  });
  P.supplierBalances = function (sid) { var pay = 0, pre = 0, self = this; this.db.pos.forEach(function (po) { if (po.supplier_id !== sid || po.status === 'CANCELLED') return; var paid = self.poPaid(po); if (po.status === 'RECEIVED') pay += self.poTotal(po) - paid; else pre += paid; }); return { payable: pay, prepaid: pre }; };

  /* ----- expenses ----- */
  def('expenses.create', 'expenses.manage', true, function (u, p) {
    var cats = this.db.settings.expense_categories; if (cats.indexOf(p.category) < 0) throw E('VALIDATION_FAILED', 'Choose an expense category'); if (!p.description || !String(p.description).trim()) throw E('VALIDATION_FAILED', 'Description required');
    var m = this.payMethod(p.method_id), mm = this.money(m, p.amount, p.rate_id), date = p.date || this.dayKey(); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw E('VALIDATION_FAILED', 'Invalid date'); if (date > this.dayKey()) throw E('VALIDATION_FAILED', 'Expense date cannot be in the future');
    var x = { id: this.id('EXP'), category: p.category, description: String(p.description).trim(), amount_minor: mm.amt, currency: m.currency, usd_cents: mm.usd, rate_usd_slsh: mm.rate, rate_id: mm.rate_id, method_id: m.id, date: date, at: this.iso(), offline_at: this.eventTime(p.offline_at), synced_at: this.iso(), by: u.id, by_name: u.full_name, status: 'ACTIVE' };
    this.db.expenses.push(x); this.audit(u, 'EXPENSE_RECORDED', 'Expense', x.id, null, { category: x.category, usd_cents: x.usd_cents }); return x;
  });
  def('expenses.list', 'expenses.view', false, function (u, p) { return this.db.expenses.filter(function (x) { return (!p.from || x.date >= p.from) && (!p.to || x.date <= p.to); }).slice().reverse().map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; o.amount_text = x.currency === 'USD' ? fU(x.amount_minor) : fS(x.amount_minor); return o; }); });
  def('expenses.reverse', 'expenses.manage', true, function (u, p) {
    var x = this.must('expenses', p.expense_id); if (x.status !== 'ACTIVE') throw E('VALIDATION_FAILED', 'Already reversed'); if (!p.reason || String(p.reason).trim().length < 3) throw E('VALIDATION_FAILED', 'A reason is required');
    x.status = 'REVERSED'; x.reverse_reason = p.reason; x.reversed_by = u.full_name; x.reversed_at = this.iso(); this.audit(u, 'EXPENSE_REVERSED', 'Expense', x.id, 'ACTIVE', 'REVERSED', p.reason); return x;
  });
  def('expenses.addCategory', 'expenses.manage', true, function (u, p) { var n = String(p.name || '').trim(), c = this.db.settings.expense_categories; if (!n) throw E('VALIDATION_FAILED', 'Name required'); if (c.some(function (x) { return x.toLowerCase() === n.toLowerCase(); })) throw E('VALIDATION_FAILED', 'Category exists'); c.push(n); this.audit(u, 'EXPENSE_CATEGORY_ADDED', 'Setting', 'expense_categories', null, n); return c; });

  /* ----- branch reconciliation & invoices ----- */
  P.periodFor = function (br, key) { if (br.cycle === 'WEEKLY') { var st = weekStart(key, br.week_start_dow == null ? 3 : br.week_start_dow); return { start: st, end: addDays(st, 6) }; } return { start: key, end: key }; };
  P.reconLines = function (br, per) {
    var self = this, sold = [], pend = [], ret = [], now = this.now().getTime();
    this.db.collItems.forEach(function (it) {
      var col = self.find('collections', it.collection_id); if (col.branch_id !== br.id) return; var k = self.dayKey(new Date(col.collected_at)); if (k < per.start || k > per.end) return; var pr = self.find('products', it.product_id) || {};
      var b = { item_id: it.id, product_id: it.product_id, sku: pr.sku, name: pr.name, technician: (self.find('people', col.technician_id) || {}).name, assistant: (self.find('people', col.assistant_id) || {}).name, qty: it.qty, collected_at: col.collected_at, collection_id: col.id };
      if (it.status === 'SOLD') { var si = self.db.saleItems.filter(function (x) { return x.collection_item_id === it.id; })[0]; b.unit_price_usd_cents = si ? si.unit_price_usd_cents : 0; b.total_usd_cents = b.unit_price_usd_cents * it.qty; b.sale_id = si && si.sale_id; sold.push(b); }
      else if (it.status === 'PENDING') { var age = now - new Date(col.collected_at).getTime(); b.age_hours = Math.floor(age / 3600000); b.overdue = age > OVERDUE_MS; pend.push(b); }
      else { b.status = it.status; ret.push(b); } });
    return { sold: sold, pending: pend, returned: ret };
  };
  P.periodView = function (per) {
    var revs = this.db.reconRevs.filter(function (r) { return r.period_id === per.id; }), cur = revs.filter(function (r) { return r.is_current; })[0], paid = this.sumPay(function (p) { return p.party_type === 'CUSTOMER' && p.ref === per.id && ek(p) === 'RECON_PAYMENT'; });
    var o = {}; for (var k in per) o[k] = per[k]; var total = cur ? cur.total_usd_cents : 0, bal = total - paid; o.revision = cur ? cur.rev : 0; o.revisions = revs.length; o.total_usd_cents = total; o.paid_usd_cents = paid; o.balance_usd_cents = bal;
    o.status = total === 0 ? 'NO_BILLABLE' : bal <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID'; o.overdue = bal > 0 && this.iso() > per.due_at; o.pending_units = cur ? cur.pending.reduce(function (s, x) { return s + x.qty; }, 0) : 0; o.branch_name = this.nm('branches', per.branch_id); return o;
  };
  def('recon.generate', 'recon.manage', true, function (u, p) {
    var br = this.must('branches', p.branch_id), key = p.date || this.dayKey(); if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw E('VALIDATION_FAILED', 'Invalid date'); var pr = this.periodFor(br, key), lines = this.reconLines(br, pr);
    if (!lines.sold.length && !lines.pending.length && !lines.returned.length) throw E('NOTHING_TO_REPORT', 'No collections in this period');
    var sig = JSON.stringify([].concat(lines.sold, lines.pending, lines.returned).map(function (x) { return [x.item_id, x.status || (x.total_usd_cents != null ? 'S' : 'P'), x.qty, x.unit_price_usd_cents || 0]; }));
    var pid = 'RCP-' + br.id + '-' + pr.start, per = this.find('reconPeriods', pid), self = this;
    if (!per) { per = { id: pid, branch_id: br.id, customer_id: br.customer_id, period_start: pr.start, period_end: pr.end, report_no: this.docNo('ANE-RPT'), invoice_no: this.docNo('ANE-INV'), due_at: this.endOfDay(addDays(pr.end, br.due_offset_days || 0)), created_at: this.iso() }; this.db.reconPeriods.push(per); }
    var cur = this.db.reconRevs.filter(function (r) { return r.period_id === pid && r.is_current; })[0]; if (cur && cur.signature === sig) return { period: this.periodView(per), unchanged: true };
    if (cur) cur.is_current = false; var total = lines.sold.reduce(function (s, x) { return s + x.total_usd_cents; }, 0), n = this.db.reconRevs.filter(function (r) { return r.period_id === pid; }).length + 1;
    var rev = { id: this.id('RCN'), period_id: pid, rev: n, is_current: true, parent_rev_id: cur ? cur.id : null, generated_at: this.iso(), by: u.id, by_name: u.full_name, sold: lines.sold, pending: lines.pending, returned: lines.returned, total_usd_cents: total, signature: sig };
    this.db.reconRevs.push(rev); lines.sold.forEach(function (l) { var s = self.find('sales', l.sale_id); if (s) s.invoice_id = pid; });
    this.audit(u, n === 1 ? 'RECON_GENERATED' : 'RECON_REVISED', 'Reconciliation', pid, cur ? cur.total_usd_cents : null, total, 'Revision ' + n); return { period: this.periodView(per), revision: n, unchanged: false };
  });
  def('recon.list', 'recon.view', false, function (u, p) { var self = this; return this.db.reconPeriods.filter(function (x) { return !p.branch_id || x.branch_id === p.branch_id; }).map(function (x) { return self.periodView(x); }).sort(function (a, b) { return a.period_start < b.period_start ? 1 : -1; }); });
  def('recon.get', 'recon.view', false, function (u, p) {
    var per = this.must('reconPeriods', p.period_id), self = this, revs = this.db.reconRevs.filter(function (r) { return r.period_id === per.id; }), rev = p.rev ? revs.filter(function (r) { return r.rev === Number(p.rev); })[0] : revs.filter(function (r) { return r.is_current; })[0]; if (!rev) throw E('NOT_FOUND', 'Revision not found');
    return { period: this.periodView(per), revision: rev, revisions: revs.map(function (r) { return { rev: r.rev, generated_at: r.generated_at, by_name: r.by_name, total_usd_cents: r.total_usd_cents, is_current: r.is_current }; }), customer: this.find('customers', per.customer_id),
      payments: this.db.payments.filter(function (x) { return x.ref === per.id; }).map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; o.amount_text = x.currency === 'USD' ? fU(x.amount_minor) : fS(x.amount_minor); return o; }) };
  });
  def('recon.pay', 'payments.record', true, function (u, p) {
    var per = this.must('reconPeriods', p.period_id), v = this.periodView(per); if (v.balance_usd_cents <= 0) throw E('VALIDATION_FAILED', 'Nothing is owed on this report'); var m = this.payMethod(p.method_id), mm = this.money(m, p.amount, p.rate_id), usd = this.clamp(mm.usd, v.balance_usd_cents), amountMinor = m.currency === 'USD' ? usd : Math.round(usd * 100 / mm.rate);
    var pay = { id: this.id('PAY'), direction: 'IN', party_type: 'CUSTOMER', party_id: per.customer_id, kind: 'RECON_PAYMENT', ref: per.id, method_id: m.id, currency: m.currency, amount_minor: amountMinor, usd_cents: usd, rate_usd_slsh: mm.rate, rate_id: mm.rate_id, at: this.iso(), offline_at: this.eventTime(p.offline_at), synced_at: this.iso(), by: u.id, reference: p.reference || '' };
    this.db.payments.push(pay); this.audit(u, 'RECON_PAYMENT', 'Reconciliation', per.id, null, { usd_cents: usd }); return this.periodView(per);
  });

  /* ----- staff, roles ----- */
  def('users.list', 'users.manage', false, function () { var self = this; return { users: this.db.users.map(function (x) { return { id: x.id, full_name: x.full_name, username: x.username, role: x.role, status: x.status, has_password: !!x.password_hash }; }), roles: this.db.roles, all_perms: ALL_PERMS }; });
  P.role = function (id) { var r = this.db.roles[id]; if (!r) throw E('VALIDATION_FAILED', 'Unknown role'); return r; };
  P.ownersLeft = function (exceptId) { return this.db.users.filter(function (x) { return x.role === 'owner' && x.status === 'active' && x.id !== exceptId; }).length; };
  def('users.create', 'users.manage', true, function (u, p) {
    var un = String(p.username || '').trim().toLowerCase(); if (!/^[a-z0-9._-]{3,30}$/.test(un)) throw E('VALIDATION_FAILED', 'Username: 3-30 letters, numbers, dot, dash'); if (this.userByName(un)) throw E('VALIDATION_FAILED', 'Username already used'); if (!p.full_name || !String(p.full_name).trim()) throw E('VALIDATION_FAILED', 'Name required'); this.role(p.role);
    var n = this.db.users.length + 1, id = 'U-' + pad(n, 3); while (this.find('users', id)) { n++; id = 'U-' + pad(n, 3); } var x = { id: id, full_name: String(p.full_name).trim(), username: un, role: p.role, status: 'active', password_hash: null, salt: null, failed: 0, locked_until: 0, setup_salt: null, setup_hash: null, setup_expires: 0, setup_failed: 0 };
    if (p.password) { if (String(p.password).length < 8) throw E('VALIDATION_FAILED', 'Password must be at least 8 characters'); x.salt = randHex(8); x.password_hash = hashPw(x.salt, p.password); }
    this.db.users.push(x); this.audit(u, 'USER_CREATED', 'User', x.id, null, { username: un, role: p.role });
    var setup = p.password ? null : this.issueSetupCode(u, un);
    return { id: x.id, setup_code: setup && setup.code, expires_hours: setup && setup.expires_hours };
  });
  def('users.update', 'users.manage', true, function (u, p) {
    var x = this.must('users', p.user_id), old = { role: x.role, status: x.status }; var role = p.role || x.role, st = p.status || x.status; this.role(role); if (['active', 'inactive'].indexOf(st) < 0) throw E('VALIDATION_FAILED', 'Bad status');
    if (x.id === u.id && (role !== x.role || st !== 'active')) throw E('VALIDATION_FAILED', 'You cannot change your own role or deactivate yourself'); if (x.role === 'owner' && (role !== 'owner' || st !== 'active') && this.ownersLeft(x.id) < 1) throw E('VALIDATION_FAILED', 'There must be at least one active owner');
    if (p.full_name && String(p.full_name).trim()) x.full_name = String(p.full_name).trim(); x.role = role; x.status = st; this.audit(u, 'USER_UPDATED', 'User', x.id, old, { role: role, status: st }); return {};
  });
  def('users.issueSetupCode', 'users.manage', true, function (u, p) { var x = this.must('users', p.user_id); return this.issueSetupCode(u, x.username); });
  def('users.setPassword', 'users.manage', true, function (u, p) { var x = this.must('users', p.user_id); if (String(p.password || '').length < 8) throw E('VALIDATION_FAILED', 'Password must be at least 8 characters'); x.salt = randHex(8); x.password_hash = hashPw(x.salt, p.password); x.failed = 0; x.locked_until = 0; var h = this.db.sessions; this.db.sessions = h.filter(function (s) { return s.user_id !== x.id; }); this.audit(u, 'PASSWORD_RESET', 'User', x.id); return {}; });
  def('auth.changePassword', null, true, function (u, p) { if (hashPw(u.salt, String(p.old || '')) !== u.password_hash) throw E('INVALID_CREDENTIALS', 'Current password is wrong'); if (String(p.password || '').length < 8) throw E('VALIDATION_FAILED', 'Password must be at least 8 characters'); u.salt = randHex(8); u.password_hash = hashPw(u.salt, p.password); this.audit(u, 'PASSWORD_CHANGED', 'User', u.id); return {}; });
  def('roles.save', 'users.manage', true, function (u, p) {
    var r = this.role(p.role); if (r.id === 'owner') throw E('VALIDATION_FAILED', 'Owner permissions cannot be changed'); var perms = (p.perms || []).filter(function (x) { return ALL_PERMS.indexOf(x) >= 0; }); var old = r.perms.slice(); r.perms = perms; this.audit(u, 'ROLE_PERMISSIONS_CHANGED', 'Role', r.id, old.length + ' permissions', perms.length + ' permissions'); return r;
  });
  def('roles.create', 'users.manage', true, function (u, p) { var id = String(p.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); if (!id) throw E('VALIDATION_FAILED', 'Role name required'); if (this.db.roles[id]) throw E('VALIDATION_FAILED', 'Role exists'); this.db.roles[id] = { id: id, perms: ['inventory.view'] }; this.audit(u, 'ROLE_CREATED', 'Role', id); return this.db.roles[id]; });

  /* ----- dashboard v2 ----- */
  def('dashboard.get', null, false, function (u, p) {
    var self = this, perms = this.permsOf(u), fin = perms.indexOf('finance.view') >= 0, today = this.dayKey(), from = p.from || today, to = p.to || today, now = this.now().getTime(), month = today.slice(0, 7);
    var d = { from: from, to: to, range_sales_usd: 0, range_txns: 0, range_gross_profit_usd: 0, range_expenses_usd: 0, today_sales_usd: 0, today_txns: 0, month_sales_usd: 0, month_gross_profit_usd: 0, stock_value_usd: 0, low_stock: [], out_of_stock: [], customer_owed_usd: 0, supplier_payable_usd: 0, supplier_prepaid_usd: 0, branch_held_units: 0, pending_items: 0, overdue_items: 0, open_pos: 0, review_pos: 0, recon_unpaid: 0, recon_unpaid_usd: 0, recon_overdue: 0, series: [], recent_sales: [], recent_payments: [], has_demo: false };
    var byDay = {};
    this.db.sales.forEach(function (s) { if (s.demo) d.has_demo = true; if (s.status !== 'ACTIVE') return; var k = self.dayKey(new Date(s.at));
      if (k === today) { d.today_sales_usd += s.total_usd_cents; d.today_txns++; } if (k.slice(0, 7) === month) { d.month_sales_usd += s.total_usd_cents; d.month_gross_profit_usd += s.total_usd_cents - s.cost_usd_cents; }
      if (k >= from && k <= to) { d.range_sales_usd += s.total_usd_cents; d.range_txns++; d.range_gross_profit_usd += s.total_usd_cents - s.cost_usd_cents; byDay[k] = (byDay[k] || 0) + s.total_usd_cents; } });
    var span = Math.min(62, Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5) + 1); for (var i = 0; i < span; i++) { var k = addDays(from, i); d.series.push({ day: k, usd_cents: byDay[k] || 0 }); }
    this.db.expenses.forEach(function (x) { if (x.status === 'ACTIVE' && x.date >= from && x.date <= to) d.range_expenses_usd += x.usd_cents; });
    this.db.products.forEach(function (pr) { if (pr.status !== 'active') return; var a = self.qty(pr.id, 'AVAILABLE'), mn = pr.min_stock == null ? self.db.settings.default_min_stock : pr.min_stock, h = self.held(pr.id); d.stock_value_usd += a * pr.cost_usd_cents; d.branch_held_units += h;
      if (a === 0) d.out_of_stock.push({ id: pr.id, name: pr.name }); else if (a <= mn) d.low_stock.push({ id: pr.id, name: pr.name, available: a, min: mn }); });
    this.db.customers.forEach(function (c) { var o = self.outstanding(c.id); if (o > 0) d.customer_owed_usd += o; });
    this.db.suppliers.forEach(function (s) { var b = self.supplierBalances(s.id); d.supplier_payable_usd += b.payable; d.supplier_prepaid_usd += b.prepaid; });
    this.db.pos.forEach(function (po) { if (['SENT', 'CONFIRMED'].indexOf(po.status) >= 0) d.open_pos++; if (po.status === 'REVIEW') d.review_pos++; });
    this.db.collItems.forEach(function (it) { if (it.status !== 'PENDING') return; d.pending_items += it.qty; var c = self.find('collections', it.collection_id); if (now - new Date(c.collected_at).getTime() > OVERDUE_MS) d.overdue_items += it.qty; });
    this.db.reconPeriods.forEach(function (per) { var v = self.periodView(per); if (v.balance_usd_cents > 0) { d.recon_unpaid++; d.recon_unpaid_usd += v.balance_usd_cents; if (v.overdue) d.recon_overdue++; } });
    d.recent_sales = this.db.sales.slice(-8).reverse().map(function (s) { return { id: s.id, at: s.at, total_usd_cents: s.total_usd_cents, customer: (self.find('customers', s.customer_id) || {}).name, status: s.status === 'REVERSED' ? 'REVERSED' : s.payment_status, source: s.source }; });
    if (fin) d.recent_payments = this.db.payments.slice(-6).reverse().map(function (x) { return { at: x.offline_at || x.at, party: x.party_type === 'SUPPLIER' ? self.nm('suppliers', x.party_id) : self.nm('customers', x.party_id), direction: x.direction, kind: x.kind, usd_cents: x.usd_cents }; });
    else { delete d.month_gross_profit_usd; delete d.stock_value_usd; delete d.range_gross_profit_usd; delete d.range_expenses_usd; delete d.supplier_payable_usd; delete d.supplier_prepaid_usd; } return d;
  });

  /* ----- reports ----- */
  var REPORTS = {};
  function mk(title, cols, rows, note) { var tot = {}; cols.forEach(function (c, i) { if (c[2] === 'usd' || c[2] === 'int') { tot[c[0]] = rows.reduce(function (s, r) { return s + (Number(r[c[0]]) || 0); }, 0); } }); return { title: title, columns: cols, rows: rows, totals: rows.length ? tot : null, note: note || null }; }
  function rep(n, perm, fn) { REPORTS[n] = { perm: perm, fn: fn }; }
  function saleItemsIn(self, from, to) { var ids = {}; self.salesIn(from, to).forEach(function (s) { ids[s.id] = s; }); return self.db.saleItems.filter(function (i) { return ids[i.sale_id]; }).map(function (i) { i._s = ids[i.sale_id]; return i; }); }
  function grp(rows, keyFn, init, add) { var m = {}; rows.forEach(function (r) { var k = keyFn(r), g = m[k] || (m[k] = init(k)); add(g, r); }); return Object.keys(m).sort().map(function (k) { return m[k]; }); }
  rep('sales_summary', 'reports.view', function (s, f, t, p) { var g = p.group || 'day'; var rows = grp(s.salesIn(f, t), function (x) { var k = s.dayKey(new Date(x.at)); return g === 'month' ? k.slice(0, 7) : g === 'week' ? weekStart(k, 1) : k; }, function (k) { return { period: k, txns: 0, revenue: 0, cost: 0 }; }, function (r, x) { r.txns++; r.revenue += x.total_usd_cents; r.cost += x.cost_usd_cents; }); rows.forEach(function (r) { r.profit = r.revenue - r.cost; });
    return mk('Sales by ' + g + (g === 'week' ? ' (weeks start Monday)' : ''), [['period', g === 'day' ? 'Date' : g === 'week' ? 'Week starting' : 'Month', 'text'], ['txns', 'Transactions', 'int'], ['revenue', 'Revenue', 'usd'], ['cost', 'Cost of goods', 'usd'], ['profit', 'Gross profit', 'usd']], rows, 'Revenue includes credit sales and confirmed branch sales. It is not the same as money received.'); });
  rep('sales_by_product', 'reports.view', function (s, f, t) { var rows = grp(saleItemsIn(s, f, t), function (i) { return i.product_id; }, function (k) { var pr = s.find('products', k) || {}; return { sku: k, name: pr.name, category: pr.category, units: 0, revenue: 0, profit: 0 }; }, function (r, i) { r.units += i.qty; r.revenue += i.qty * i.unit_price_usd_cents; r.profit += i.qty * (i.unit_price_usd_cents - i.unit_cost_usd_cents); }); rows.sort(function (a, b) { return b.revenue - a.revenue; });
    return mk('Sales by product', [['sku', 'ID', 'text'], ['name', 'Product', 'text'], ['category', 'Category', 'text'], ['units', 'Units sold', 'int'], ['revenue', 'Revenue', 'usd'], ['profit', 'Gross profit', 'usd']], rows); });
  rep('sales_by_category', 'reports.view', function (s, f, t) { var rows = grp(saleItemsIn(s, f, t), function (i) { return (s.find('products', i.product_id) || {}).category || '?'; }, function (k) { return { category: k, units: 0, revenue: 0, profit: 0 }; }, function (r, i) { r.units += i.qty; r.revenue += i.qty * i.unit_price_usd_cents; r.profit += i.qty * (i.unit_price_usd_cents - i.unit_cost_usd_cents); }); return mk('Sales by category', [['category', 'Category', 'text'], ['units', 'Units sold', 'int'], ['revenue', 'Revenue', 'usd'], ['profit', 'Gross profit', 'usd']], rows); });
  rep('sales_by_customer', 'reports.view', function (s, f, t) { var rows = grp(s.salesIn(f, t), function (x) { return x.customer_id; }, function (k) { return { customer: s.nm('customers', k), txns: 0, revenue: 0, owed: s.outstanding(k) }; }, function (r, x) { r.txns++; r.revenue += x.total_usd_cents; }); rows.sort(function (a, b) { return b.revenue - a.revenue; }); return mk('Sales by customer', [['customer', 'Customer', 'text'], ['txns', 'Transactions', 'int'], ['revenue', 'Revenue', 'usd'], ['owed', 'Currently owes', 'usd']], rows); });
  rep('sales_by_employee', 'reports.view', function (s, f, t) { var rows = grp(s.salesIn(f, t), function (x) { return x.by_name || x.by; }, function (k) { return { employee: k, txns: 0, revenue: 0 }; }, function (r, x) { r.txns++; r.revenue += x.total_usd_cents; }); return mk('Sales by employee', [['employee', 'Employee', 'text'], ['txns', 'Transactions', 'int'], ['revenue', 'Revenue', 'usd']], rows); });
  rep('sales_by_method', 'reports.view', function (s, f, t) { var rows = grp(s.salesIn(f, t), function (x) { return x.payment_method; }, function (k) { return { method: k === 'BRANCH_ACCOUNT' ? 'Branch account (billed)' : k === 'CREDIT' ? 'Customer credit' : k.replace('_', ' '), txns: 0, revenue: 0 }; }, function (r, x) { r.txns++; r.revenue += x.total_usd_cents; }); return mk('Sales by payment method', [['method', 'Method', 'text'], ['txns', 'Transactions', 'int'], ['revenue', 'Sales value', 'usd']], rows); });
  rep('payments_summary', 'finance.view', function (s, f, t) { var m = {}; s.db.payments.forEach(function (x) { if (!s.inRange(x.offline_at || x.at, f, t)) return; var k = x.direction + '|' + x.method_id + '|' + x.currency, r = m[k] || (m[k] = { direction: x.direction === 'IN' ? 'Received' : 'Paid out', method: x.method_id.replace('_', ' '), currency: x.currency, n: 0, native: 0, usd: 0 }); r.n++; r.native += x.amount_minor; r.usd += x.usd_cents; });
    var rows = Object.keys(m).sort().map(function (k) { var r = m[k]; r.amount = r.currency === 'USD' ? fU(r.native) : fS(r.native); return r; }); return mk('Payments by method and currency', [['direction', 'Direction', 'text'], ['method', 'Method', 'text'], ['currency', 'Currency', 'text'], ['n', 'Count', 'int'], ['amount', 'Amount (original currency)', 'text'], ['usd', 'USD equivalent (at the time)', 'usd']], rows, 'Reversals are netted. USD equivalents use the rate stored with each payment.'); });
  rep('inventory_valuation', 'finance.view', function (s) { var rows = s.db.products.filter(function (p) { return p.status === 'active'; }).map(function (p) { var a = s.qty(p.id, 'AVAILABLE'); return { sku: p.id, name: p.name, category: p.category, available: a, held: s.held(p.id), cost: p.cost_usd_cents, value_cost: a * p.cost_usd_cents, value_retail: a * p.price_usd_cents }; });
    return mk('Inventory valuation (available stock)', [['sku', 'ID', 'text'], ['name', 'Product', 'text'], ['category', 'Category', 'text'], ['available', 'Available', 'int'], ['held', 'With branches', 'int'], ['cost', 'Unit cost', 'usd'], ['value_cost', 'Value at cost', 'usd'], ['value_retail', 'Value at selling price', 'usd']], rows, 'Stock held by branches is not included in value because it is not yet sold or returned.'); });
  rep('low_stock', 'reports.view', function (s) { var rows = s.db.products.filter(function (p) { return p.status === 'active'; }).map(function (p) { var a = s.qty(p.id, 'AVAILABLE'), mn = p.min_stock == null ? s.db.settings.default_min_stock : p.min_stock; return { sku: p.id, name: p.name, category: p.category, available: a, min: mn, state: a === 0 ? 'OUT OF STOCK' : a <= mn ? 'LOW' : 'ok' }; }).filter(function (r) { return r.state !== 'ok'; }); return mk('Low and out-of-stock products', [['sku', 'ID', 'text'], ['name', 'Product', 'text'], ['category', 'Category', 'text'], ['available', 'Available', 'int'], ['min', 'Minimum', 'int'], ['state', 'Status', 'text']], rows); });
  rep('stock_movements', 'reports.view', function (s, f, t) { var rows = s.db.movements.filter(function (m) { return s.inRange(m.at, f, t); }).slice(-600).reverse().map(function (m) { return { at: s.dayKey(new Date(m.at)), sku: m.product_id, name: s.nm('products', m.product_id), type: m.type.replace(/_/g, ' '), qty: m.qty, reason: m.reason || m.ref || '' }; }); return mk('Stock movements (latest 600)', [['at', 'Date', 'text'], ['sku', 'ID', 'text'], ['name', 'Product', 'text'], ['type', 'Type', 'text'], ['qty', 'Qty', 'int'], ['reason', 'Reason / reference', 'text']], rows); });
  rep('branch_stock', 'reports.view', function (s) { var rows = s.db.balances.filter(function (b) { return b.loc.indexOf('BRANCH:') === 0 && b.qty > 0; }).map(function (b) { return { branch: s.nm('branches', b.loc.slice(7)), sku: b.product_id, name: s.nm('products', b.product_id), qty: b.qty }; }); return mk('Stock currently held by branches', [['branch', 'Branch', 'text'], ['sku', 'ID', 'text'], ['name', 'Product', 'text'], ['qty', 'Units', 'int']], rows); });
  rep('branch_summary', 'reports.view', function (s, f, t) { var m = {}; s.db.branches.forEach(function (b) { m[b.id] = { branch: b.name, collected: 0, sold: 0, sold_value: 0, returned: 0, pending: 0, overdue: 0, unpaid: 0 }; }); var now = s.now().getTime();
    s.db.collItems.forEach(function (it) { var c = s.find('collections', it.collection_id); if (!s.inRange(c.collected_at, f, t)) return; var r = m[c.branch_id]; r.collected += it.qty; if (it.status === 'SOLD') { r.sold += it.qty; var si = s.db.saleItems.filter(function (x) { return x.collection_item_id === it.id; })[0]; if (si) r.sold_value += si.unit_price_usd_cents * it.qty; } else if (it.status === 'RETURNED_APPROVED') r.returned += it.qty; else if (it.status === 'PENDING') { r.pending += it.qty; if (now - new Date(c.collected_at).getTime() > OVERDUE_MS) r.overdue += it.qty; } });
    s.db.reconPeriods.forEach(function (per) { var v = s.periodView(per); if (m[per.branch_id] && v.balance_usd_cents > 0) m[per.branch_id].unpaid += v.balance_usd_cents; });
    return mk('Branch summary (by collection date)', [['branch', 'Branch', 'text'], ['collected', 'Units collected', 'int'], ['sold', 'Sold', 'int'], ['sold_value', 'Sold value', 'usd'], ['returned', 'Returned (approved)', 'int'], ['pending', 'Pending', 'int'], ['overdue', 'Overdue', 'int'], ['unpaid', 'Unpaid reports (all time)', 'usd']], Object.keys(m).map(function (k) { return m[k]; })); });
  rep('po_list', 'purchasing.view', function (s, f, t) { var rows = s.db.pos.filter(function (po) { return s.inRange(po.created_at, f, t); }).map(function (po) { var v = s.poView(po); return { po_no: po.po_no, supplier: v.supplier_name, status: po.status, rate: po.aed_usd_rate, total: v.total_effective_usd_cents, paid: v.paid_usd_cents, remaining: v.remaining_usd_cents }; }); return mk('Purchase orders', [['po_no', 'PO number', 'text'], ['supplier', 'Supplier', 'text'], ['status', 'Status', 'text'], ['rate', 'AED per USD used', 'text'], ['total', 'Total', 'usd'], ['paid', 'Paid', 'usd'], ['remaining', 'Remaining', 'usd']], rows); });
  rep('purchases_by_supplier', 'purchasing.view', function (s, f, t) { var rows = s.db.suppliers.map(function (sp) { var r = { supplier: sp.name, orders: 0, purchased: 0, paid: 0, payable: 0, prepaid: 0 }; s.db.pos.forEach(function (po) { if (po.supplier_id !== sp.id || po.status === 'CANCELLED' || !s.inRange(po.created_at, f, t)) return; r.orders++; r.purchased += s.poTotal(po); r.paid += s.poPaid(po); }); var b = s.supplierBalances(sp.id); r.payable = b.payable; r.prepaid = b.prepaid; return r; });
    return mk('Purchases by supplier', [['supplier', 'Supplier', 'text'], ['orders', 'Orders', 'int'], ['purchased', 'Purchased', 'usd'], ['paid', 'Paid', 'usd'], ['payable', 'We owe (received orders)', 'usd'], ['prepaid', 'Deposits on unreceived orders', 'usd']], rows, 'We owe and Deposits are current balances for all time.'); });
  rep('finance_summary', 'finance.view', function (s, f, t) { var sales = s.salesIn(f, t), rev = 0, cogs = 0, exp = 0, rin = 0, rout = 0; sales.forEach(function (x) { rev += x.total_usd_cents; cogs += x.cost_usd_cents; }); s.db.expenses.forEach(function (x) { if (x.status === 'ACTIVE' && (!f || x.date >= f) && (!t || x.date <= t)) exp += x.usd_cents; });
    s.db.payments.forEach(function (x) { if (!s.inRange(x.offline_at || x.at, f, t)) return; var k = ek(x); if (x.direction === 'IN' && ['SALE_PAYMENT', 'CREDIT_REPAYMENT', 'RECON_PAYMENT'].indexOf(k) >= 0) rin += x.usd_cents; else if (x.party_type === 'SUPPLIER') rout += x.usd_cents; }); var recv = 0, pay = 0, inv = 0, prep = 0;
    s.db.customers.forEach(function (c) { recv += Math.max(0, s.outstanding(c.id)); }); s.db.suppliers.forEach(function (sp) { var b = s.supplierBalances(sp.id); pay += b.payable; prep += b.prepaid; }); s.db.products.forEach(function (p) { inv += s.qty(p.id, 'AVAILABLE') * p.cost_usd_cents; });
    var rows = [{ item: 'Revenue (sales value)', amount: rev, note: 'All sales made in the period, including credit and confirmed branch sales' }, { item: 'Cost of goods sold', amount: cogs, note: 'Cost of the items sold, at the cost recorded when sold' }, { item: 'Gross profit', amount: rev - cogs, note: 'Revenue minus cost of goods' }, { item: 'Expenses', amount: exp, note: 'Recorded expenses in the period' }, { item: 'Operating result', amount: rev - cogs - exp, note: 'Gross profit minus expenses. Not cash.' },
      { item: 'Payments received from customers', amount: rin, note: 'Money actually received in the period (not the same as revenue)' }, { item: 'Payments made to suppliers', amount: rout, note: 'Deposits and balance payments in the period' }, { item: 'Receivables owed by customers (today)', amount: recv, note: 'Credit sales and branch sales not yet paid' }, { item: 'Payables owed to suppliers (today)', amount: pay, note: 'Received orders not yet fully paid' }, { item: 'Deposits paid on unreceived orders (today)', amount: prep, note: 'Money paid to suppliers for goods not yet arrived' }, { item: 'Inventory value at cost (today)', amount: inv, note: 'Available stock only' }];
    return mk('Finance summary', [['item', 'Item', 'text'], ['amount', 'Amount (USD)', 'usd'], ['note', 'What it means', 'text']], rows); });
  rep('expenses_report', 'expenses.view', function (s, f, t) { var rows = grp(s.db.expenses.filter(function (x) { return x.status === 'ACTIVE' && (!f || x.date >= f) && (!t || x.date <= t); }), function (x) { return x.category; }, function (k) { return { category: k, n: 0, usd: 0 }; }, function (r, x) { r.n++; r.usd += x.usd_cents; }); return mk('Expenses by category', [['category', 'Category', 'text'], ['n', 'Entries', 'int'], ['usd', 'Total (USD)', 'usd']], rows); });
  def('reports.run', 'reports.view', false, function (u, p) { var r = REPORTS[p.name]; if (!r) throw E('NOT_FOUND', 'Unknown report'); this.need(u, r.perm); if (p.from && p.to && p.from > p.to) throw E('VALIDATION_FAILED', 'Start date is after the end date'); return r.fn(this, p.from || null, p.to || null, p); });

  /* ----- insights (rule-based, advisory only; no external AI, no cost, never changes records) ----- */
  P.velocity = function (days) { var from = addDays(this.dayKey(), -(days - 1)), ids = {}, v = {}; this.salesIn(from, null).forEach(function (s) { ids[s.id] = 1; }); this.db.saleItems.forEach(function (i) { if (!ids[i.sale_id]) return; var r = v[i.product_id] || (v[i.product_id] = { units: 0, revenue: 0, cost: 0 }); r.units += i.qty; r.revenue += i.qty * i.unit_price_usd_cents; r.cost += i.qty * i.unit_cost_usd_cents; }); return v; };
  P.insightData = function () {
    var self = this, W = 30, vel = this.velocity(W), cover = this.db.settings.reorder_cover_days, inc = {}, out = { window_days: W };
    this.db.poItems.forEach(function (it) { var po = self.find('pos', it.po_id); if (po && (po.status === 'SENT' || po.status === 'CONFIRMED')) inc[it.product_id] = (inc[it.product_id] || 0) + it.qty_ordered; });
    var prods = this.db.products.filter(function (p) { return p.status === 'active'; }).map(function (p) { var v = vel[p.id] || { units: 0, revenue: 0, cost: 0 }, a = self.qty(p.id, 'AVAILABLE'), mn = p.min_stock == null ? self.db.settings.default_min_stock : p.min_stock; return { id: p.id, name: p.name, category: p.category, available: a, min: mn, units: v.units, revenue: v.revenue, profit: v.revenue - v.cost, per_day: v.units / W, incoming: inc[p.id] || 0, cost_aed_minor: p.cost_aed_minor }; });
    out.top_sellers = prods.filter(function (x) { return x.units > 0; }).sort(function (a, b) { return b.units - a.units; }).slice(0, 10);
    out.profit = prods.filter(function (x) { return x.units > 0; }).sort(function (a, b) { return b.profit - a.profit; }).slice(0, 10);
    out.slow = prods.filter(function (x) { return x.available > 0 && x.units === 0; }).slice(0, 15);
    out.reorder = prods.map(function (x) { var base = x.per_day > 0 ? Math.ceil(x.per_day * cover) : 0, need = Math.max(base, x.min), sug = Math.max(0, need - x.available - x.incoming); return { id: x.id, name: x.name, available: x.available, incoming: x.incoming, per_day: Math.round(x.per_day * 100) / 100, days_left: x.per_day > 0 ? Math.floor(x.available / x.per_day) : null, suggested: sug, est_cost_aed_minor: sug * x.cost_aed_minor, reason: x.per_day > 0 ? 'Selling about ' + (Math.round(x.per_day * 10) / 10) + ' per day; ' + cover + ' days of cover targeted' : 'At or below the minimum level of ' + x.min }; }).filter(function (x) { return x.suggested > 0; }).sort(function (a, b) { return (a.days_left == null ? 999 : a.days_left) - (b.days_left == null ? 999 : b.days_left); });
    var cust = {}; this.salesIn(addDays(this.dayKey(), -(W - 1)), null).forEach(function (s) { var r = cust[s.customer_id] || (cust[s.customer_id] = { id: s.customer_id, name: self.nm('customers', s.customer_id), txns: 0, revenue: 0 }); r.txns++; r.revenue += s.total_usd_cents; });
    out.customers = Object.keys(cust).map(function (k) { var r = cust[k]; r.avg = Math.round(r.revenue / r.txns); r.owes = self.outstanding(r.id); return r; }).sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, 10);
    out.branches = this.REPORT('branch_summary').rows; out.anomalies = this.anomalies(); return out;
  };
  P.REPORT = function (n) { return REPORTS[n].fn(this, null, null, {}); };
  P.anomalies = function () {
    var self = this, a = [], sales = this.db.sales.filter(function (s) { return s.status === 'ACTIVE' && s.source === 'POS'; }), tot = sales.map(function (s) { return s.total_usd_cents; });
    if (tot.length >= 8) { var mean = tot.reduce(function (x, y) { return x + y; }, 0) / tot.length, sd = Math.sqrt(tot.reduce(function (x, y) { return x + (y - mean) * (y - mean); }, 0) / tot.length), sorted = tot.slice().sort(function (x, y) { return x - y; }), med = sorted[Math.floor(sorted.length / 2)];
      sales.forEach(function (s) { if (s.total_usd_cents > mean + 3 * sd && s.total_usd_cents > 2 * med) a.push({ type: 'Unusually large sale', text: fU(s.total_usd_cents) + ' (typical sale is about ' + fU(med) + ')', ref: s.id, at: s.at }); }); }
    this.db.sales.forEach(function (s) { if (s.status === 'REVERSED') a.push({ type: 'Reversed sale', text: fU(s.total_usd_cents) + ' reversed by ' + (s.reversed_by || '?') + ': ' + (s.reverse_reason || ''), ref: s.id, at: s.reversed_at || s.at }); });
    this.db.movements.forEach(function (m) { if (m.type === 'ADJUSTMENT' && m.qty >= 10) a.push({ type: 'Large stock adjustment', text: m.qty + ' units of ' + self.nm('products', m.product_id) + ': ' + (m.reason || ''), ref: m.id, at: m.at }); });
    this.db.audit.forEach(function (x) { if (x.action === 'PRICE_CHANGED' && x.old > 0 && Math.abs(x.new - x.old) / x.old > 0.25) a.push({ type: 'Large price change', text: self.nm('products', x.entity_id) + ': ' + fU(x.old) + ' to ' + fU(x.new), ref: x.entity_id, at: x.at }); if (x.action === 'PAYMENT_REVERSED') a.push({ type: 'Payment reversed', text: 'By ' + x.user + ': ' + (x.reason || ''), ref: x.entity_id, at: x.at }); });
    this.db.customers.forEach(function (c) { var o = self.outstanding(c.id); if (c.credit_limit_usd_cents > 0 && o > 0.9 * c.credit_limit_usd_cents) a.push({ type: 'Near credit limit', text: c.name + ' owes ' + fU(o) + ' of ' + fU(c.credit_limit_usd_cents), ref: c.id, at: self.iso() }); });
    return a.sort(function (x, y) { return x.at < y.at ? 1 : -1; }).slice(0, 25);
  };
  def('insights.get', 'insights.view', false, function (u) {
    var d = this.insightData(), t = this.dayKey(), self = this, ms = t.slice(0, 7) + '-01', today = this.salesIn(t, t), month = this.salesIn(ms, t), sum = function (a) { return a.reduce(function (s, x) { return s + x.total_usd_cents; }, 0); };
    d.summary = { today: 'Today: ' + today.length + ' sale(s) worth ' + fU(sum(today)) + '.', month: 'This month: ' + month.length + ' sale(s) worth ' + fU(sum(month)) + (month.length ? ', gross profit ' + fU(month.reduce(function (s, x) { return s + x.total_usd_cents - x.cost_usd_cents; }, 0)) : '') + '.', stock: d.reorder.length + ' product(s) suggested for reorder.', attention: d.anomalies.length + ' item(s) worth a look.' };
    if (!this.permsOf(u).includes('finance.view')) { d.profit = []; } return d;
  });
  def('insights.ask', 'insights.view', false, function (u, p) {
    var q = String(p.question || '').toLowerCase(), d = this.insightData(), self = this, fin = this.permsOf(u).indexOf('finance.view') >= 0, t = this.dayKey();
    function has() { for (var i = 0; i < arguments.length; i++) if (q.indexOf(arguments[i]) >= 0) return true; return false; }
    function tbl(cols, rows, text) { return { answer: text, columns: cols, rows: rows }; }
    if (has('reorder', 'order more', 'should i buy', 'what to buy')) return tbl([['name', 'Product', 'text'], ['available', 'In stock', 'int'], ['suggested', 'Suggested qty', 'int'], ['reason', 'Why', 'text']], d.reorder.slice(0, 15), d.reorder.length ? 'Suggested reorders, most urgent first:' : 'Nothing needs reordering right now.');
    if (has('fastest', 'selling fast', 'best sell', 'top sell', 'most sold', 'popular')) return tbl([['name', 'Product', 'text'], ['units', 'Units (30 days)', 'int'], ['revenue', 'Revenue', 'usd']], d.top_sellers, d.top_sellers.length ? 'Fastest-selling products in the last 30 days:' : 'There are no sales in the last 30 days yet.');
    if (has('profit')) { if (!fin) return { answer: 'You do not have permission to see profit figures.' }; return tbl([['name', 'Product', 'text'], ['profit', 'Gross profit (30 days)', 'usd'], ['units', 'Units', 'int']], d.profit, d.profit.length ? 'Most profitable products in the last 30 days:' : 'There are no sales in the last 30 days yet.'); }
    if (has('low', 'running out', 'run out', 'out of stock')) { var r = this.REPORT('low_stock'); return tbl(r.columns, r.rows, r.rows.length + ' product(s) are low or out of stock:'); }
    if (has('customers owe', 'owe us', 'owed to us', 'receivable', 'who owes')) { var rows = this.db.customers.map(function (c) { return { name: c.name, owes: self.outstanding(c.id) }; }).filter(function (x) { return x.owes > 0; }).sort(function (a, b) { return b.owes - a.owes; }); return tbl([['name', 'Customer', 'text'], ['owes', 'Owes', 'usd']], rows, 'Customers owe you ' + fU(rows.reduce(function (s, x) { return s + x.owes; }, 0)) + ' in total.'); }
    if (has('i owe', 'we owe', 'suppliers', 'supplier balance', 'payable')) { var rs = this.db.suppliers.map(function (s) { var b = self.supplierBalances(s.id); return { name: s.name, owe: b.payable, prepaid: b.prepaid }; }); return tbl([['name', 'Supplier', 'text'], ['owe', 'We owe', 'usd'], ['prepaid', 'Deposits on unreceived orders', 'usd']], rs, 'You owe suppliers ' + fU(rs.reduce(function (s, x) { return s + x.owe; }, 0)) + ' for received goods.'); }
    if (has('overdue')) { var now = this.now().getTime(), od = this.db.collItems.filter(function (it) { return it.status === 'PENDING' && now - new Date(self.find('collections', it.collection_id).collected_at).getTime() > OVERDUE_MS; }).map(function (it) { var c = self.find('collections', it.collection_id); return { branch: self.nm('branches', c.branch_id), name: self.nm('products', it.product_id), qty: it.qty, tech: self.nm('people', c.technician_id), hours: Math.floor((now - new Date(c.collected_at).getTime()) / 3600000) }; }); return tbl([['branch', 'Branch', 'text'], ['name', 'Product', 'text'], ['qty', 'Qty', 'int'], ['tech', 'Technician', 'text'], ['hours', 'Hours pending', 'int']], od, od.length ? od.length + ' overdue pending item(s) need a manager decision:' : 'No pending branch items are overdue.'); }
    if (has('branch', 'pending')) { return tbl(d.branches.length ? [['branch', 'Branch', 'text'], ['collected', 'Collected', 'int'], ['sold', 'Sold', 'int'], ['pending', 'Pending', 'int'], ['overdue', 'Overdue', 'int']] : [], d.branches, 'Branch status (all time):'); }
    if (has('this month', 'month')) { var ms = this.salesIn(t.slice(0, 7) + '-01', t), tot = ms.reduce(function (s, x) { return s + x.total_usd_cents; }, 0); return { answer: 'This month you made ' + ms.length + ' sale(s) worth ' + fU(tot) + (fin ? ' with gross profit of ' + fU(ms.reduce(function (s, x) { return s + x.total_usd_cents - x.cost_usd_cents; }, 0)) : '') + '.' }; }
    if (has('today')) { var ts = this.salesIn(t, t); return { answer: 'Today: ' + ts.length + ' sale(s) worth ' + fU(ts.reduce(function (s, x) { return s + x.total_usd_cents; }, 0)) + '.' }; }
    return { answer: 'I can answer questions about: fastest-selling products, low stock, what to reorder, most profitable products, who owes you, what you owe suppliers, branch pending/overdue items, and sales today or this month.' };
  });

  P.isWrite = function (a) { return !!(A[a] && A[a].write) || a === 'auth.logout'; };
  P.dispatch = function (req) {
    try {
      var a = req.action, p = req.payload || {};
      if (a === 'ping') return { ok: true, data: { pong: true } };
      if (a === 'auth.login') return { ok: true, data: this.login(p) }; if (a === 'auth.setup') return { ok: true, data: this.setup(p) };
      var def_ = A[a]; if (!def_) throw E('BAD_REQUEST', 'Unknown action: ' + a); var u = this.session(req.token);
      if (def_.perm) this.need(u, def_.perm);
      if (def_.write && req.client_txn_id) { var log = this.db.syncLog; for (var i = 0; i < log.length; i++) if (log[i].txn === req.client_txn_id) { if (log[i].user !== u.id) throw E('DUPLICATE_TXN', 'Transaction id already used'); return { ok: true, duplicate: true, data: log[i].data }; } }
      var data = def_.fn.call(this, u, p, req);
      if (def_.write) { if (req.client_txn_id) this.db.syncLog.push({ txn: req.client_txn_id, action: a, at: this.iso(), user: u.id, data: data }); this.onChange(); }
      else if (a === 'auth.logout') this.onChange();
      return { ok: true, data: data };
    } catch (e) { return { ok: false, error: { code: e.code || 'INTERNAL', message: e.message } }; }
  };

  return { Engine: Engine, seed: seed, migrate: migrate, sha256: sha256, ALL_PERMS: ALL_PERMS, OVERDUE_MS: OVERDUE_MS };
});

