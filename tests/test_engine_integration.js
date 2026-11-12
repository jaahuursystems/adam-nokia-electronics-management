const assert = require('node:assert/strict');
const ANE = require('../apps-script/Engine.gs');
let clock = new Date('2026-11-12T07:00:00.000Z');
const src = {
  aed_per_usd: 3.6725,
  staff: [
    ['U-001','Owner One','owner.one','owner'],
    ['U-002','Manager One','manager.one','manager'],
    ['U-003','Employee One','employee.one','employee']
  ],
  items: [{product_id:'ITM-001',sku:'ITM-001',supplier_item_name:'iPhone 13 OLED',category:'iPhone LCD',variant_tag:'OLED',model_derived:'iPhone 13',unit_cost_aed:50,selling_price_usd:100,source_qty:20}],
  branches: {'1':{name:'Branch One',cycle:'DAILY',tech:['Technician'],asst:['Assistant']},'2':{name:'Branch Two',cycle:'DAILY',tech:['Technician 2'],asst:['Assistant 2']},'3':{name:'Branch Three',cycle:'DAILY',tech:['Technician 3'],asst:['Assistant 3']},'4':{name:'Branch Four',cycle:'DAILY',tech:['Technician 4'],asst:['Assistant 4']}}
};
const db = ANE.seed(src, clock);
db.roles.manager.perms = ['sales.create','sales.view','inventory.view','inventory.manage','price.update','stock.adjust','rates.update','customers.view','customers.create','customers.manage','credit.approve','payments.record','finance.view','branch.view','branch.collect','branch.setStatus','branch.inspect','branch.approve','audit.view','settings.manage'];
ANE.migrate(db);
const e = new ANE.Engine(db,{now:()=>clock});
function setup(username){const c=e.issueSetupCode(null,username);const r=e.dispatch({action:'auth.setup',payload:{username,setup_code:c.code,password:'Pass12345'}});assert.equal(r.ok,true,r.error&&r.error.message);return r.data.token;}
const owner=setup('owner.one'), manager=setup('manager.one'), employee=setup('employee.one');
function call(token,action,payload={},txn){return e.dispatch({action,token,payload,client_txn_id:txn});}
const customer='CUS-AANR', product='ITM-001';
assert.equal(db.branches.length,4,'all four configured branches must remain available');
assert.ok(db.roles.manager.perms.includes('purchasing.manage'),'the untouched default manager role receives the new business permissions');
assert.ok(!db.roles.manager.perms.includes('users.manage'),'manager must not receive owner-only user administration');
assert.equal(db.branches[0].due_offset_days,1);
assert.equal(db.products[0].id,'ITM-001','migration must preserve existing product IDs');
assert.ok(Array.isArray(db.pos)&&Array.isArray(db.reconPeriods));
const capturedRate = e.rateRecord('USD_SLSH');
assert.equal(call(manager,'rates.set',{pair:'USD_SLSH',rate:12000}).ok,true);
const rateSale = call(employee,'sales.create',{customer_id:'CUS-WALKIN',method_id:'ZAAD_SLSH',rate_id:capturedRate.id,offline_at:'2026-11-12T06:55:00.000Z',items:[{product_id:product,qty:1}]});
assert.equal(rateSale.ok,true,rateSale.error&&rateSale.error.message);
assert.equal(rateSale.data.sale.rate_id,capturedRate.id);
assert.equal(rateSale.data.sale.rate_usd_slsh,capturedRate.rate,'offline sale must use the captured historical rate');
assert.equal(rateSale.data.sale.offline_at,'2026-11-12T06:55:00.000Z');
const exp = call(manager,'expenses.create',{category:db.settings.expense_categories[0],description:'Test expense',method_id:'ZAAD_SLSH',amount:1000,rate_id:capturedRate.id,offline_at:'2026-11-12T06:56:00.000Z'});
assert.equal(exp.ok,true,exp.error&&exp.error.message);
assert.equal(exp.data.rate_id,capturedRate.id,'offline expense must use the captured historical rate');
assert.equal(exp.data.offline_at,'2026-11-12T06:56:00.000Z');

