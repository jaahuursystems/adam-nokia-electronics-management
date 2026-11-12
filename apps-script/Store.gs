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
  { key: 'products', sheet: 'Products', cols: 'id:s,sku:s,name:s,supplier_item_name:s,category:s,variant_tag:s,model:s,model_is_derived:b,cost_aed_minor:n,aed_usd_rate_snapshot:n,cost_usd_cents:n,price_usd_cents:n,min_stock:n,supplier_id:s,status:s,legacy_id:s' },
  { key: 'balances', sheet: 'Inventory', cols: 'product_id:s,loc:s,qty:n' },
  { key: 'movements', sheet: 'StockMovements', cols: 'id:s,product_id:s,type:s,from:s,to:s,qty:n,reason:s,ref:s,at:s,by:s' },
  { key: 'customers', sheet: 'Customers', cols: 'id:s,name:s,phone:s,category:s,address:s,notes:s,credit_approved:b,credit_limit_usd_cents:n,status:s,system:b' },
  { key: 'sales', sheet: 'Sales', cols: 'id:s,customer_id:s,at:s,source:s,offline_at:s,branch_id:s,invoice_id:s,rate_usd_slsh:n,total_usd_cents:n,cost_usd_cents:n,payment_status:s,payment_method:s,status:s,by:s,by_name:s,reversed_at:s,reversed_by:s,reverse_reason:s,rate_id:s,synced_at:s' },
  { key: 'saleItems', sheet: 'SaleItems', cols: 'id:s,sale_id:s,product_id:s,name:s,qty:n,unit_price_usd_cents:n,unit_cost_usd_cents:n,collection_item_id:s' },
  { key: 'payments', sheet: 'Payments', cols: 'id:s,direction:s,party_type:s,party_id:s,kind:s,ref:s,method_id:s,currency:s,amount_minor:n,usd_cents:n,rate_usd_slsh:n,at:s,by:s,reference:s,reversed:b,reverses:s,reverses_kind:s,rate_id:s,reclassified_from:s,reclass_reason:s,offline_at:s,synced_at:s' },
  { key: 'branches', sheet: 'Branches', cols: 'id:s,customer_id:s,name:s,cycle:s,active:b,due_offset_days:n,week_start_dow:n' },
  { key: 'people', sheet: 'BranchPeople', cols: 'id:s,branch_id:s,name:s,role:s,active:b' },
  { key: 'collections', sheet: 'BranchCollections', cols: 'id:s,customer_id:s,branch_id:s,assistant_id:s,technician_id:s,collected_at:s,by:s,synced_at:s' },
  { key: 'collItems', sheet: 'BranchCollectionItems', cols: 'id:s,collection_id:s,product_id:s,qty:n,status:s,parent_id:s' },
  { key: 'history', sheet: 'BranchItemHistory', cols: 'id:s,item_id:s,previous:s,next:s,by:s,by_name:s,at:s,reason:s,type:s' },
  { key: 'inspections', sheet: 'ReturnInspections', cols: 'id:s,item_id:s,result:s,notes:s,by:s,by_name:s,at:s' },
  { key: 'audit', sheet: 'AuditLog', cols: 'id:s,at:s,user_id:s,user:s,action:s,entity:s,entity_id:s,old:j,new:j,reason:s' },
  { key: 'suppliers', sheet: 'Suppliers', cols: 'id:s,name:s,contact_person:s,phone:s,address:s,notes:s,payment_terms:s,status:s' },
  { key: 'pos', sheet: 'PurchaseOrders', cols: 'id:s,po_no:s,supplier_id:s,status:s,aed_usd_rate:n,total_aed_minor:n,total_usd_cents:n,final_usd_cents:n,payment_terms:s,notes:s,created_at:s,created_by:s,created_by_name:s,sent_at:s,received_at:s,cancel_reason:s,aed_usd_rate_id:s' },
  { key: 'poItems', sheet: 'PurchaseOrderItems', cols: 'id:s,po_id:s,product_id:s,supplier_item_name:s,qty_ordered:n,unit_cost_aed_minor:n,unit_cost_usd_cents:n,qty_received:n,actual_unit_cost_aed_minor:n' },
  { key: 'receipts', sheet: 'PurchaseReceipts', cols: 'id:s,po_id:s,received_at:s,by:s,by_name:s,lines:j,discrepancy:b,notes:s,status:s,approved_by:s,approved_at:s,review_notes:s,synced_at:s' },
  { key: 'expenses', sheet: 'Expenses', cols: 'id:s,category:s,description:s,amount_minor:n,currency:s,usd_cents:n,rate_usd_slsh:n,method_id:s,date:s,at:s,by:s,by_name:s,status:s,reverse_reason:s,reversed_by:s,reversed_at:s,rate_id:s,offline_at:s,synced_at:s' },
  { key: 'reconPeriods', sheet: 'ReconciliationPeriods', cols: 'id:s,branch_id:s,customer_id:s,period_start:s,period_end:s,report_no:s,invoice_no:s,due_at:s,created_at:s' },
  { key: 'reconRevs', sheet: 'ReconciliationRevisions', cols: 'id:s,period_id:s,rev:n,is_current:b,parent_rev_id:s,generated_at:s,by:s,by_name:s,sold:j,pending:j,returned:j,total_usd_cents:n,signature:s' },
  { key: 'syncLog', sheet: 'SyncLog', cols: 'txn:s,action:s,at:s,user:s,data:j' },   /* written LAST: see save() */
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
  /* Formula-injection guard. Google Sheets evaluates text starting with "=" even in a plain-text-formatted cell when written through the API,
     and "+", "-", "@" are formula triggers in Excel/CSV exports. Such text is stored with an invisible zero-width-space prefix and restored exactly on read. */
  var ZW = '\u200B';
  function encText(v) { var t = String(v); return /^[=+\-@\t\r\u200B]/.test(t) ? ZW + t : t; }
  function decText(v) { var t = String(v); return t.charAt(0) === ZW ? t.slice(1) : t; }
  function cellOut(type, v) {
    if (type === 'n') return (v === null || v === undefined || v === '') ? '' : Number(v);
    if (type === 'b') return v === true;
    if (type === 'j') return (v === null || v === undefined) ? '' : JSON.stringify(v);
    return (v === null || v === undefined) ? '' : encText(v);
  }
  function cellIn(type, v) {
    if (type === 'n') return v === '' ? null : Number(v);
    if (type === 'b') return v === true || v === 'TRUE' || v === 'true';
    if (type === 'j') return v === '' ? null : JSON.parse(v);
    if (v instanceof Date) return v.toISOString();
    return v === '' ? '' : decText(v);
  }
  function toRow(t, obj) {
    var known = {}; t.columns.forEach(function (c) { known[c.name] = 1; });
    Object.keys(obj).forEach(function (k) { if (!known[k]) throw new Error('SCHEMA_MISMATCH: ' + t.sheet + ' has no column "' + k + '" (refusing to drop data silently)'); });
    return t.columns.map(function (c) { return cellOut(c.type, obj[c.name]); });
  }
  function fromRow(t, row) { var o = {}; t.columns.forEach(function (c, i) { o[c.name] = cellIn(c.type, row[i] === undefined || row[i] === null ? '' : row[i]); }); return o; }
  function headerOk(sh, t) { var h = sh.getRange(1, 1, 1, t.columns.length).getValues()[0]; return t.columns.every(function (c, i) { return h[i] === c.name; }); }

  /* Schema setup is additive. Existing headers must be an exact prefix of the new schema; we only append columns.
     Live migrations may create only the new extension sheets. Missing core sheets are treated as possible data loss. */
  var EXTENSION_SHEETS = { Suppliers: 1, PurchaseOrders: 1, PurchaseOrderItems: 1, PurchaseReceipts: 1, Expenses: 1, ReconciliationPeriods: 1, ReconciliationRevisions: 1 };
  function ensureSchema_(allowCreateAll) {
    var s = ss(), plan = [];
    /* Validate every existing sheet before changing any header. */
    SCHEMA.forEach(function (t) {
      var sh = s.getSheetByName(t.sheet);
      if (!sh) {
        if (!allowCreateAll && !EXTENSION_SHEETS[t.sheet]) throw new Error('SCHEMA_MISMATCH: required existing sheet ' + t.sheet + ' is missing. Restore it from backup before continuing.');
        plan.push({ table: t, sheet: null, create: true, add: t.columns }); return;
      }
      var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
      if (!lastCol || !lastRow) {
        if (!allowCreateAll && !EXTENSION_SHEETS[t.sheet]) throw new Error('SCHEMA_MISMATCH: existing sheet ' + t.sheet + ' has no header. Restore it from backup before continuing.');
        plan.push({ table: t, sheet: sh, create: false, blank: true, add: t.columns }); return;
      }
      var actual = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      if (actual.length > t.columns.length) throw new Error('SCHEMA_MISMATCH: sheet ' + t.sheet + ' contains unexpected columns. No changes were made.');
      for (var i = 0; i < actual.length; i++) if (actual[i] !== t.columns[i].name) throw new Error('SCHEMA_MISMATCH: header of sheet ' + t.sheet + ' differs at column ' + (i + 1) + '. No changes were made.');
      plan.push({ table: t, sheet: sh, create: false, add: t.columns.slice(actual.length), start: actual.length + 1 });
    });
    /* Apply only after all current headers passed validation. */
    var made = [];
    plan.forEach(function (x) {
      var t = x.table, sh = x.sheet;
      if (x.create) { sh = s.insertSheet(t.sheet); made.push(t.sheet); }
      if (x.add.length) {
        var col = x.create || x.blank ? 1 : x.start;
        sh.getRange(1, col, 1, x.add.length).setValues([x.add.map(function (c) { return c.name; })]).setFontWeight('bold');
        x.add.forEach(function (c, j) { if (c.type === 's' || c.type === 'j') sh.getRange(1, col + j, sh.getMaxRows(), 1).setNumberFormat('@'); });
      }
      sh.setFrozenRows(1);
    });
    return made;
  }
  /* Speed: validating ~30 sheets header-by-header costs ~120 Google calls. Do it once per schema version and remember it in Script Properties. */
  function schemaSig_() { var str = JSON.stringify(SCHEMA), h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return 'v1:' + (h >>> 0).toString(36) + ':' + str.length; }
  function remember_() { try { PropertiesService.getScriptProperties().setProperty('SCHEMA_OK', schemaSig_()); } catch (e) { } }
  function ensureSheets() { var made = ensureSchema_(true); remember_(); return made; }
  function ensureExistingSchema() {
    var props = null; try { props = PropertiesService.getScriptProperties(); } catch (e) { }
    if (props && props.getProperty('SCHEMA_OK') === schemaSig_()) return [];
    var made = ensureSchema_(false); remember_(); return made;
  }
  function forgetSchemaCheck() { try { PropertiesService.getScriptProperties().deleteProperty('SCHEMA_OK'); } catch (e) { } }

  /* Speed: read every sheet in ONE call when the Advanced Sheets service is enabled (see appsscript.json); otherwise one call per sheet. */
  function readAll_(s) {
    var names = SCHEMA.map(function (t) { return t.sheet; }), out = {};
    if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
      try {
        var r = Sheets.Spreadsheets.Values.batchGet(s.getId(), { ranges: names.map(function (n) { return "'" + n + "'"; }), valueRenderOption: 'UNFORMATTED_VALUE' });
        r.valueRanges.forEach(function (vr, i) { out[names[i]] = vr.values || []; }); return out;
      } catch (e) { out = {}; }
    }
    s.getSheets().forEach(function (sh) { var v = sh.getDataRange().getValues(); out[sh.getName()] = (v.length === 1 && v[0].every(function (x) { return x === '' || x === null; })) ? [] : v; });
    return out;
  }

  /* One batch read per sheet. Returns the db plus a signature snapshot used by save() to write only changes. */
  function load() {
    var s = ss(), db = {}, snap = {}, all = readAll_(s);
    SCHEMA.forEach(function (t) {
      var vals = all[t.sheet]; if (!vals) throw new Error('Database is not initialised (missing sheet ' + t.sheet + ').');
      var rows = [];
      if (vals.length > 1) {
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
  return { ss: ss, ensureSheets: ensureSheets, ensureExistingSchema: ensureExistingSchema, load: load, save: save, forgetSchemaCheck: forgetSchemaCheck, encText: encText, decText: decText, _cell: { out: cellOut, inn: cellIn } };
})();
