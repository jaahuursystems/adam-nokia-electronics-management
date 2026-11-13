/* Runs the REAL Code.gs/Engine.gs/Store.gs against a fake in-memory Google Sheet behind an HTTP server with artificial latency. Test tool only. */
const http = require('node:http'), fs = require('node:fs'), vm = require('node:vm');
const DELAY = Number(process.env.DELAY || 2500), PORT = Number(process.env.PORT || 8767); let requests = [];
class Sh { constructor(n){this.name=n;this.cells=[];} getName(){return this.name;} getMaxRows(){return 5000;} insertRowsAfter(){} setFrozenRows(){}
  getLastColumn(){let m=0;for(const r of this.cells)for(let i=r.length-1;i>=0;i--)if(r[i]!==''&&r[i]!=null){m=Math.max(m,i+1);break;}return m;}
  getLastRow(){let m=0;for(let i=this.cells.length-1;i>=0;i--)if(this.cells[i]&&this.cells[i].some(v=>v!==''&&v!=null)){m=i+1;break;}return m;}
  getDataRange(){return new Rg(this,1,1,this.cells.length||1,Math.max(1,...this.cells.map(r=>r.length)));} getRange(r,c,nr,nc){return new Rg(this,r,c,nr,nc);} }
class Rg { constructor(sh,r,c,nr,nc){Object.assign(this,{sh,r,c,nr,nc});}
  getValues(){const o=[];for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++)row.push((this.sh.cells[this.r-1+i]||[])[this.c-1+j]??'');o.push(row);}return o;}
  setValues(v){for(let i=0;i<v.length;i++){const ri=this.r-1+i;this.sh.cells[ri]=this.sh.cells[ri]||[];for(let j=0;j<v[i].length;j++)this.sh.cells[ri][this.c-1+j]=v[i][j];}return this;}
  clearContent(){for(let i=0;i<this.nr;i++)for(let j=0;j<this.nc;j++)if(this.sh.cells[this.r-1+i])this.sh.cells[this.r-1+i][this.c-1+j]='';return this;} setFontWeight(){return this;} setNumberFormat(){return this;} }
class SS { constructor(){this.sheets={};} getId(){return 'fake';} getSheetByName(n){return this.sheets[n]||null;} insertSheet(n){return this.sheets[n]=new Sh(n);} getSheets(){return Object.values(this.sheets);} }
const ss = new SS, props = {};
const ctx = { console, SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}}, PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;},deleteProperty:k=>{delete props[k];}})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}, ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({t,setMimeType(){return this;}})}, Utilities:{getUuid:()=>require('node:crypto').randomUUID()}, DriveApp:{}, ScriptApp:{} };
vm.createContext(ctx); ctx.preResetBackup = function () { ctx.__backups = (ctx.__backups || 0) + 1; };   /* stands in for the Drive copy that Setup.gs makes */
['Engine','Store','Code'].forEach(f=>vm.runInContext(fs.readFileSync(__dirname+'/../../apps-script/'+f+'.gs','utf8'),ctx));
vm.runInContext(fs.readFileSync(__dirname+'/../../staging/SeedData.gs','utf8')+';this.SEED_=SEED;this.ANE_=ANE;this.Store_=Store;this.doPost_=doPost;',ctx);
ctx.Store_.ensureSheets(); const db = ctx.ANE_.seed(ctx.SEED_, new Date()); ctx.ANE_.migrate(db); ctx.Store_.save(db, {});
const st = ctx.Store_.load(), eng = new ctx.ANE_.Engine(st.db, { onChange(){} }), CODE = eng.issueSetupCode(null, 'owner.test').code; ctx.Store_.save(st.db, st.snap);
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.url === '/__code') { res.writeHead(200, cors); return res.end(CODE); }
  if (req.url === '/__log') { res.writeHead(200, cors); res.end(JSON.stringify(requests)); requests = []; return; }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = ''; req.on('data', d => body += d); req.on('end', () => setTimeout(() => {
    try { const j = JSON.parse(body); requests.push(j.action + (j.action === 'batch' ? '[' + j.payload.requests.length + ']' : '')); } catch (e) { }
    const out = ctx.doPost_({ postData: { contents: body } }); res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(out.t);
  }, DELAY));
}).listen(PORT, () => console.log('fake backend on ' + PORT + ' delay ' + DELAY + 'ms'));
