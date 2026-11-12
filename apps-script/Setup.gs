/* Adam Nokia Electronics SMS — owner/admin tools. These run only from the Google Sheet menu or the Apps Script editor
   (i.e. only people with edit access to the spreadsheet). They are NOT reachable through the public web API. */

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Adam Nokia Admin')
      .addItem('1. Initialize database (first time only)', 'initializeDatabase')
      .addItem('2. Issue / reset staff setup code', 'issueSetupCodeMenu')
      .addItem('3. Check data integrity & sharing', 'integrityCheckMenu')
      .addItem('4. Test Sheets read/write round-trip', 'selfTestMenu')
      .addItem('5. Turn on daily private backup', 'installDailyBackupTrigger')
      .addToUi();
  } catch (e) { }
}
function say_(title, text) { try { SpreadsheetApp.getUi().alert(title, text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(title + '\n' + text); } }

/* Creates sheets + loads the opening data from SEED (SeedData.gs). Refuses to run if the database already has data. */
function initializeDatabase() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (typeof SEED === 'undefined') throw new Error('SeedData.gs is missing. Paste your private seed file (private/SeedData.gs) into the Apps Script project.');
    var s = Store.ss(), existing = s.getSheetByName('Products');
    if (existing && existing.getLastRow() > 1) { say_('Already initialised', 'The database already contains data. Nothing was changed.'); return; }
    Store.ensureSheets();
    var db = ANE.seed(SEED, new Date());
    ANE.migrate(db);
    Store.save(db, {});                                   /* empty snapshot => everything is appended */
    /* issue one-time codes (plaintext shown once, only hashes stored) */
    var st = Store.load(), eng = new ANE.Engine(st.db, { onChange: function () { } }), out = [];
    st.db.users.forEach(function (u) { out.push(u.username + '  ->  ' + eng.issueSetupCode(null, u.username).code); });
    Store.save(st.db, st.snap);
    PropertiesService.getScriptProperties().setProperty('INITIALIZED_AT', new Date().toISOString());
    say_('Database ready', 'One-time setup codes (valid 72 hours, single use). Give each person ONLY their own code, privately:\n\n' + out.join('\n') + '\n\nThen DELETE SeedData.gs from this project.');
  } finally { lock.releaseLock(); }
}

function issueSetupCodeMenu() {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt('Issue setup code', 'Username (as shown in Settings > Staff). This also resets that person\'s password.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return; issueSetupCode(r.getResponseText().trim().toLowerCase());
}
function issueSetupCode(username) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { Store.ensureExistingSchema(); var st = Store.load(), eng = new ANE.Engine(st.db, { onChange: function () { } }), c = eng.issueSetupCode(null, username); Store.save(st.db, st.snap);
    say_('Setup code', c.username + ' -> ' + c.code + '\nValid ' + c.expires_hours + ' hours, single use.'); return c.code; }
  finally { lock.releaseLock(); }
}

