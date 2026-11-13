/* Somali / English screen language. Only the on-screen app is translated; invoices, receipts and reports always stay in English
   (they are rendered inside [data-noi18n] areas and in the print area, which this module never touches).
   Built-in Somali is a starting point: the owner or a manager can correct any phrase in Settings → Language. */
(function () {
  'use strict';
  const SO = {
    'Dashboard': 'Guud-ahaan', 'Branch Collections': 'Qaadashada Laamaha', 'Branches': 'Laamaha', 'Sell': 'Iibi', 'Expenses': 'Kharashaadka', 'Sales & Invoices': 'Iibka & Qaansheegyada', 'Inventory': 'Bakhaarka', 'Customers': 'Macaamiisha',
    'Purchasing': 'Iibsiga', 'Finance': 'Maaliyadda', 'Reports': 'Warbixinno', 'Insights': 'Falanqayn', 'Staff': 'Shaqaalaha', 'Staff & Permissions': 'Shaqaalaha & Fasaxyada', 'Settings': 'Dejinta', 'Audit Log': 'Diiwaanka Hubinta', 'More': 'Dheeraad', 'All modules': 'Dhammaan qaybaha',
    'Sign out': 'Ka bax', 'Sign in': 'Gal', 'Username': 'Magaca isticmaalaha', 'Password': 'Erayga sirta ah', 'Synced': 'La isku mid yeelay', 'Offline': 'Khadka ma saaran',
    'Save': 'Kaydi', 'Cancel': 'Jooji', 'Close': 'Xir', 'Confirm': 'Xaqiiji', 'Edit': 'Beddel', 'Add': 'Ku dar', 'Delete': 'Tirtir', 'Search': 'Raadi', 'Back': 'Dib', 'Done': 'Waa la dhammeeyay', 'Yes': 'Haa', 'No': 'Maya', 'All': 'Dhammaan', 'None': 'Midna', 'Clear': 'Nadiifi', 'Reverse': 'Ka noqo (Reverse)',
    'New sale': 'Iib cusub', 'Complete sale': 'Dhammaystir iibka', 'Send to branch': 'U dir laanta', 'Cart': 'Gaadhiga iibka', 'View cart': 'Arag gaadhiga', 'Customer': 'Macmiilka', 'Payment method': 'Habka lacag-bixinta', 'Products': 'Alaabta', 'Product': 'Alaabta', 'Qty': 'Tirada', 'Total': 'Wadarta', 'Price': 'Qiimaha', 'Amount': 'Qadarka', 'Items': 'Alaabta',
    'Out of stock': 'Waa dhamaaday', 'Low stock': 'Hoos u dhacay', 'In stock': 'Waa jirtaa', 'Available': 'La heli karo', 'With branches': 'Laamaha ku jira', 'Category': 'Nooca', 'All categories': 'Dhammaan noocyada', 'Status': 'Xaalad', 'Active': 'Shaqeynaya', 'Inactive': 'Joojisan', 'Cost': 'Kharash (Cost)', 'Markup': 'Faa\'iido boqolkiiba',
    'Branch': 'Laan', 'Assistant who took the items': 'Kaaliyaha alaabta qaaday', 'Technician the items are for': 'Farsamayaqaanka loo qaaday', 'Choose assistant…': 'Dooro kaaliye…', 'Choose technician…': 'Dooro farsamayaqaan…', 'Assistant collecting': 'Kaaliyaha qaadanaya', 'Technician it is for': 'Farsamayaqaanka loo qaadanayo',
    'Pending': 'Sugaya', 'Sold': 'La iibiyay', 'Returned': 'La soo celiyay', 'Overdue': 'Dhaafay waqtigii', 'Overdue (48h+)': 'Dhaafay (48 saac+)', 'Mark sold': 'Calaamadi la iibiyay', 'Mark returned': 'Calaamadi la soo celiyay', 'Select all pending': 'Dooro dhammaan sugaya', 'Clear selection': 'Ka saar doorashada', 'History': 'Taariikh',
    'Units with this branch': 'Cutubyada laantan ku jira', 'Pending units': 'Cutubyo sugaya', '+ New collection': '+ Qaadasho cusub', 'Confirm collection': 'Xaqiiji qaadashada', '+ Add another product': '+ Ku dar alaab kale', 'Show completed items': 'Muuji alaabta dhammaatay',
    'Technician / assistant': 'Farsamayaqaan / kaaliye', 'Collected': 'La qaaday', 'Product contains': 'Alaabtu ka koobanyahay',
    'Reconciliation': 'Xisaab-xidhka', 'Reports & invoices': 'Warbixinno & qaansheegyo', 'People': 'Dadka', 'Technicians': 'Farsamayaqaannada', 'Assistants': 'Kaaliyayaasha', 'Generate / update report': 'Samee / cusboonaysii warbixinta',
    'Branches today': 'Laamaha maanta', 'Held by branch': 'Laantu haysato', 'Ready to invoice': 'Diyaar u ah qaansheeg', 'Invoiced, unpaid': 'La qaansheegay, lama bixin', 'Sold today': 'La iibiyay maanta', 'Returned, awaiting check': 'La soo celiyay, sugaya hubin',
    'Sales in period': 'Iibka muddada', 'Gross profit': 'Faa\'iidada guud', "Today's sales": 'Iibka maanta', 'Sales this month': 'Iibka bishan', 'Sales by day': 'Iibka maalin walba', 'Right now': 'Hadda', 'Recent sales': 'Iibkii u dambeeyay', 'Needs attention': 'Waxay u baahan yihiin fiiro', 'Recent payments': 'Lacagihii u dambeeyay',
    'Customers owe us': 'Macaamiishu waa inoo daynsan yihiin', 'We owe suppliers': 'Waxaan daynsanahay alaab-qeybiyeyaasha', 'Total owed to us': 'Wadarta nalagu leeyahay', 'Owes': 'Daynta', 'Credit': 'Daymo', 'Approved': 'La ansixiyay', 'Not approved': 'Lama ansixin', 'Approved for credit': 'La ansixiyay daynta',
    '+ New customer': '+ Macmiil cusub', 'Show branches': 'Muuji laamaha', 'Hide branches': 'Qari laamaha', 'Owes (invoiced)': 'Daynta (la qaansheegay)', 'Total for the whole business': 'Wadarta ganacsiga oo dhan', 'Owed by branch': 'Dayn laan walba', 'Ordinary customer credit': 'Daynta macaamiisha caadiga ah',
    'Walk-in Customer': 'Macmiil soo gala', 'Walk-in': 'Macmiil soo gala', 'Technician / Repair Shop': 'Farsamayaqaan / Dukaanka Dayactirka', 'Business Account': 'Xisaab Ganacsi', 'Credit approval': 'Ansixinta daynta', 'Owes us money': 'Nala leeyahay lacag',
    '+ Record expense': '+ Diiwaangeli kharash', '+ Category': '+ Nooc cusub', 'Export CSV': 'Soo dejiso CSV', 'Total shown (active)': 'Wadarta la muujiyay', 'Description': 'Faahfaahin', 'Paid with': 'Lagu bixiyay', 'Recorded by': 'Diiwaangeliyay', 'Date': 'Taariikh', 'Method': 'Habka', 'By': 'Qofka', 'Sold by': 'Iibiyay',
    'Expenses history': 'Taariikhda kharashaadka', 'Summary': 'Soo koobid', 'Payments': 'Lacag-bixinno', 'Who owes whom': 'Yaa yaa leh', 'Reversed': 'La soo celiyay (Reversed)', 'Reversed only': 'Kuwa la soo celiyay oo keliya',
    'More filters': 'Filtero dheeraad ah', 'Clear filters': 'Ka saar filterada', 'Min USD': 'Ugu yaraan USD', 'Max USD': 'Ugu badnaan USD', 'From': 'Laga bilaabo', 'To': 'Ilaa', 'Collected from': 'La qaaday laga bilaabo', 'Collected to': 'La qaaday ilaa', 'Recorded by ': 'Diiwaangeliyay',
    'Counter sales': 'Iibka dukaanka', 'Branch sales': 'Iibka laamaha', 'Type': 'Nooca', 'Payment': 'Lacag-bixin', 'Direction': 'Jihada', 'Received': 'La helay', 'Paid out': 'La bixiyay', 'Time': 'Waqtiga', 'Sale': 'Iib', 'Item': 'Shay',
    'Language': 'Luuqadda', 'My language': 'Luuqadayda', 'Use the business default': 'Isticmaal tan ganacsigu dejiyay', 'English': 'Ingiriis', 'Somali': 'Soomaali', 'Default language for staff': 'Luuqadda caadiga ah ee shaqaalaha',
    'Exchange rates': 'Sicirka sarrifka', 'Rate history': 'Taariikhda sicirka', 'Business details': 'Faahfaahinta ganacsiga', 'Save details': 'Kaydi faahfaahinta', 'My account': 'Xisaabtayda', 'Change my password': 'Beddel erayga sirta ah', 'Data & offline sync': 'Xogta & isku-xirka khadka la\'aanta', 'View offline transactions': 'Arag macaamilaadka la sugayo', 'Sync now': 'Isku mid yeel hadda',
    'Reset system': 'Dib u deji nidaamka', 'Danger zone': 'Meel khatar ah', 'Reset everything': 'Dib u deji wax walba',
    'Daily cash closing': 'Xidhidhka lacagta maalinlaha', 'Today': 'Maanta', 'Yesterday': 'Shalay', 'Last 7 days': '7-dii maalmood ee la soo dhaafay', 'This month': 'Bishan', 'Last month': 'Bishii hore', 'Custom': 'Gaar ah', 'All time': 'Waqti walba',
    'Nothing yet.': 'Wax weli ma jiraan.', 'No products match.': 'Alaab lama helin.', 'No expenses match.': 'Kharash lama helin.', 'No sales in this period.': 'Iib muddadan ma jiro.', 'No open items for this branch.': 'Alaab furan oo laantan ah ma jirto.',
    'Quantity': 'Tirada', 'Reason (required)': 'Sabab (waa loo baahan yahay)', 'Notes': 'Qoraallo', 'Name': 'Magac', 'Phone': 'Taleefan', 'Email': 'Iimayl', 'Address': 'Cinwaan', 'Role': 'Doorka', 'Owner': 'Mulkiilaha', 'Manager': 'Maamule', 'Employee': 'Shaqaale',
    'Loading…': 'Waa la soo rarayaa…', 'Please wait…': 'Fadlan sug…', 'Saved': 'Waa la kaydiyay', 'Done.': 'Waa dhammaaday.', 'Expense recorded': 'Kharashka waa la diiwaangeliyay',
    '{n} item(s) shown': '{n} shay ayaa la muujiyay', '{n} of {n} sale(s)': '{n} ee {n} iib', '{n} of {n} expense(s)': '{n} ee {n} kharash', '{n} in stock': '{n} ayaa jira', '{n} selected': '{n} la doortay', '{n} unit(s)': '{n} cutub', '{n} transaction(s)': '{n} macaamil', '{n} product(s)': '{n} alaab', '{n}h ago': '{n} saac ka hor'
  };
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
  const settings = () => (window.APP && APP.S && APP.S.settings) || {};
  const bizDefault = () => settings().default_language || store.get('ane_deflang') || 'en';
  const lang = () => { const u = store.get('ane_lang'); return u === 'en' || u === 'so' ? u : bizDefault(); };
  let compiled = null, key = '';
  function dict() { return Object.assign({}, SO, settings().i18n_so || {}); }
  function compile() {
    const d = dict(), sig = JSON.stringify(d); if (compiled && sig === key) return compiled; key = sig;
    const exact = {}, tpl = []; Object.keys(d).forEach(k => { if (k.indexOf('{n}') >= 0) { const re = new RegExp('^' + k.split('{n}').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$'); tpl.push([re, d[k]]); } else exact[k] = d[k]; });
    return compiled = { exact, tpl };
  }
  function tr(text) {
    const c = compile(), t = text.trim(); if (!t) return text;
    let out = c.exact[t]; if (out === undefined) { for (let i = 0; i < c.tpl.length; i++) { const m = c.tpl[i][0].exec(t); if (m) { let k = 0; out = c.tpl[i][1].replace(/\{n\}/g, () => m[++k]); break; } } }
    if (out === undefined) return text; const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0]; return lead + out + trail;
  }
  let on = false, translated = false, obs = null, pending = false;
  const skip = n => { for (let e = n.nodeType === 1 ? n : n.parentNode; e; e = e.parentNode) { if (e.nodeType === 1 && (e.hasAttribute('data-noi18n') || /^(SCRIPT|STYLE|TEXTAREA|CODE)$/.test(e.tagName) || e.id === 'printarea')) return true; } return false; };
  function run(root, so) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null); let n = w.currentNode;
    const attrs = ['placeholder', 'title', 'aria-label'];
    while (n) {
      if (n.nodeType === 3) {
        if (n.__last !== undefined && n.nodeValue !== n.__last) { n.__en = n.nodeValue; }     /* app rewrote the text: new original */
        if (n.__en === undefined) n.__en = n.nodeValue;
        if (!skip(n)) { const want = so ? tr(n.__en) : n.__en; if (n.nodeValue !== want) { n.nodeValue = want; translated = true; } n.__last = n.nodeValue; }
      } else if (n.nodeType === 1 && !skip(n)) {
        attrs.forEach(a => { if (!n.hasAttribute(a)) return; const v = n.getAttribute(a); n.__ea = n.__ea || {}; if (n.__el && n.__el[a] !== undefined && v !== n.__el[a]) n.__ea[a] = v; if (n.__ea[a] === undefined) n.__ea[a] = v; const want = so ? tr(n.__ea[a]) : n.__ea[a]; if (v !== want) { n.setAttribute(a, want); translated = true; } n.__el = n.__el || {}; n.__el[a] = n.getAttribute(a); });
      }
      n = w.nextNode();
    }
  }
  function apply() {
    pending = false; const so = lang() === 'so'; if (!so && !translated) return;
    if (obs) obs.disconnect();
    try { ['app', 'dlg', 'toasts'].forEach(id => { const el = document.getElementById(id); if (el) run(el, so); }); } finally { if (so === false) translated = false; watch(); }
  }
  function schedule() { if (pending) return; pending = true; (window.requestAnimationFrame || setTimeout)(apply); }
  function watch() { if (!obs) obs = new MutationObserver(schedule); ['app', 'dlg', 'toasts'].forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el, { childList: true, characterData: true, subtree: true }); }); }
  function setLang(l) { if (l === 'auto') { try { localStorage.removeItem('ane_lang'); } catch (e) { } } else store.set('ane_lang', l); document.documentElement.lang = lang(); apply(); if (window.APP && APP.S && APP.render) APP.render(); }
  function init() { const d = bizDefault(); store.set('ane_deflang', d); document.documentElement.lang = lang(); watch(); apply(); }
  window.addEventListener('load', init);
  window.APP = window.APP || {};
  APP.i18n = { lang, setLang, apply, tr, builtIn: SO, dict, bizDefault, refresh() { compiled = null; store.set('ane_deflang', bizDefault()); apply(); } };
})();
