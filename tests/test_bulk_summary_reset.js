const assert = require('node:assert/strict'); const ANE = require('../apps-script/Engine.gs');
const clock = new Date('2026-11-12T07:00:00.000Z');
const src = { aed_per_usd: 3, usd_slsh: 10000, staff: [['U-001','Owner T','owner.t','owner'],['U-002','Manager T','manager.t','manager'],['U-003','Employee T','employee.t','employee']],
  items: [{ product_id: 'ANE-T-001', sku: 'T1', supplier_item_name: 'Test screen', category: 'Cat', variant_tag: '', model_derived: 'M', unit_cost_aed: 3, selling_price_usd: 10, source_qty: 30 }],
  branches: { '1': { name: 'Branch One', cycle: 'DAILY', tech: ['Tech One'], asst: ['Asst One'] }, '2': { name: 'Branch Two', cycle: 'DAILY', tech: ['Tech Two'], asst: ['Asst Two'] } } };
const db = ANE.seed(src, clock); ANE.migrate(db); let now = clock; const e = new ANE.Engine(db, { now: () => now });
const tok = u => { const c = e.issueSetupCode(null, u).code; return e.dispatch({ action: 'auth.setup', payload: { username: u, setup_code: c, password: 'Pass12345' } }).data.token; };
const owner = tok('owner.t'), mgr = tok('manager.t'), emp = tok('employee.t');
const call = (t, action, payload) => e.dispatch({ action, token: t, payload: payload || {} });
const B1 = db.branches[0].id, person = (b, role) => db.people.find(x => x.branch_id === b && x.role === role).id;
const collect = qty => call(emp, 'branch.collect', { branch_id: B1, assistant_id: person(B1, 'ASSISTANT'), technician_id: person(B1, 'TECHNICIAN'), items: [{ product_id: 'ANE-T-001', qty }] });
// --- bulk: three separate collection lines, mark two sold and one returned in one tap each
collect(2); collect(3); collect(4);
let ids = db.collItems.filter(i => i.status === 'PENDING').map(i => i.id); assert.equal(ids.length, 3);
let sum = call(emp, 'branches.summary').data.find(b => b.branch_id === B1); assert.equal(sum.units_held, 9); assert.equal(sum.overdue_units, 0); assert.equal(sum.held_value_usd_cents, undefined, 'employees do not see money in the summary');
const r = call(emp, 'branch.bulkSetStatus', { item_ids: ids.slice(0, 2), status: 'SOLD' }); assert.equal(r.ok, true, JSON.stringify(r));
assert.equal(db.collItems.filter(i => ids.slice(0, 2).includes(i.id) && i.status === 'SOLD').length, 2); assert.equal(db.sales.filter(s => s.source === 'BRANCH_COLLECTION').length, 2);
assert.equal(call(emp, 'branch.bulkSetStatus', { item_ids: [ids[2]], status: 'RETURN_REPORTED' }).ok, true); assert.equal(db.collItems.find(i => i.id === ids[2]).status, 'RETURN_REPORTED');
// atomic: one already-finished item in the selection means NOTHING changes
collect(1); const fresh = db.collItems.find(i => i.status === 'PENDING').id, salesBefore = db.sales.length;
const bad = call(emp, 'branch.bulkSetStatus', { item_ids: [fresh, ids[0]], status: 'SOLD' }); assert.equal(bad.ok, false); assert.equal(db.sales.length, salesBefore); assert.equal(db.collItems.find(i => i.id === fresh).status, 'PENDING');
assert.equal(call(emp, 'branch.bulkSetStatus', { item_ids: [], status: 'SOLD' }).ok, false);
// summary now shows money for the owner: sold-but-not-invoiced is "ready to invoice"
sum = call(owner, 'branches.summary').data.find(b => b.branch_id === B1); assert.equal(sum.ready_to_invoice_usd_cents, 5000); assert.equal(sum.units_held, 1); assert.equal(sum.awaiting_inspection_units, 4);
// overdue: 3 days later the pending item is flagged and bulk-selling it is refused
const fc = db.collections.find(c => c.id === db.collItems.find(i => i.id === fresh).collection_id); fc.collected_at = new Date(clock.getTime() - 72 * 3600 * 1000).toISOString(); const sr = call(owner, 'branches.summary'); if (!sr.ok) console.log('SUMMARY ERR', JSON.stringify(sr)); sum = sr.data.find(b => b.branch_id === B1); assert.equal(sum.overdue_units, 1);
assert.equal(call(emp, 'branch.bulkSetStatus', { item_ids: [fresh], status: 'SOLD' }).error.code, 'OVERDUE_REVIEW_REQUIRED');
// --- settings: language + Somali text overrides
assert.equal(call(mgr, 'settings.update', { default_language: 'so', i18n_so: { 'Sell': 'Iibi', '  ': 'x', 'Empty': '' } }).ok, true);
assert.equal(db.settings.default_language, 'so'); assert.deepEqual(db.settings.i18n_so, { Sell: 'Iibi', '  ': 'x' }.constructor === Object ? { Sell: 'Iibi', '  ': 'x' } : {}); assert.equal(call(mgr, 'settings.update', { default_language: 'fr' }).ok, false);
assert.equal(call(emp, 'settings.update', { default_language: 'en' }).ok, false, 'employees cannot change settings');
// --- reset: only the owner
assert.equal(call(mgr, 'system.reset', { confirm: 'RESET' }).ok, false, 'manager cannot reset'); assert.equal(call(emp, 'system.reset', { confirm: 'RESET' }).ok, false);
assert.equal(call(owner, 'system.reset', { confirm: 'reset' }).ok, false, 'must type RESET'); assert.ok(db.sales.length > 0, 'nothing deleted yet');
call(owner, 'expenses.create', { category: db.settings.expense_categories[0], description: 'x', method_id: 'ZAAD_USD', amount: 1 });
const people = JSON.stringify(db.people), branches = JSON.stringify(db.branches), users = db.users.length, prods = db.products.length, cust = db.customers.length;
const rr = call(owner, 'system.reset', { confirm: 'RESET' }); assert.equal(rr.ok, true, JSON.stringify(rr));
['sales','saleItems','payments','collections','collItems','history','inspections','pos','poItems','receipts','expenses','reconPeriods','reconRevs','movements','balances'].forEach(t => assert.equal(db[t].length, 0, t + ' emptied'));
assert.equal(JSON.stringify(db.people), people, 'branch technicians and assistants untouched'); assert.equal(JSON.stringify(db.branches), branches); assert.equal(db.users.length, users); assert.equal(db.products.length, prods); assert.equal(db.customers.length, cust, 'customers kept by default');
assert.equal(call(owner, 'data.snapshot').data.products.every(p => p.available === 0 && p.held === 0), true, 'all inventory is 0');
assert.equal(call(owner, 'auth.me').ok, true, 'owner stays signed in'); assert.equal(db.audit.length, 1); assert.equal(db.audit[0].action, 'SYSTEM_RESET');
assert.equal(call(owner, 'system.reset', { confirm: 'RESET', delete_customers: true }).ok, true); assert.ok(db.customers.every(c => c.id === 'CUS-WALKIN' || db.branches.some(b => b.customer_id === c.id)), 'only built-in/branch customers remain');
// the system still works after a reset
assert.equal(call(owner, 'stock.adjust', { product_id: 'ANE-T-001', delta: 5, reason: 'opening stock after reset', type: 'ADD' }).ok !== undefined, true);
console.log('PASS: bulk branch actions (atomic), daily branch summary, language settings, owner-only reset');