// Credit and branch balances remain separate.
assert.equal(call(manager,'customers.setCredit',{customer_id:customer,approved:true,limit_usd:1000}).ok,true);
let sale=call(employee,'sales.create',{customer_id:customer,method_id:'CREDIT',items:[{product_id:product,qty:1}]});
assert.equal(sale.ok,true,sale.error&&sale.error.message);
assert.equal(e.customerCreditOutstanding(customer),10000);
assert.equal(e.branchOutstanding(customer),0);
const collectionPayload={branch_id:'BR-1',assistant_id:'BR-1-A01',technician_id:'BR-1-T01',client_collection_id:'COL-DEVICE-0001',offline_at:'2026-11-12T06:50:00.000Z',items:[{product_id:product,qty:1,client_item_id:'CIT-DEVICE-0001'}]};
let collection=call(employee,'branch.collect',collectionPayload,'TXN-DEVICE-COLLECT-001');
assert.equal(collection.ok,true,collection.error&&collection.error.message);
assert.equal(collection.data.id,'COL-DEVICE-0001');
assert.equal(db.collections[0].collected_at,'2026-11-12T06:50:00.000Z');
assert.equal(db.collections[0].synced_at,clock.toISOString());
let duplicateCollection=call(employee,'branch.collect',collectionPayload,'TXN-DEVICE-COLLECT-001');
assert.equal(duplicateCollection.ok,true); assert.equal(duplicateCollection.duplicate,true); assert.equal(db.collections.length,1,'replayed offline collection must not duplicate');
let sold=call(employee,'branch.setItemStatus',{item_id:'CIT-DEVICE-0001',status:'SOLD',qty:1});
assert.equal(sold.ok,true,sold.error&&sold.error.message);
let splitCollection=call(employee,'branch.collect',{branch_id:'BR-1',assistant_id:'BR-1-A01',technician_id:'BR-1-T01',client_collection_id:'COL-DEVICE-0002',items:[{product_id:product,qty:2,client_item_id:'CIT-DEVICE-0002'}]});
assert.equal(splitCollection.ok,true,splitCollection.error&&splitCollection.error.message);
let partialSold=call(employee,'branch.setItemStatus',{item_id:'CIT-DEVICE-0002',status:'SOLD',qty:1,client_split_item_id:'CIT-DEVICE-SPLIT-01'});
assert.equal(partialSold.ok,true,partialSold.error&&partialSold.error.message);
assert.equal(db.collItems.find(x=>x.id==='CIT-DEVICE-0002').qty,1);
assert.equal(db.collItems.find(x=>x.id==='CIT-DEVICE-SPLIT-01').qty,1);
assert.equal(db.collItems.find(x=>x.id==='CIT-DEVICE-SPLIT-01').status,'SOLD');
let report=call(manager,'recon.generate',{branch_id:'BR-1',date:'2026-11-12'});
assert.equal(report.ok,true,report.error&&report.error.message);
assert.equal(e.customerCreditOutstanding(customer),10000);
assert.equal(e.branchOutstanding(customer),20000);
// Ordinary repayment cannot settle branch report debt.
let repay=call(manager,'payments.recordRepayment',{customer_id:customer,method_id:'ZAAD_USD',amount:100,offline_at:'2026-11-12T06:58:00.000Z'});
assert.equal(repay.ok,true,repay.error&&repay.error.message);
assert.equal(db.payments.find(x=>x.id===repay.data.id).offline_at,'2026-11-12T06:58:00.000Z');
assert.equal(e.customerCreditOutstanding(customer),0);
assert.equal(e.branchOutstanding(customer),20000);
assert.equal(e.outstanding(customer),20000);
let allocation=call(manager,'payments.reclassifyToBranch',{payment_id:repay.data.id,period_id:db.reconPeriods[0].id,amount:40,reason:'Historical payment was for branch report'});
assert.equal(allocation.ok,true,allocation.error&&allocation.error.message);
assert.equal(e.customerCreditOutstanding(customer),4000);
assert.equal(e.branchOutstanding(customer),16000);
assert.equal(e.outstanding(customer),20000);
let extra=call(manager,'payments.recordRepayment',{customer_id:customer,method_id:'ZAAD_USD',amount:41});
assert.equal(extra.ok,false);
assert.equal(extra.error.code,'VALIDATION_FAILED');
// Branch payment settles only its reconciliation invoice.
let per=db.reconPeriods[0];
let bp=call(manager,'recon.pay',{period_id:per.id,method_id:'ZAAD_USD',amount:40,offline_at:'2026-11-12T06:57:00.000Z'});
assert.equal(bp.ok,true,bp.error&&bp.error.message);
assert.equal(e.customerCreditOutstanding(customer),4000);
assert.equal(e.branchOutstanding(customer),12000);
assert.equal(e.outstanding(customer),16000);
let statement=call(manager,'customers.statement',{customer_id:customer});
assert.equal(statement.ok,true);
assert.equal(statement.data.customer_credit_balance,4000);
assert.equal(statement.data.branch_reconciliation_balance,12000);
assert.equal(statement.data.rows.filter(x=>x.type==='Branch reconciliation invoice · Branch One').length,1);
assert.equal(statement.data.rows.filter(x=>x.type==='Customer credit sale').length,1);
// Reverse each payment: only its own ledger is restored.
assert.equal(call(manager,'payments.reverse',{payment_id:repay.data.id,reason:'Test reversal'}).ok,true);
assert.equal(e.customerCreditOutstanding(customer),10000);
assert.equal(e.branchOutstanding(customer),12000);
assert.equal(call(manager,'payments.reverse',{payment_id:db.payments.find(x=>x.kind==='RECON_PAYMENT' && x.ref===per.id && !x.reclassified_from).id,reason:'Test reversal'}).ok,true);
assert.equal(e.customerCreditOutstanding(customer),10000);
assert.equal(e.branchOutstanding(customer),16000);

