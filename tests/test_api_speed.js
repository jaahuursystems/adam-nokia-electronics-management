const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
let calls = 0; const tick = () => { calls++; };
class Sh { constructor(n){this.name=n;this.cells=[];}
  getName(){return this.name;} getMaxRows(){return 500;} insertRowsAfter(){tick();} setFrozenRows(){}
  getLastColumn(){tick();let m=0;for(const r of this.cells)for(let i=r.length-1;i>=0;i--)if(r[i]!==''&&r[i]!=null){m=Math.max(m,i+1);break;}return m;}
  getLastRow(){tick();let m=0;for(let i=this.cells.length-1;i>=0;i--)if(this.cells[i]&&this.cells[i].some(v=>v!==''&&v!=null)){m=i+1;break;}return m;}
  getDataRange(){tick();const n=this.cells.length,w=Math.max(0,...this.cells.map(r=>r.length));return new Rg(this,1,1,n,w);}
  getRange(r,c,nr,nc){return new Rg(this,r,c,nr,nc);} }
class Rg { constructor(sh,r,c,nr,nc){Object.assign(this,{sh,r,c,nr,nc});}
  getValues(){tick();const o=[];for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++)row.push((this.sh.cells[this.r-1+i]||[])[this.c-1+j]??'');o.push(row);}return o;}
  setValues(v){tick();for(let i=0;i<v.length;i++){const ri=this.r-1+i;this.sh.cells[ri]=this.sh.cells[ri]||[];for(let j=0;j<v[i].length;j++)this.sh.cells[ri][this.c-1+j]=v[i][j];}return this;}
  clearContent(){tick();for(let i=0;i<this.nr;i++)for(let j=0;j<this.nc;j++)if(this.sh.cells[this.r-1+i])this.sh.cells[this.r-1+i][this.c-1+j]='';return this;}
  setFontWeight(){return this;} setNumberFormat(){return this;} }
class SS { constructor(){this.sheets={};} getId(){return 'fake';} getSheetByName(n){tick();return this.sheets[n]||null;} insertSheet(n){return this.sheets[n]=new Sh(n);} getSheets(){tick();return Object.values(this.sheets);} }
function boot(withAdvanced){
  const ss=new SS, props={}; let batchGets=0;
  const ctx={console,SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;},deleteProperty:k=>{delete props[k];}})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock(){},releaseLock(){}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({t,setMimeType(){return this;}})},
    Utilities:{getUuid:()=>require('node:crypto').randomUUID()},DriveApp:{},ScriptApp:{}};
  if(withAdvanced) ctx.Sheets={Spreadsheets:{Values:{batchGet:(id,o)=>{tick();batchGets++;return{valueRanges:o.ranges.map(r=>{const sh=ss.sheets[r.replace(/'/g,'')];if(!sh)throw new Error('no sheet');const lr=(()=>{let m=0;for(let i=sh.cells.length-1;i>=0;i--)if(sh.cells[i]&&sh.cells[i].some(v=>v!==''&&v!=null)){m=i+1;break;}return m;})();return{values:sh.cells.slice(0,lr).map(r=>r.map(v=>v===''?undefined:v).filter((v,i,a)=>true))};})};}}}};
  vm.createContext(ctx);
  ['Engine','Store','Code'].forEach(f=>vm.runInContext((f==='Store'&&process.env.OLD_STORE)?fs.readFileSync(process.env.OLD_STORE,'utf8'):fs.readFileSync(__dirname+'/../apps-script/'+f+'.gs','utf8'),ctx));
  vm.runInContext('this.ANE_=ANE;this.Store_=Store;this.doPost_=doPost;',ctx);
  return {ctx,ss,props,get batchGets(){return batchGets;}};
}
const src={aed_per_usd:3,usd_slsh:10000,staff:[['U-001','Owner','owner.t','owner']],items:[{product_id:'ANE-T-001',sku:'T1',supplier_item_name:'Part',category:'Cat',variant_tag:'',model_derived:'M',unit_cost_aed:3,selling_price_usd:5,source_qty:9}],branches:{'1':{name:'B1',cycle:'DAILY',tech:['T'],asst:['A']}}};
const post=(e,o)=>JSON.parse(e.ctx.doPost_({postData:{contents:JSON.stringify(o)}}).t);
for (const adv of [false,true]) {
  const e=boot(adv); calls=0;
  e.ctx.Store_.ensureSheets(); const db=e.ctx.ANE_.seed(src,new Date()); e.ctx.ANE_.migrate(db); e.ctx.Store_.save(db,{});
  const st=e.ctx.Store_.load(), eng=new e.ctx.ANE_.Engine(st.db,{onChange(){}}), code=eng.issueSetupCode(null,'owner.t').code; e.ctx.Store_.save(st.db,st.snap);
  const r1=post(e,{action:'auth.setup',payload:{username:'owner.t',setup_code:code,password:'Pass12345'}});
  assert.equal(r1.ok,true,JSON.stringify(r1)); assert.ok(r1.data.snapshot&&r1.data.snapshot.products.length===1,'login/setup returns the snapshot in the same response');
  const tok=r1.data.token;
  calls=0; const r2=post(e,{action:'dashboard.get',token:tok,payload:{}}); const readCalls=calls; assert.equal(r2.ok,true);
  assert.ok(readCalls<=(adv?3:80),`a read must not do per-sheet validation (calls=${readCalls}, advanced=${adv})`);
  if(adv) assert.ok(e.batchGets>=1,'advanced service: sheets are read in a single batchGet');
  const b=post(e,{action:'batch',token:tok,payload:{requests:[{action:'dashboard.get',payload:{}},{action:'sales.list',payload:{}},{action:'sales.create',payload:{customer_id:'CUS-WALKIN',method_id:'ZAAD_USD',items:[{product_id:'ANE-T-001',qty:1}]}}]}});
  assert.equal(b.ok,true); assert.equal(b.data[0].ok,true); assert.equal(b.data[1].ok,true); assert.equal(b.data[2].ok,false,'writes are refused inside a batch');
  const w=post(e,{action:'sales.create',token:tok,client_txn_id:'TXN-TEST-0001',payload:{customer_id:'CUS-WALKIN',method_id:'ZAAD_USD',items:[{product_id:'ANE-T-001',qty:2}]}});
  assert.equal(w.ok,true); assert.equal(w.snapshot.products[0].available,7,'a write returns the fresh snapshot (no second request needed)');
  const dup=post(e,{action:'sales.create',token:tok,client_txn_id:'TXN-TEST-0001',payload:{customer_id:'CUS-WALKIN',method_id:'ZAAD_USD',items:[{product_id:'ANE-T-001',qty:2}]}});
  assert.equal(dup.duplicate,true); const after=post(e,{action:'data.snapshot',token:tok,payload:{}}); assert.equal(after.data.products[0].available,7,'duplicate did not deduct stock twice');
  console.log('PASS: server speed path ok ('+(adv?'advanced Sheets batchGet':'per-sheet fallback')+'): read made '+readCalls+' Google calls');
}
