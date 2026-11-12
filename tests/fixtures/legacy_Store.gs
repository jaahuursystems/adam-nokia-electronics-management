/* Adam Nokia Electronics SMS — Google Sheets persistence layer.
   The Engine works on an in-memory `db` object. This file loads that object from the spreadsheet and writes back only what changed.
   Callers MUST hold the script lock around load()+save(). Row position is used only inside one locked request; identity is always the ID column. */

/* type codes: s=text, n=number, b=boolean, j=JSON.  Every text/JSON column is formatted as plain text so Sheets can never turn
   an ISO timestamp into a date, drop a leading zero, or evaluate "=..." typed by a user as a formula. */
var SCHEMA = [
  { key: 'settings', sheet: 'Settings', cols: 'key:s,value:j', kv: 'settings' },
  { key: 'meta', sheet: 'Meta', cols: 'key:s,value:j', kv: 'meta' },
  { key: 'roles', sheet: 'Roles', cols: 'id:s,perms:j', kv: 'roles' },
  { key: 'users', sheet: 'Staff', cols: 'id:s,full_name:s,username:s,role:s,status:s,password_hash:s,salt:s,failed:n,locked_until:n,setup_salt:s,setup_hash:s,setup_expires:n,setup_failed:n' },
  { key: 'sessions', sheet: 'Sessions', cols: 'hash:s,user_id:s,expires:n' },
  { key: 'methods', sheet: 'PaymentMethods', cols: 'id:s,name:s,currency:s,enabled:b' },
  { key: 'rates', sheet: 'ExchangeRates', cols: 'id:s,pair:s,rate:n,previous:n,effective_at:s,by:s,note:s' },
  { key: 'products', sheet: 'Products', cols: 'id:s,sku:s,name:s,supplier_item_name:s,category:s,variant_tag:s,model:s,model_is_derived:b,cost_aed_minor:n,aed_usd_rate_snapshot:n,cost_usd_cents:n,price_usd_cents:n,min_stock:n,supplier_id:s,status:s' },
  { key: 'balances', sheet: 'Inventory', cols: 'product_id:s,loc:s,qty:n' },
  { key: 'movements', sheet: 'StockMovements', cols: 'id:s,product_id:s,type:s,from:s,to:s,qty:n,reason:s,ref:s,at:s,by:s' },
  { key: 'customers', sheet: 'Customers', cols: 'id:s,name:s,phone:s,category:s,address:s,notes:s,credit_approved:b,credit_limit_usd_cents:n,status:s,system:b' },
  { key: 'sales', sheet: 'Sales', cols: 'id:s,customer_id:s,at:s,source:s,offline_at:s,branch_id:s,invoice_id:s,rate_usd_slsh:n,total_usd_cents:n,cost_usd_cents:n,payment_status:s,payment_method:s,status:s,by:s,by_name:s' },
  { key: 'saleItems', sheet: 'SaleItems', cols: 'id:s,sale_id:s,product_id:s,name:s,qty:n,unit_price_usd_cents:n,unit_cost_usd_cents:n,collection_item_id:s' },
  { key: 'payments', sheet: 'Payments', cols: 'id:s,direction:s,party_type:s,party_id:s,kind:s,ref:s,method_id:s,currency:s,amount_minor:n,usd_cents:n,rate_usd_slsh:n,at:s,by:s,reference:s' },
  { key: 'branches', sheet: 'Branches', cols: 'id:s,customer_id:s,name:s,cycle:s,active:b' },
  { key: 'people', sheet: 'BranchPeople', cols: 'id:s,branch_id:s,name:s,role:s,active:b' },
  { key: 'collections', sheet: 'BranchCollections', cols: 'id:s,customer_id:s,branch_id:s,assistant_id:s,technician_id:s,collected_at:s,by:s' },
  { key: 'collItems', sheet: 'BranchCollectionItems', cols: 'id:s,collection_id:s,product_id:s,qty:n,status:s,parent_id:s' },
  { key: 'history', sheet: 'BranchItemHistory', cols: 'id:s,item_id:s,previous:s,next:s,by:s,by_name:s,at:s,reason:s,type:s' },
  { key: 'inspections', sheet: 'ReturnInspections', cols: 'id:s,item_id:s,result:s,notes:s,by:s,by_name:s,at:s' },
  { key: 'audit', sheet: 'AuditLog', cols: 'id:s,at:s,user_id:s,user:s,action:s,entity:s,entity_id:s,old:j,new:j,reason:s' },
  { key: 'syncLog', sheet: 'SyncLog', cols: 'txn:s,action:s,at:s,user:s,data:j' }   /* written LAST: see save() */
];
SCHEMA.forEach(function (t) { t.columns = t.cols.split(',').map(function (c) { var a = c.split(':'); return { name: a[0], type: a[1] }; }); });

