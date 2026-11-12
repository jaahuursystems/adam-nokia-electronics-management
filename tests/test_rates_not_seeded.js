const assert = require('node:assert/strict');
const ANE = require('../apps-script/Engine.gs');
const clock = new Date('2026-11-12T07:00:00.000Z');
const src = { staff: [['U-001','Owner Test','owner.test','owner'],['U-002','Employee Test','employee.test','employee']],
  items: [{ product_id: 'ANE-TST-001', sku: 'TST-001', supplier_item_name: 'Test part', category: 'Test', variant_tag: '', model_derived: 'Test', selling_price_usd: 10, source_qty: 5 }],
  branches: { '1': { name: 'B1', cycle: 'DAILY', tech: ['T'], asst: ['A'] } } };
const db = ANE.seed(src, clock); ANE.migrate(db);
assert.equal(db.rates.length, 0, 'no exchange rate may be invented by the seed');
const e = new ANE.Engine(db, { now: () => clock });
const code = e.issueSetupCode(null, 'owner.test').code;
const tok = e.dispatch({ action: 'auth.setup', payload: { username: 'owner.test', setup_code: code, password: 'Pass12345' } }).data.token;
const usd = e.dispatch({ action: 'sales.create', token: tok, payload: { customer_id: 'CUS-WALKIN', method_id: 'ZAAD_USD', items: [{ product_id: 'ANE-TST-001', qty: 1 }] } });
assert.equal(usd.ok, true, 'USD sale works without any rate');
const sl = e.dispatch({ action: 'sales.create', token: tok, payload: { customer_id: 'CUS-WALKIN', method_id: 'ZAAD_SLSH', items: [{ product_id: 'ANE-TST-001', qty: 1 }] } });
assert.equal(sl.ok, false); assert.equal(sl.error.code, 'RATE_NOT_SET', 'SLSH payment must be refused until the manager sets a rate');
assert.equal(e.dispatch({ action: 'rates.set', token: tok, payload: { pair: 'USD_SLSH', rate: 12345 } }).ok, true);
console.log('PASS: seed never invents exchange rates; SLSH payments need a manager-set rate');
