const assert = require('node:assert/strict'); const ANE = require('../apps-script/Engine.gs');
const clock = new Date('2026-11-12T07:00:00.000Z');
const src = { aed_per_usd: 3, usd_slsh: 10000, staff: [['U-001','Owner T','owner.t','owner'],['U-003','Employee T','employee.t','employee']],
  items: [{ product_id: 'ANE-T-001', sku: 'T1', supplier_item_name: 'Test screen', category: 'Cat', variant_tag: '', model_derived: 'M', unit_cost_aed: 3, selling_price_usd: 10, source_qty: 20 }],
  branches: { '1': { name: 'Branch One', cycle: 'DAILY', tech: ['Tech One'], asst: ['Asst One'] }, '2': { name: 'Branch Two', cycle: 'DAILY', tech: ['Tech Two'], asst: ['Asst Two'] } } };
const db = ANE.seed(src, clock); ANE.migrate(db); const e = new ANE.Engine(db, { now: () => clock });
const tok = u => { const c = e.issueSetupCode(null, u).code; return e.dispatch({ action: 'auth.setup', payload: { username: u, setup_code: c, password: 'Pass12345' } }).data.token; };
const owner = tok('owner.t'), emp = tok('employee.t');
const call = (t, action, payload) => e.dispatch({ action, token: t, payload: payload || {} });
const br = id => db.branches.find(b => b.id === id), person = (b, role) => db.people.find(x => x.branch_id === b && x.role === role).id;
const avail = () => db.balances.find(b => b.product_id === 'ANE-T-001' && b.loc === 'AVAILABLE').qty;
const B1 = db.branches[0].id, B2 = db.branches[1].id, cust = db.branches[0].customer_id;
const before = avail();
const r = call(emp, 'branch.directSale', { branch_id: B1, assistant_id: person(B1, 'ASSISTANT'), technician_id: person(B1, 'TECHNICIAN'), items: [{ product_id: 'ANE-T-001', qty: 3 }] });
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(avail(), before - 3, 'stock leaves Available once');
assert.equal(db.balances.filter(b => b.loc === 'BRANCH:' + B1).reduce((a, b) => a + b.qty, 0), 0, 'nothing stays with the branch: it was sold, not left pending');
const sale = db.sales.find(s => s.id === r.data.sale_ids[0]); assert.equal(sale.source, 'BRANCH_COLLECTION'); assert.equal(sale.branch_id, B1); assert.equal(sale.payment_method, 'BRANCH_ACCOUNT'); assert.equal(sale.total_usd_cents, 3000);
assert.equal(e.customerCreditOutstanding(cust), 0, 'a branch sale must never create ORDINARY customer credit');
// wrong assistant for the branch is rejected and changes nothing
const bad = call(emp, 'branch.directSale', { branch_id: B1, assistant_id: person(B2, 'ASSISTANT'), technician_id: person(B1, 'TECHNICIAN'), items: [{ product_id: 'ANE-T-001', qty: 1 }] }); assert.equal(bad.ok, false); assert.equal(avail(), before - 3);
// more than in stock is rejected
assert.equal(call(emp, 'branch.directSale', { branch_id: B1, assistant_id: person(B1, 'ASSISTANT'), technician_id: person(B1, 'TECHNICIAN'), items: [{ product_id: 'ANE-T-001', qty: 999 }] }).error.code, 'INSUFFICIENT_STOCK');
// idempotent
const dupReq = { action: 'branch.directSale', token: emp, client_txn_id: 'TXN-DUP-0001', payload: { branch_id: B2, assistant_id: person(B2, 'ASSISTANT'), technician_id: person(B2, 'TECHNICIAN'), items: [{ product_id: 'ANE-T-001', qty: 2 }] } };
assert.equal(e.dispatch(dupReq).ok, true); assert.equal(e.dispatch(dupReq).duplicate, true); assert.equal(avail(), before - 5, 'replay does not deduct twice');
// breakdown: nothing invoiced yet, but sold-not-invoiced is visible per branch
let bd = call(owner, 'customers.breakdowns').data[cust]; assert.equal(bd.branches.length, 2);
assert.equal(bd.branches.find(x => x.branch_id === B1).sold_not_invoiced_usd_cents, 3000); assert.equal(bd.total_usd_cents, 0, 'total counts invoiced balances only');
// generate the report/invoice for Branch 1, then the breakdown shows what is owed per branch
assert.equal(call(owner, 'recon.generate', { branch_id: B1, date: e.dayKey() }).ok, true);
bd = call(owner, 'customers.breakdowns').data[cust];
assert.equal(bd.branches.find(x => x.branch_id === B1).invoiced_outstanding_usd_cents, 3000); assert.equal(bd.branches.find(x => x.branch_id === B2).invoiced_outstanding_usd_cents, 0);
assert.equal(bd.total_usd_cents, 3000); assert.equal(call(owner, 'data.snapshot').data.customers.find(c => c.id === cust).outstanding_usd_cents, 3000, 'headline total equals breakdown total');
// SEPARATE LEDGERS: an ordinary customer repayment must not reduce the branch invoice
const rep = call(owner, 'payments.recordRepayment', { customer_id: cust, method_id: 'ZAAD_USD', amount: 10 });
bd = call(owner, 'customers.breakdowns').data[cust]; assert.equal(bd.branches.find(x => x.branch_id === B1).invoiced_outstanding_usd_cents, 3000, 'ordinary repayment never reduces a branch invoice');
console.log('PASS: branch direct sale (billed to branch ledger, atomic, idempotent) and per-branch customer breakdown');