/* Recomputes ledgers from raw rows and checks sharing. Returns a list of problems (empty = healthy). */
function integrityCheck() {
  Store.ensureExistingSchema(); var st = Store.load(), db = st.db, p = [], led = {};
  db.movements.forEach(function (m) { if (m.from) led[m.product_id + '|' + m.from] = (led[m.product_id + '|' + m.from] || 0) - m.qty; if (m.to) led[m.product_id + '|' + m.to] = (led[m.product_id + '|' + m.to] || 0) + m.qty; });
  db.balances.forEach(function (b) { var l = led[b.product_id + '|' + b.loc] || 0; if (l !== b.qty) p.push('Stock mismatch ' + b.product_id + ' ' + b.loc + ': balance ' + b.qty + ' vs movements ' + l); if (b.qty < 0) p.push('Negative stock ' + b.product_id + ' ' + b.loc); delete led[b.product_id + '|' + b.loc]; });
  Object.keys(led).forEach(function (k) { if (led[k] !== 0) p.push('Movements without balance row: ' + k); });
  var eng = new ANE.Engine(db, { onChange: function () { } });
  db.customers.forEach(function (c) {
    var ordinary = eng.customerCreditOutstanding(c.id), branch = eng.branchOutstanding(c.id), total = eng.outstanding(c.id);
    if (ordinary < 0 || branch < 0) p.push('Negative receivable subledger for ' + c.id + ': ordinary=' + ordinary + ', branch=' + branch);
    if (total !== ordinary + branch) p.push('Receivable ledger mismatch for ' + c.id + ': aggregate does not equal ordinary credit plus branch reconciliation.');
  });
  db.payments.forEach(function (x) {
    if (x.kind === 'RECON_PAYMENT' && !db.reconPeriods.some(function (r) { return r.id === x.ref; })) p.push('Branch reconciliation payment ' + x.id + ' has no matching reconciliation period.');
  });
  var tot = {}; db.saleItems.forEach(function (i) { tot[i.sale_id] = (tot[i.sale_id] || 0) + i.qty * i.unit_price_usd_cents; });
  db.sales.forEach(function (s) { if ((tot[s.id] || 0) !== s.total_usd_cents) p.push('Sale total mismatch ' + s.id); });
  var seen = {}; db.collItems.forEach(function (i) { /* one billed sale line per collection item */ });
  db.saleItems.forEach(function (i) { if (i.collection_item_id) { if (seen[i.collection_item_id]) p.push('Collection item billed twice: ' + i.collection_item_id); seen[i.collection_item_id] = 1; } });
  try { var access = DriveApp.getFileById(Store.ss().getId()).getSharingAccess(); if (String(access) !== 'PRIVATE') p.push('SHARING: spreadsheet link-sharing is "' + access + '". It must be PRIVATE (only named staff accounts).'); } catch (e) { p.push('Could not check sharing: ' + e.message); }
  return p;
}
function integrityCheckMenu() { try { Store.forgetSchemaCheck(); Store.ensureExistingSchema(); } catch (e) { say_('Schema problem', String(e.message)); return; } var p = integrityCheck(); say_('Integrity check', p.length ? 'PROBLEMS FOUND:\n\n' + p.join('\n') : 'All checks passed: stock ledger = balances, sale totals = lines, no double-billed branch items, spreadsheet is private.'); }

/* Verifies on the REAL Sheets service that formats keep text exact (timestamps, leading zeros, "=" text) and numbers/booleans round-trip. */
function selfTestMenu() {
  var s = Store.ss(), sh = s.getSheetByName('_selftest') || s.insertSheet('_selftest'), vals = ['2026-11-05T09:00:00.000Z', '0600000000', '=1+1', '+252 63', 'ITM-001', '-5 test', '@SUM(1)', '\u200Bx', ''];
  sh.clear(); sh.getRange(1, 1, vals.length, 1).setNumberFormat('@');
  sh.getRange(1, 1, vals.length, 1).setValues(vals.map(function (v) { return [Store.encText(v)]; })); SpreadsheetApp.flush();
  var back = sh.getRange(1, 1, vals.length, 1).getValues().map(function (r) { return Store.decText(r[0]); }), ok = vals.every(function (v, i) { return back[i] === v; });
  var formulas = sh.getRange(1, 1, vals.length, 1).getFormulas().filter(function (r) { return r[0] !== ''; }).length;
  s.deleteSheet(sh); say_('Sheets self-test', (ok && formulas === 0) ? 'PASS: text (including text starting with = + - @) is stored exactly and no formulas were created.' : 'FAIL: ' + JSON.stringify(back) + ' formulas=' + formulas);
}

/* Private daily copy of the database in your own Drive (keeps 14). */
function dailyBackup() {
  var it = DriveApp.getFoldersByName('ANE Backups'), f = it.hasNext() ? it.next() : DriveApp.createFolder('ANE Backups'), name = 'ANE-backup-' + Utilities.formatDate(new Date(), 'Africa/Mogadishu', 'yyyy-MM-dd');
  DriveApp.getFileById(Store.ss().getId()).makeCopy(name, f);
  var files = []; var fi = f.getFiles(); while (fi.hasNext()) files.push(fi.next()); files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(14).forEach(function (x) { x.setTrashed(true); });
}
function installDailyBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(2).create(); say_('Backup', 'A private backup copy will be made every night (last 14 kept) in the Drive folder "ANE Backups".');
}