// Purchasing: deposits, no partial deliveries, discrepancy review and stock only after approval.
let supplier=call(manager,'suppliers.save',{name:'Test Supplier',payment_terms:'Deposit then balance'});
assert.equal(supplier.ok,true,supplier.error&&supplier.error.message);
let po=call(manager,'po.create',{supplier_id:supplier.data.id,items:[{product_id:product,qty:3,unit_cost_aed:10}]});
assert.equal(po.ok,true,po.error&&po.error.message);
assert.equal(call(manager,'po.setStatus',{po_id:po.data.id,status:'SENT'}).ok,true);
let dep=call(manager,'po.pay',{po_id:po.data.id,method_id:'ZAAD_SLSH',amount:1000,rate_id:capturedRate.id,offline_at:'2026-11-12T06:59:00.000Z'});
assert.equal(dep.ok,true,dep.error&&dep.error.message);
assert.equal(db.payments[db.payments.length-1].rate_id,capturedRate.id);
assert.equal(db.payments[db.payments.length-1].offline_at,'2026-11-12T06:59:00.000Z');
let before=e.qty(product,'AVAILABLE');
let partial=call(manager,'po.receive',{po_id:po.data.id,lines:[{po_item_id:db.poItems[0].id,qty:2,unit_cost_aed:10}],notes:'short shipment'});
assert.equal(partial.ok,false);
assert.equal(partial.error.code,'VALIDATION_FAILED');
assert.equal(e.qty(product,'AVAILABLE'),before);
let received=call(manager,'po.receive',{po_id:po.data.id,lines:[{po_item_id:db.poItems[0].id,qty:3,unit_cost_aed:11}],notes:'Supplier changed agreed cost'});
assert.equal(received.ok,true,received.error&&received.error.message);
assert.equal(received.data.review,true);
assert.equal(e.qty(product,'AVAILABLE'),before,'no stock until discrepancy approved');
let approved=call(manager,'po.approveReceipt',{po_id:po.data.id,notes:'Approved'});
assert.equal(approved.ok,true,approved.error&&approved.error.message);
assert.equal(e.qty(product,'AVAILABLE'),before+3);
assert.equal(db.products[0].cost_aed_minor,1100);
assert.equal(e.supplierBalances(supplier.data.id).prepaid,0);
assert.ok(e.supplierBalances(supplier.data.id).payable>0);

// New staff without a temporary password receive a one-time setup code.
let newUser=call(owner,'users.create',{full_name:'New Employee',username:'new.employee',role:'employee'});
assert.equal(newUser.ok,true,newUser.error&&newUser.error.message);
assert.ok(newUser.data.setup_code);
let newSetup=call(null,'auth.setup',{username:'new.employee',setup_code:newUser.data.setup_code,password:'NewPass123'});
assert.equal(newSetup.ok,true,newSetup.error&&newSetup.error.message);
assert.ok(newSetup.data.token);

// Duplicate transaction IDs are idempotent and bound to the original user.
let tx1=call(manager,'stock.adjust',{product_id:product,delta:1,reason:'count correction'},'TXN-TEST-001');
let tx2=call(manager,'stock.adjust',{product_id:product,delta:1,reason:'count correction'},'TXN-TEST-001');
assert.equal(tx1.ok,true); assert.equal(tx2.duplicate,true);
let cross=call(owner,'stock.adjust',{product_id:product,delta:1,reason:'count correction'},'TXN-TEST-001');
assert.equal(cross.ok,false); assert.equal(cross.error.code,'DUPLICATE_TXN');

console.log('PASS: migration preserves product IDs, supports all four branches, and upgrades only the untouched default manager role');
console.log('PASS: ordinary credit and branch reconciliation receivables/payments/reversals are isolated');
console.log('PASS: customer statement does not double-count branch sales');
console.log('PASS: PO deposits, no-partial-receipt rule, discrepancy review and stock approval');
console.log('PASS: offline branch collection IDs, partial-item split IDs, and transaction replay are idempotent');
console.log('PASS: captured exchange rates are preserved for queued POS sales, expenses, and supplier payments');
console.log('PASS: new staff receive one-time setup codes with the 8-character password policy');
console.log('PASS: transaction idempotency is per user');

// Storage-schema audit: every property produced by the merged engine must have a persisted column.
const fs = require('node:fs');
const vm = require('node:vm');
const schemaCtx = {};
vm.runInNewContext(fs.readFileSync(__dirname + '/../apps-script/Store.gs','utf8'), schemaCtx);
for (const t of schemaCtx.SCHEMA) {
  const rows = db[t.key] || [];
  if (t.kv) continue;
  for (const row of rows) for (const k of Object.keys(row)) assert.ok(t.columns.some(c => c.name === k), `Unpersisted field ${t.key}.${k}`);
}
console.log('PASS: every field produced by tested engine actions has a matching Sheets column');