var Store = (function () {
  function ss() {
    var s = null; try { s = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { }
    if (!s) { var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID'); if (id) s = SpreadsheetApp.openById(id); }
    if (!s) throw new Error('Database spreadsheet not found. Open the script from the spreadsheet (Extensions > Apps Script).');
    return s;
  }
  /* kv tables are objects in the engine; sheets hold them as rows */
  function pack(t, db) {
    var o = db[t.key];
    if (t.kv === 'settings' || t.kv === 'meta') return Object.keys(o).map(function (k) { return { key: k, value: o[k] }; });
    if (t.kv === 'roles') return Object.keys(o).map(function (k) { return { id: k, perms: o[k].perms }; });
    return o;
  }
  function unpack(t, rows, db) {
    if (t.kv === 'settings' || t.kv === 'meta') { var o = {}; rows.forEach(function (r) { o[r.key] = r.value; }); db[t.key] = o; }
    else if (t.kv === 'roles') { var q = {}; rows.forEach(function (r) { q[r.id] = { id: r.id, perms: r.perms }; }); db[t.key] = q; }
    else db[t.key] = rows;
  }
  function cellOut(type, v) {
    if (type === 'n') return (v === null || v === undefined || v === '') ? '' : Number(v);
    if (type === 'b') return v === true;
    if (type === 'j') return (v === null || v === undefined) ? '' : JSON.stringify(v);
    return (v === null || v === undefined) ? '' : String(v);
  }
  function cellIn(type, v) {
    if (type === 'n') return v === '' ? null : Number(v);
    if (type === 'b') return v === true || v === 'TRUE' || v === 'true';
    if (type === 'j') return v === '' ? null : JSON.parse(v);
    if (v instanceof Date) return v.toISOString();
    return v === '' ? '' : String(v);
  }
  function toRow(t, obj) {
    var known = {}; t.columns.forEach(function (c) { known[c.name] = 1; });
    Object.keys(obj).forEach(function (k) { if (!known[k]) throw new Error('SCHEMA_MISMATCH: ' + t.sheet + ' has no column "' + k + '" (refusing to drop data silently)'); });
    return t.columns.map(function (c) { return cellOut(c.type, obj[c.name]); });
  }
  function fromRow(t, row) { var o = {}; t.columns.forEach(function (c, i) { o[c.name] = cellIn(c.type, row[i]); }); return o; }
  function headerOk(sh, t) { var h = sh.getRange(1, 1, 1, t.columns.length).getValues()[0]; return t.columns.every(function (c, i) { return h[i] === c.name; }); }

  /* Create every sheet with its header + text formats. Safe to call again (only creates what is missing). */
  function ensureSheets() {
    var s = ss(), made = [];
    SCHEMA.forEach(function (t) {
      var sh = s.getSheetByName(t.sheet);
      if (!sh) {
        sh = s.insertSheet(t.sheet); made.push(t.sheet);
        sh.getRange(1, 1, 1, t.columns.length).setValues([t.columns.map(function (c) { return c.name; })]).setFontWeight('bold');
        sh.setFrozenRows(1);
        t.columns.forEach(function (c, i) { if (c.type === 's' || c.type === 'j') sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
      } else if (!headerOk(sh, t)) throw new Error('SCHEMA_MISMATCH: header of sheet ' + t.sheet + ' was changed. Restore it from the schema documentation.');
    });
    return made;
  }

  /* One batch read per sheet. Returns the db plus a signature snapshot used by save() to write only changes. */
  function load() {
    var s = ss(), db = {}, snap = {};
    SCHEMA.forEach(function (t) {
      var sh = s.getSheetByName(t.sheet); if (!sh) throw new Error('Database is not initialised (missing sheet ' + t.sheet + ').');
      var n = t.columns.length, last = sh.getLastRow(), rows = [];
      if (last > 1) {
        var vals = sh.getRange(1, 1, last, n).getValues();
        if (!t.columns.every(function (c, i) { return vals[0][i] === c.name; })) throw new Error('SCHEMA_MISMATCH: header of sheet ' + t.sheet + ' was changed.');
        rows = vals.slice(1).map(function (r) { return fromRow(t, r); });
      }
      unpack(t, rows, db);
      snap[t.key] = pack(t, db).map(function (o) { return JSON.stringify(toRow(t, o)); });
    });
    return { db: db, snap: snap };
  }

  /* Writes changed/new rows only. Append-only tables never rewrite old rows. There is NO cross-sheet transaction: if the script dies midway,
     earlier sheets may be updated and later ones not (SyncLog is last so a retry can never be mistaken for "already done"). Run the integrity check after any error. */
  function save(db, snap) {
    var s = ss();
    SCHEMA.forEach(function (t) {
      var n = t.columns.length, rows = pack(t, db).map(function (o) { return toRow(t, o); }), sigs = rows.map(function (r) { return JSON.stringify(r); }), old = snap[t.key] || [];
      if (sigs.length === old.length && sigs.every(function (x, i) { return x === old[i]; })) return;
      var sh = s.getSheetByName(t.sheet), need = rows.length + 1;
      if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows() + 200);
      if (sigs.length < old.length) {                       /* rows were removed (e.g. expired sessions): rewrite the body */
        sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), n).clearContent();
        if (rows.length) sh.getRange(2, 1, rows.length, n).setValues(rows);
        return;
      }
      var i = 0;
      while (i < old.length) {                                /* changed rows, grouped into contiguous runs */
        if (sigs[i] === old[i]) { i++; continue; }
        var j = i; while (j < old.length && sigs[j] !== old[j]) j++;
        sh.getRange(i + 2, 1, j - i, n).setValues(rows.slice(i, j)); i = j;
      }
      if (rows.length > old.length) sh.getRange(old.length + 2, 1, rows.length - old.length, n).setValues(rows.slice(old.length));
    });
    SpreadsheetApp.flush();
  }
  return { ss: ss, ensureSheets: ensureSheets, load: load, save: save };
})();
