const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ctx = { console, SpreadsheetApp: {}, PropertiesService: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/Store.gs', 'utf8') + ';this.Store=Store;', ctx);
const S = ctx.Store;
/* Simulated Sheets behaviour: a string beginning with "=" is evaluated (becomes a number here); everything else is kept as typed. */
const sheetsStore = v => (typeof v === 'string' && v.charAt(0) === '=') ? 2 : v;
['=1+1', '+252 63', '-5 x', '@SUM(1)', '​x', 'ITM-001', '2026-11-05T09:00:00.000Z', '0600000000', '', "'quoted", '=cmd|calc'].forEach(v => {
  const stored = sheetsStore(S._cell.out('s', v));
  assert.equal(typeof stored, v === '' ? 'string' : 'string');
  assert.ok(!/^[=+\-@]/.test(stored), 'no stored text may start with a formula character: ' + JSON.stringify(stored));
  assert.equal(S._cell.inn('s', stored), v, 'exact round-trip for ' + JSON.stringify(v));
});
console.log('PASS: text starting with = + - @ is stored safely and read back exactly (formula-injection guard)');
