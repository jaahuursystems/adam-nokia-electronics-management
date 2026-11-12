const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const oldSource = fs.readFileSync(__dirname + '/fixtures/legacy_Store.gs','utf8');
const newSource = fs.readFileSync(__dirname + '/../apps-script/Store.gs','utf8');
function schema(source) {
  return [...source.matchAll(/\{ key: '([^']+)', sheet: '([^']+)', cols: '([^']+)'/g)].map(m => ({key:m[1],sheet:m[2],cols:m[3].split(',').map(x=>x.split(':')[0])}));
}
class FakeSheet {
  constructor(name){this.name=name;this.cells=[];this.frozen=0;}
  getLastColumn(){let m=0;for(const row of this.cells) for(let i=row.length-1;i>=0;i--) if(row[i]!==''&&row[i]!=null){m=Math.max(m,i+1);break;}return m;}
  getLastRow(){let m=0;for(let i=this.cells.length-1;i>=0;i--) if(this.cells[i]&&this.cells[i].some(v=>v!==''&&v!=null)){m=i+1;break;}return m;}
  getMaxRows(){return 100;}
  getRange(r,c,nr,nc){return new FakeRange(this,r,c,nr,nc);}
  setFrozenRows(n){this.frozen=n;}
}
class FakeRange {
  constructor(sh,r,c,nr,nc){Object.assign(this,{sh,r,c,nr,nc});}
  getValues(){const out=[];for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++)row.push((this.sh.cells[this.r-1+i]||[])[this.c-1+j]??'');out.push(row);}return out;}
  setValues(values){for(let i=0;i<values.length;i++){const ri=this.r-1+i;this.sh.cells[ri]=this.sh.cells[ri]||[];for(let j=0;j<values[i].length;j++)this.sh.cells[ri][this.c-1+j]=values[i][j];}return this;}
  setFontWeight(){return this;}
  setNumberFormat(){return this;}
}
class FakeSpreadsheet {
  constructor(){this.sheets={};}
  getSheetByName(n){return this.sheets[n]||null;}
  insertSheet(n){const s=new FakeSheet(n);this.sheets[n]=s;return s;}
}
function loadStore(ss){const context={SpreadsheetApp:{getActiveSpreadsheet:()=>ss},PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,setProperty:()=>{},deleteProperty:()=>{}})}};vm.runInNewContext(newSource,context);return context.Store;}
const old=schema(oldSource), ss=new FakeSpreadsheet();
for(const t of old){const sh=ss.insertSheet(t.sheet);sh.getRange(1,1,1,t.cols.length).setValues([t.cols]);}
// Add representative production rows so we can prove migration does not rewrite them.
ss.getSheetByName('Products').getRange(2,1,1,15).setValues([['ITM-001','ITM-001','iPhone 13 OLED','OLED','iPhone LCD','OLED','iPhone 13',false,5000,3.6725,1361,10000,3,'','active']]);
ss.getSheetByName('Sales').getRange(2,1,1,15).setValues([['SAL-001','CUS-001','2026-11-01T10:00:00.000Z','POS','','','',11750,10000,5000,'PAID','ZAAD_USD','ACTIVE','U-001','Owner']]);
const beforeProduct=JSON.stringify(ss.getSheetByName('Products').getRange(2,1,1,15).getValues());
const beforeSale=JSON.stringify(ss.getSheetByName('Sales').getRange(2,1,1,15).getValues());
const Store=loadStore(ss); const made=Store.ensureExistingSchema();
assert.equal(made.length,7,'only the seven new extension sheets should be created');
assert.equal(JSON.stringify(ss.getSheetByName('Products').getRange(2,1,1,15).getValues()),beforeProduct);
assert.equal(JSON.stringify(ss.getSheetByName('Sales').getRange(2,1,1,15).getValues()),beforeSale);
const newSchema=schema(newSource);
for(const t of old){const actual=ss.getSheetByName(t.sheet).getRange(1,1,1,newSchema.find(x=>x.key===t.key).cols.length).getValues()[0];assert.deepEqual(actual,newSchema.find(x=>x.key===t.key).cols,`header append for ${t.sheet}`);}
assert.ok(ss.getSheetByName('PurchaseOrders'));
assert.ok(ss.getSheetByName('ReconciliationRevisions'));
// A missing core sheet must fail before any other header or sheet is changed.
const bad=new FakeSpreadsheet();
for(const t of old.filter(x=>x.sheet!=='Sales')){const sh=bad.insertSheet(t.sheet);sh.getRange(1,1,1,t.cols.length).setValues([t.cols]);}
const badStore=loadStore(bad);
assert.throws(()=>badStore.ensureExistingSchema(),/required existing sheet Sales is missing/);
assert.equal(bad.getSheetByName('Suppliers'),null,'validation failure must not create extension sheets');
assert.equal(bad.getSheetByName('Products').getLastColumn(),15,'validation failure must not append columns before validation completes');
console.log('PASS: additive migration appends only missing columns and creates only new extension sheets');
console.log('PASS: existing product and sale rows remain byte-for-byte unchanged');
console.log('PASS: missing core sheet aborts migration before any schema changes');
