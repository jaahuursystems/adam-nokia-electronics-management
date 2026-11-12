/* Pages: dashboard, sell (POS), sales & invoices, inventory, customers */
(function () {
  'use strict';
  const A = APP, { $, $$, esc, num, usd, slsh, dt, dkey, badge, kpi, table, q, api, apiQ, can, toast, modal, closeModal, act, formDlg, csv } = A, PG = A.PAGES, st = A.state;
  const P = id => A.S.products.find(p => p.id === id), C = id => A.S.customers.find(c => c.id === id);
  const CAT = { WALK_IN: 'Walk-in', TECHNICIAN: 'Technician / Repair Shop', BUSINESS: 'Business Account' };

  /* ---------- Dashboard ---------- */
  PG.dashboard = {
    title: 'Dashboard', html() {
      const r = A.getRange('dash', '7d'), from = r.from || A.addDays(A.today(), -29), d = q('dashboard.get', { from, to: r.to || A.today() }), fin = d.range_gross_profit_usd != null;
      const notes = [];
      if (d.overdue_items) notes.push(`<div class="notice bad"><b>${d.overdue_items} branch unit(s) overdue — manager review required.</b> <a href="#branches">Open Branch Collections</a></div>`);
      if (d.recon_overdue) notes.push(`<div class="notice bad"><b>${d.recon_overdue} branch report(s) unpaid after the due date.</b> <a href="#branches">Review</a></div>`);
      if (d.review_pos) notes.push(`<div class="notice"><b>${d.review_pos} purchase delivery(ies) differ from the order</b> and wait for management review. <a href="#purchasing">Open Purchasing</a></div>`);
      return `${notes.join('')}${A.rangeBar('dash', '7d', '<a class="btn sm" href="#pos" style="margin-left:auto">New sale</a>' + (can('branch.collect') ? '<a class="btn sm sec" href="#branches">New collection</a>' : ''), true)}
      <div class="grid kpis">${kpi(usd(d.range_sales_usd), 'Sales in period', '', d.range_txns + ' transaction(s)')}${fin ? kpi(usd(d.range_gross_profit_usd), 'Gross profit', 'good') : ''}${fin ? kpi(usd(d.range_expenses_usd), 'Expenses') : ''}${kpi(usd(d.today_sales_usd), "Today's sales", '', d.today_txns + ' transaction(s)')}${kpi(usd(d.month_sales_usd), 'Sales this month')}</div>
      <div class="card mt"><h3>Sales by day</h3>${A.bars(d.series)}</div>
      <h4 class="mt mb" style="margin-top:22px">Right now</h4>
      <div class="grid kpis">${fin ? kpi(usd(d.stock_value_usd), 'Available stock value', '', 'at cost') : ''}${kpi(d.low_stock.length, 'Low-stock products', d.low_stock.length ? 'warn' : '')}${kpi(d.out_of_stock.length, 'Out of stock', d.out_of_stock.length ? 'bad' : '')}${kpi(usd(d.customer_owed_usd), 'Customers owe us')}${fin ? kpi(usd(d.supplier_payable_usd), 'We owe suppliers', '', d.supplier_prepaid_usd ? usd(d.supplier_prepaid_usd) + ' deposits paid' : '') : ''}${kpi(d.branch_held_units, 'Units with branches')}${kpi(d.pending_items, 'Pending branch units')}${kpi(d.overdue_items, 'Overdue (review)', d.overdue_items ? 'bad' : '')}${kpi(d.open_pos, 'Open purchase orders')}${kpi(d.recon_unpaid + ' · ' + usd(d.recon_unpaid_usd), 'Unpaid branch reports')}</div>
      <div class="grid g2 mt"><div class="card"><h3>Recent sales</h3>${d.recent_sales.length ? `<table>${d.recent_sales.map(s => `<tr><td class="sm">${dt(s.offline_at || s.at)}</td><td>${esc(s.customer)}${s.source !== 'POS' ? ' ' + badge('Branch') : ''}</td><td class="right b">${usd(s.total_usd_cents)}</td><td>${badge(s.status === 'CREDIT' ? 'Credit' : s.status === 'PAID' ? 'Paid' : s.status, s.status === 'PAID' ? 'ok' : s.status === 'REVERSED' ? 'bad' : 'warn')}</td></tr>`).join('')}</table>` : '<div class="empty">No sales yet. Make the first one in Sell.</div>'}</div>
      <div class="card"><h3>Needs attention</h3>${d.out_of_stock.length + d.low_stock.length ? `<table>${d.out_of_stock.slice(0, 8).map(p => `<tr><td>${esc(p.name)}</td><td>${badge('Out of stock', 'bad')}</td></tr>`).join('')}${d.low_stock.slice(0, 10).map(p => `<tr><td>${esc(p.name)}</td><td>${badge(p.available + ' left (min ' + p.min + ')', 'warn')}</td></tr>`).join('')}</table>` : '<div class="empty">Stock levels are healthy.</div>'}</div>
      ${fin ? `<div class="card"><h3>Recent payments</h3>${d.recent_payments.length ? `<table>${d.recent_payments.map(x => `<tr><td class="sm">${dt(x.offline_at || x.at)}</td><td>${esc(x.party)}</td><td>${badge(x.direction === 'IN' ? 'Received' : 'Paid out', x.direction === 'IN' ? 'ok' : '')}</td><td class="right b">${usd(x.usd_cents)}</td></tr>`).join('')}</table>` : '<div class="empty">No payments yet.</div>'}</div>` : ''}</div>`;
    }
  };

  /* ---------- Sell ---------- */
  PG.pos = {
    title: 'Sell', html() {
      const cats = [...new Set(A.S.products.map(p => p.category))].sort();
      return `<div class="pos"><div><div class="row"><div class="f"><input id="q" placeholder="Search name, model or ID…" value="${esc(st.q || '')}" autocomplete="off"></div><div class="f"><select id="cat"><option value="">All categories</option>${cats.map(c => `<option ${st.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div><div class="pgrid mt" id="pg"></div></div><div class="card" id="cart"></div></div><div class="cbar" id="cbar"></div>`;
    },
    bind() {
      st.cart = st.cart || {}; st.cust = st.cust || 'CUS-WALKIN'; st.method = st.method || 'ZAAD_USD';
      const draw = () => {
        const s = (st.q || '').toLowerCase(), list = A.S.products.filter(p => p.status === 'active' && (!st.cat || p.category === st.cat) && (!s || (p.name + ' ' + (p.model || '') + ' ' + p.id).toLowerCase().includes(s)));
        $('#pg').innerHTML = list.map(p => `<button class="pitem ${p.available < 1 ? 'out' : ''}" data-id="${p.id}"><span class="id">${p.id}</span><b>${esc(p.name)}</b><div class="pr">${usd(p.price_usd_cents)}</div><span class="sm ${p.available < 1 ? 'b' : 'muted'}" ${p.available < 1 ? 'style="color:var(--bad)"' : ''}>${p.available < 1 ? 'Out of stock' : p.available + ' in stock'}</span></button>`).join('') || '<div class="empty">No products match.</div>';
        $$('.pitem', $('#pg')).forEach(b => b.onclick = () => { const p = P(b.dataset.id), n = (st.cart[p.id] || 0) + 1; if (n > p.available) return toast(`Only ${p.available} available`, 'err'); st.cart[p.id] = n; cart(); });
      };
      const cart = () => {
        const ids = Object.keys(st.cart).filter(id => P(id)), total = ids.reduce((s, id) => s + P(id).price_usd_cents * st.cart[id], 0), rate = A.S.rates.USD_SLSH;
        const brCust = new Set(A.S.branches.map(b => b.customer_id)), cu = C(st.cust) || C('CUS-WALKIN') || A.S.customers[0], isBranch = brCust.has(cu.id), act8 = A.S.customers.filter(c => c.status === 'active');
        /* credit is only offered to customers a manager has approved for it */
        const methods = A.S.methods.filter(x => x.id !== 'CREDIT' || (cu.credit_approved && !isBranch)); if (!methods.find(x => x.id === st.method)) st.method = (methods.find(x => x.id === 'ZAAD_USD') || methods[0]).id; const m = methods.find(x => x.id === st.method);
        const grp = (label, arr) => arr.length ? `<optgroup label="${esc(label)}">${arr.map(c => `<option value="${c.id}" ${cu.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : '';
        const custSel = `<select id="cu">${grp('Branch accounts (billed per branch)', act8.filter(c => brCust.has(c.id)))}${grp('Approved for credit — technicians & repair shops', act8.filter(c => !brCust.has(c.id) && c.credit_approved))}${grp('Walk-in & other customers (pay now)', act8.filter(c => !brCust.has(c.id) && !c.credit_approved))}</select>`;
        let brBlock = '', ready = ids.length > 0;
        if (isBranch) {
          const mine = A.S.branches.filter(b => b.customer_id === cu.id); if (!mine.find(b => b.id === st.sbr)) st.sbr = mine[0].id;
          const ppl = role => A.S.people.filter(x => x.branch_id === st.sbr && x.role === role && x.active !== false); if (!ppl('ASSISTANT').find(x => x.id === st.sas)) st.sas = ''; if (!ppl('TECHNICIAN').find(x => x.id === st.ste)) st.ste = '';
          const opts = (arr, cur, ph) => `<option value="">${ph}</option>` + arr.map(x => `<option value="${x.id}" ${cur === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
          brBlock = `<div class="notice info mt" style="margin-bottom:8px">Sold directly to a branch. It is billed on the <b>branch account</b> and appears in that branch's report — not as ordinary credit.</div>
            <label>Branch</label><select id="sbr">${mine.map(b => `<option value="${b.id}" ${st.sbr === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
            <label>Assistant who took the items</label><select id="sas">${opts(ppl('ASSISTANT'), st.sas, 'Choose assistant…')}</select>
            <label>Technician the items are for</label><select id="ste">${opts(ppl('TECHNICIAN'), st.ste, 'Choose technician…')}</select>`;
          ready = ready && !!st.sas && !!st.ste;
        }
        $('#cart').innerHTML = `<h3>Cart</h3>${ids.length ? ids.map(id => `<div class="cartline"><div class="n"><b>${esc(P(id).name)}</b><br><span class="muted sm">${usd(P(id).price_usd_cents)} each</span></div><div class="qty"><button data-d="-1" data-id="${id}" aria-label="Less">−</button><b>${st.cart[id]}</b><button data-d="1" data-id="${id}" aria-label="More">+</button></div><div class="right nowrap b" style="min-width:68px">${usd(P(id).price_usd_cents * st.cart[id])}</div></div>`).join('') : '<div class="empty">Tap a product to add it.</div>'}
        <label>Customer</label>${custSel}${cu.credit_approved && !isBranch ? '<div class="sm" style="margin-top:4px">' + badge('Credit approved' + (cu.credit_limit_usd_cents ? ' · limit ' + usd(cu.credit_limit_usd_cents) : ''), 'ok') + '</div>' : ''}
        ${isBranch ? brBlock : `<label>Payment method</label><select id="me">${methods.map(x => `<option value="${x.id}" ${m.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`}
        <div class="mt"><div class="total">${usd(total)}</div><div class="muted">${slsh(total * rate / 100)} <span class="sm">(1 USD = ${num(rate)} SLSH)</span></div>${!isBranch && m.currency === 'SLSH' && m.id !== 'CREDIT' ? `<div class="notice info mt" style="margin-bottom:0">Customer pays <b>${slsh(total * rate / 100)}</b></div>` : ''}</div>
        <div class="row mt"><button class="btn f" id="chg" ${ready ? '' : 'disabled'}>${isBranch ? 'Sell to branch' : 'Complete sale'}</button><button class="btn sec" id="clr" ${ids.length ? '' : 'disabled'}>Clear</button></div>`;
        const cb = $('#cbar'); cb.style.display = ids.length ? '' : 'none'; cb.innerHTML = `<span><b>${ids.reduce((a, id) => a + st.cart[id], 0)}</b> item(s) · <b>${usd(total)}</b></span><button class="btn sm amber" id="cgo">View cart</button>`; $('#cgo').onclick = () => $('#cart').scrollIntoView({ behavior: 'smooth' });
        $$('[data-d]', $('#cart')).forEach(b => b.onclick = () => { const id = b.dataset.id, n = st.cart[id] + Number(b.dataset.d); if (n < 1) delete st.cart[id]; else if (n > P(id).available) toast(`Only ${P(id).available} available`, 'err'); else st.cart[id] = n; cart(); });
        $('#cu').onchange = e => { st.cust = e.target.value; st.txn = null; cart(); }; if ($('#me')) $('#me').onchange = e => { st.method = e.target.value; cart(); };
        if ($('#sbr')) { $('#sbr').onchange = e => { st.sbr = e.target.value; st.sas = ''; st.ste = ''; cart(); }; $('#sas').onchange = e => { st.sas = e.target.value; cart(); }; $('#ste').onchange = e => { st.ste = e.target.value; cart(); }; } $('#clr').onclick = () => { st.cart = {}; st.txn = null; cart(); };
        $('#chg').onclick = () => act(async () => {
          if (!st.txn) st.txn = 'TXN-' + A.DEVICE + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
          if (isBranch) {
            const lines = ids.map(id => ({ name: P(id).name, qty: st.cart[id] })), br = A.S.branches.find(b => b.id === st.sbr), as = A.S.people.find(x => x.id === st.sas), te = A.S.people.find(x => x.id === st.ste);
            const r = await apiQ('branch.directSale', { branch_id: st.sbr, assistant_id: st.sas, technician_id: st.ste, items: ids.map(id => ({ product_id: id, qty: st.cart[id] })) }, st.txn); st.cart = {}; st.txn = null;
            if (r.queued) { cart(); return r; }
            modal(`<h2 style="color:var(--ok)">Sold to ${esc(br.name)}</h2><p class="muted">Technician <b>${esc(te.name)}</b> · taken by <b>${esc(as.name)}</b></p><div class="total">${usd(total)}</div><ul style="padding-left:18px;margin:8px 0">${lines.map(l => `<li>${l.qty} × ${esc(l.name)}</li>`).join('')}</ul><p class="muted sm">Billed on the branch account. It will appear in ${esc(br.name)}'s report.</p><div class="row mt"><button class="btn f" data-close>New sale</button></div>`);
            cart(); return;
          }
          const r = await apiQ('sales.create', { customer_id: st.cust, method_id: st.method, items: ids.map(id => ({ product_id: id, qty: st.cart[id] })) }, st.txn); st.cart = {}; st.txn = null;
          if (r.queued) { cart(); return r; }
          const s = r.data.sale, c = C(s.customer_id), inv = c && c.category !== 'WALK_IN';
          modal(`<h2 style="color:var(--ok)">Sale recorded</h2><p class="muted">${esc(s.id)} · ${dt(s.offline_at || s.at)}</p><div class="total">${usd(s.total_usd_cents)}</div>${r.data.payment ? `<p>Paid with ${esc(r.data.payment.method_id.replace('_', ' '))}: <b>${r.data.payment.currency === 'USD' ? usd(r.data.payment.amount_minor) : slsh(r.data.payment.amount_minor)}</b></p>` : '<p>' + badge('On credit', 'warn') + '</p>'}
            <div class="row mt">${inv ? '<button class="btn sec f" id="mi">Invoice (optional)</button>' : ''}<button class="btn f" data-close>New sale</button></div>${inv ? '' : '<p class="muted sm">Walk-in sales keep an internal record only.</p>'}`, d => { if (d.querySelector('#mi')) d.querySelector('#mi').onclick = () => saleDoc(s.id); });
        });
      };
      $('#q').oninput = e => { st.q = e.target.value; draw(); }; $('#cat').onchange = e => { st.cat = e.target.value; draw(); }; draw(); cart();
    }
  };
  async function saleDoc(id) { const s = (await A.loadRead('sales.list', {})).find(x => x.id === id); A.docs.show({ title: s.id, html: A.docs.sale(s), phone: s.customer_phone, wa: `Adam Nokia Electronics\nInvoice ${s.id}\nCustomer: ${s.customer}\nTotal: ${usd(s.total_usd_cents)} (${slsh(Math.round(s.total_usd_cents * s.rate_usd_slsh / 100))})\nThank you!` }); }

  /* ---------- Sales & invoices ---------- */
  PG.sales = {
    title: 'Sales & Invoices', html() {
      const r = A.getRange('sales', 'today'), list = q('sales.list', { from: r.from, to: r.to }), s = (st.sq || '').toLowerCase(), rows = list.filter(x => !s || (x.customer + ' ' + x.id + ' ' + x.by_name).toLowerCase().includes(s));
      const tot = rows.filter(x => x.status === 'ACTIVE').reduce((a, x) => a + x.total_usd_cents, 0);
      return `${A.rangeBar('sales', 'today')}<div class="row mb"><div class="f"><input id="sq" placeholder="Search customer, sale number or staff…" value="${esc(st.sq || '')}"></div><div class="card" style="padding:8px 14px"><span class="muted sm">Total shown</span> <b>${usd(tot)}</b></div></div>
      ${table([['Time'], ['Sale'], ['Customer'], ['Items'], ['Total', 'right'], ['Payment'], ['By'], ['']], rows.map(x => `<tr class="click" data-id="${x.id}"><td class="sm nowrap">${dt(x.offline_at || x.at)}</td><td class="sm">${x.id}</td><td>${esc(x.customer)}${x.source !== 'POS' ? ' ' + badge('Branch') : ''}</td><td>${x.items.reduce((a, i) => a + i.qty, 0)}</td><td class="right b">${usd(x.total_usd_cents)}</td><td>${x.payment_method === 'CREDIT' || x.payment_method === 'BRANCH_ACCOUNT' ? badge(x.payment_method === 'CREDIT' ? 'On credit' : 'Branch account', 'warn') : esc(x.payment_method.replace('_', ' '))}</td><td class="sm">${esc(x.by_name || '')}</td><td>${x.status === 'REVERSED' ? badge('Reversed', 'bad') : ''}</td></tr>`).join(''), 'No sales in this period.')}`;
    },
    bind() {
      $('#sq').oninput = e => { st.sq = e.target.value; const p = e.target.selectionStart; A.render(); const i = $('#sq'); i.focus(); i.setSelectionRange(p, p); };
      $$('tr.click').forEach(r => r.onclick = () => saleDlg(r.dataset.id));
    }
  };
  async function saleDlg(id) {
    const s = (await A.loadRead('sales.list', {})).find(x => x.id === id); if (!s) return; const doc = s.source === 'POS' && s.customer_category !== 'WALK_IN';
    modal(`<h2>${s.id}</h2><p class="muted">${dt(s.offline_at || s.at)} · ${esc(s.customer)} · served by ${esc(s.by_name || '')} ${s.status === 'REVERSED' ? badge('Reversed', 'bad') : ''}</p>
      ${table([['Item'], ['Qty', 'right'], ['Price', 'right'], ['Total', 'right']], s.items.map(i => `<tr><td>${esc(i.name)}<br><span class="muted sm">${i.product_id}</span></td><td class="right">${i.qty}</td><td class="right">${usd(i.unit_price_usd_cents)}</td><td class="right">${usd(i.qty * i.unit_price_usd_cents)}</td></tr>`).join(''))}
      <div class="list mt"><div><span>Total</span><b>${usd(s.total_usd_cents)}</b></div><div><span>In shillings at the time (1 USD = ${num(s.rate_usd_slsh)})</span><span>${slsh(Math.round(s.total_usd_cents * s.rate_usd_slsh / 100))}</span></div><div><span>Payment</span><span>${esc(String(s.payment_method).replace('_', ' '))}</span></div>${s.status === 'REVERSED' ? `<div><span>Reversal</span><span>${esc(s.reverse_reason || '')}</span></div>` : ''}</div>
      <div class="row mt">${doc ? '<button class="btn" id="inv">Invoice</button>' : ''}${can('sales.reverse') && s.source === 'POS' && s.status === 'ACTIVE' ? '<button class="btn bad" id="rev">Reverse sale…</button>' : ''}<button class="btn sec" data-close>Close</button></div>${!doc ? `<p class="muted sm mt">${s.source !== 'POS' ? 'Branch sales are invoiced through Branch Collections → Reconciliation.' : 'Walk-in sales keep an internal record only; no invoice is needed.'}</p>` : ''}`, d => {
      if (d.querySelector('#inv')) d.querySelector('#inv').onclick = () => saleDoc(id);
      if (d.querySelector('#rev')) d.querySelector('#rev').onclick = () => formDlg({ title: 'Reverse sale ' + id, intro: 'Stock goes back to Available and the payment is netted. The original sale stays on record.', fields: [{ id: 'reason', label: 'Reason (required)', full: true }], ok: 'Reverse sale', onSubmit: v => apiQ('sales.reverse', { sale_id: id, reason: v.reason }), okMsg: 'Sale reversed' });
    });
  }

  /* ---------- Inventory ---------- */
  PG.inventory = {
    title: 'Inventory', html() {
      const cats = [...new Set(A.S.products.map(p => p.category))].sort(), fin = can('finance.view'), f = st.invF || 'all';
      return `<div class="row mb"><div class="f"><input id="iq" placeholder="Search by ID, name or model…" value="${esc(st.invQ || '')}"></div><div class="f"><select id="ic"><option value="">All categories</option>${cats.map(c => `<option ${st.invCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>${can('inventory.manage') ? '<button class="btn" id="addp">+ New product</button>' : ''}<button class="btn sec" id="ex">Export CSV</button></div>
      <div class="chips">${[['all', 'All'], ['low', 'Low stock'], ['out', 'Out of stock'], ['held', 'With branches'], ['inactive', 'Inactive']].map(c => `<button data-f="${c[0]}" class="${f === c[0] ? 'on' : ''}">${c[1]}</button>`).join('')}</div>
      <div class="tablewrap"><table><thead><tr><th>ID</th><th>Product</th><th>Category</th><th class="right">Available</th><th class="right">With branches</th><th class="right">Price</th>${fin ? '<th class="right">Cost</th><th class="right">Markup</th>' : ''}<th></th></tr></thead><tbody id="ib"></tbody></table></div><p class="muted sm" id="ict"></p>`;
    },
    bind() {
      const fin = can('finance.view'), rows = () => { const s = (st.invQ || '').toLowerCase(), f = st.invF || 'all'; return A.S.products.filter(p => (!st.invCat || p.category === st.invCat) && (!s || (p.name + ' ' + (p.model || '') + ' ' + p.id + ' ' + p.category + ' ' + (p.legacy_id || '')).toLowerCase().includes(s)) &&
        (f === 'all' ? p.status === 'active' : f === 'low' ? p.status === 'active' && p.available > 0 && p.available <= p.min_stock : f === 'out' ? p.status === 'active' && p.available === 0 : f === 'held' ? p.held > 0 : p.status !== 'active')); };
      const draw = () => { const l = rows(); $('#ib').innerHTML = l.map(p => `<tr class="click" data-id="${p.id}"><td class="nowrap b" style="color:var(--blue)">${p.id}</td><td>${esc(p.name)}${p.status !== 'active' ? ' ' + badge('inactive', 'gray') : ''}</td><td>${esc(p.category)}</td><td class="right b">${p.available}</td><td class="right">${p.held || '—'}</td><td class="right">${usd(p.price_usd_cents)}</td>${fin ? `<td class="right muted">${usd(p.cost_usd_cents)}</td><td class="right muted">${p.cost_usd_cents ? Math.round((p.price_usd_cents / p.cost_usd_cents - 1) * 100) + '%' : ''}</td>` : ''}<td>${p.available < 1 ? badge('Out', 'bad') : p.available <= p.min_stock ? badge('Low', 'warn') : ''}</td></tr>`).join('') || `<tr><td colspan="9" class="empty">No products found.</td></tr>`; $('#ict').textContent = l.length + ' product(s)'; $$('tr.click', $('#ib')).forEach(r => r.onclick = () => productDlg(r.dataset.id)); };
      $('#iq').oninput = e => { st.invQ = e.target.value; draw(); }; $('#ic').onchange = e => { st.invCat = e.target.value; draw(); }; $$('[data-f]').forEach(b => b.onclick = () => { st.invF = b.dataset.f; A.render(); }); draw();
      $('#ex').onclick = () => csv('inventory', [['id', 'ID', 'text'], ['name', 'Product', 'text'], ['category', 'Category', 'text'], ['available', 'Available', 'int'], ['held', 'With branches', 'int'], ['price_usd_cents', 'Price (USD)', 'usd']].concat(fin ? [['cost_usd_cents', 'Cost (USD)', 'usd']] : []), A.S.products);
      if ($('#addp')) $('#addp').onclick = () => productForm();
    }
  };
  function productForm(p) {
    const cats = [...new Set(A.S.products.map(x => x.category))].sort(), sup = [['', '— none —']].concat(A.S.suppliers.map(s => [s.id, s.name]));
    formDlg({ title: p ? 'Edit product' : 'New product', intro: p ? `ID ${p.id} cannot change.` : 'An ID is generated automatically from the category (for example ANE-IL-019). Opening stock is added afterwards with a stock adjustment so every unit has a reason.',
      fields: [{ id: 'name', label: 'Product name', value: p && p.name, full: true }, { id: 'category', label: 'Category', value: p && p.category, list: 'catl' }, { id: 'model', label: 'Compatible phone model', value: p && p.model || '' }, { id: 'variant_tag', label: 'Variant / quality tag', value: p && p.variant_tag || '' }, { id: 'min_stock', label: 'Minimum stock level', type: 'number', min: 0, value: p ? (p.min_stock == null ? '' : p.min_stock) : '', help: 'Leave empty to use the default (' + A.S.settings.default_min_stock + ')' }, { id: 'supplier_id', label: 'Supplier', type: 'select', options: sup, value: p && p.supplier_id || '' }]
        .concat(p ? [] : [{ id: 'cost_aed', label: 'Cost (AED)', type: 'number', step: '0.01' }, { id: 'price_usd', label: 'Selling price (USD)', type: 'number', step: '0.01' }]), extra: `<datalist id="catl">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</datalist>`,
      onSubmit: v => p ? apiQ('products.update', { product_id: p.id, name: v.name, category: v.category, model: v.model, variant_tag: v.variant_tag, min_stock: v.min_stock, supplier_id: v.supplier_id }) : apiQ('products.create', { name: v.name, category: v.category.trim(), model: v.model, variant_tag: v.variant_tag, min_stock: v.min_stock, supplier_id: v.supplier_id, cost_aed: v.cost_aed, price_usd: v.price_usd }), okMsg: p ? 'Product updated' : 'Product added' });
  }
  async function productDlg(id) {
    const p = P(id); let mv; try { mv = await A.loadRead('stock.movements', { product_id: id }); } catch (e) { toast(e.message, 'err'); return; } const fin = can('finance.view'), nm = { OPENING: 'Opening stock', SALE: 'Sale', SALE_REVERSAL: 'Sale reversed', ADJUSTMENT: 'Adjustment', BRANCH_COLLECTION: 'Collected by branch', BRANCH_SOLD: 'Branch sold', RETURN_APPROVED: 'Return approved', PURCHASE_RECEIPT: 'Purchase received' };
    modal(`<h2>${esc(p.name)} ${p.status !== 'active' ? badge('inactive', 'gray') : ''}</h2><p class="muted">ID <b>${p.id}</b> · ${esc(p.category)}${p.model ? ' · ' + esc(p.model) : ''}${p.variant_tag ? ' · ' + esc(p.variant_tag) : ''}${p.legacy_id ? ` · <span class="sm">original sheet ID ${p.legacy_id}</span>` : ''}</p>
      <div class="grid kpis"><div class="card kpi">${'<div class="l">Available</div><div class="v">' + p.available + '</div>'}</div><div class="card kpi"><div class="l">With branches</div><div class="v">${p.held}</div></div><div class="card kpi"><div class="l">Selling price</div><div class="v">${usd(p.price_usd_cents)}</div>${fin ? `<div class="s">cost ${usd(p.cost_usd_cents)}</div>` : ''}</div></div>
      <div class="row mt">${can('inventory.manage') ? '<button class="btn sec sm" id="ed">Edit details</button><button class="btn sec sm" id="tg">' + (p.status === 'active' ? 'Deactivate' : 'Activate') + '</button>' : ''}</div>
      ${can('price.update') ? `<label>Change selling price (USD) — recorded in the audit log</label><div class="row"><input class="f" id="np" type="number" step="0.01" value="${(p.price_usd_cents / 100).toFixed(2)}"><input class="f" id="npr" placeholder="Reason"><button class="btn" id="sp">Update price</button></div>` : '<p class="muted sm">Prices are fixed. Only a manager or owner can change them.</p>'}
      ${can('stock.adjust') ? `<label>Adjust stock (+ adds, − removes). A reason is required.</label><div class="row"><input class="f" id="ad" type="number" placeholder="e.g. -2 or 10"><input class="f" id="ar" placeholder="Reason (e.g. damaged, counted)"><button class="btn amber" id="sa">Adjust</button></div>` : ''}
      <h3 class="mt">Stock history</h3>${table([['When'], ['What'], ['Qty', 'right'], ['Note']], mv.map(m => `<tr><td class="sm nowrap">${dt(m.at)}</td><td>${nm[m.type] || m.type}</td><td class="right b">${m.to === 'AVAILABLE' ? '+' : m.from === 'AVAILABLE' ? '−' : ''}${m.qty}</td><td class="muted sm">${esc(m.reason || m.ref || '')}</td></tr>`).join(''))}<button class="btn sec mt" data-close style="width:100%">Close</button>`, d => {
      const g = x => d.querySelector(x);
      if (g('#ed')) g('#ed').onclick = () => productForm(p); if (g('#tg')) g('#tg').onclick = () => act(async () => { await apiQ('products.setStatus', { product_id: id, status: p.status === 'active' ? 'inactive' : 'active' }); closeModal(); }, 'Updated');
      if (g('#sp')) g('#sp').onclick = () => act(async () => { await apiQ('products.setPrice', { product_id: id, price_usd_cents: Math.round(Number(g('#np').value) * 100), reason: g('#npr').value }); return () => productDlg(id); }, 'Price updated');
      if (g('#sa')) g('#sa').onclick = () => act(async () => { await apiQ('stock.adjust', { product_id: id, delta: Number(g('#ad').value), reason: g('#ar').value }); return () => productDlg(id); }, 'Stock adjusted');
    });
  }

  /* ---------- Customers ---------- */
  PG.customers = {
    title: 'Customers', html() {
      const BD = (() => { try { return q('customers.breakdowns', {}) || {}; } catch (e) { return {}; } })();
      const s = (st.cq || '').toLowerCase(), l = A.S.customers.filter(c => !s || (c.name + ' ' + (c.phone || '')).toLowerCase().includes(s)), owed = A.S.customers.reduce((a, c) => a + Math.max(0, c.outstanding_usd_cents), 0);
      return `<div class="grid kpis mb">${kpi(A.S.customers.length, 'Customers')}${kpi(A.S.customers.filter(c => c.credit_approved).length, 'Approved for credit')}${kpi(usd(owed), 'Total owed to us', owed ? 'warn' : '')}</div><div class="row mb"><div class="f"><input id="cq" placeholder="Search name or phone…" value="${esc(st.cq || '')}"></div>${can('customers.create') ? '<button class="btn" id="addc">+ New customer</button>' : ''}</div>
      ${table([['Name'], ['Category'], ['Credit'], ['Owes', 'right']], l.map(c => { const b = BD[c.id], open = b && st.cx === c.id; return `<tr class="click" data-id="${c.id}"><td><b>${esc(c.name)}</b><br><span class="muted sm">${esc(c.phone || '')}</span>${b ? `<br><button class="btn sec sm xp" data-x="${c.id}" style="margin-top:6px">${open ? '▾ Hide' : '▸ Show'} branches</button>` : ''}</td><td>${CAT[c.category]}</td><td>${c.credit_approved ? badge('Approved' + (c.credit_limit_usd_cents ? ' · limit ' + usd(c.credit_limit_usd_cents) : ''), 'ok') : badge('Not approved', 'gray')}</td><td class="right b">${c.outstanding_usd_cents ? usd(c.outstanding_usd_cents) : '—'}</td></tr>${open ? `<tr class="subrow"><td colspan="4">${breakdownHtml(b)}</td></tr>` : ''}`; }).join(''))}`;
    },
    bind() {
      $('#cq').oninput = e => { st.cq = e.target.value; const p = e.target.selectionStart; A.render(); const i = $('#cq'); i.focus(); i.setSelectionRange(p, p); };
      $$('.xp').forEach(b => b.onclick = e => { e.stopPropagation(); st.cx = st.cx === b.dataset.x ? null : b.dataset.x; A.render(); });
      $$('tr.click').forEach(r => r.onclick = () => custDlg(r.dataset.id)); if ($('#addc')) $('#addc').onclick = () => custForm();
    }
  };
  /* What a business owes, branch by branch, then the total for the whole business. Ordinary credit is its own line (separate ledger). */
  function breakdownHtml(b) {
    const rows = b.branches.map(r => `<tr><td><b>${esc(r.name)}</b>${r.overdue ? ' ' + badge('Overdue', 'bad') : ''}${r.sold_not_invoiced_usd_cents || r.pending_units ? `<br><span class="muted sm">${r.sold_not_invoiced_usd_cents ? 'Sold, report not yet generated: ' + usd(r.sold_not_invoiced_usd_cents) : ''}${r.sold_not_invoiced_usd_cents && r.pending_units ? ' · ' : ''}${r.pending_units ? 'Pending with branch: ' + r.pending_units + ' unit(s) (' + usd(r.pending_value_usd_cents) + ', not owed yet)' : ''}</span>` : ''}</td><td class="right b">${r.invoiced_outstanding_usd_cents ? usd(r.invoiced_outstanding_usd_cents) : '—'}</td></tr>`).join('');
    return `<table class="bd"><thead><tr><th>Branch</th><th class="right">Owes (invoiced)</th></tr></thead><tbody>${rows}${b.ordinary_credit_usd_cents ? `<tr><td>Ordinary customer credit <span class="muted sm">(separate from branches)</span></td><td class="right b">${usd(b.ordinary_credit_usd_cents)}</td></tr>` : ''}<tr class="tot"><td><b>Total for the whole business</b></td><td class="right b">${usd(b.total_usd_cents)}</td></tr></tbody></table>`;
  }
  function custForm(c) { formDlg({ title: c ? 'Edit customer' : 'New customer', intro: 'Category does not give credit. Credit is approved separately by a manager or owner.', fields: [{ id: 'name', label: 'Name', value: c && c.name, full: true }, { id: 'phone', label: 'Phone', value: c && c.phone || '' }, { id: 'category', label: 'Category', type: 'select', options: Object.entries(CAT), value: c ? c.category : 'WALK_IN' }, { id: 'address', label: 'Address', value: c && c.address || '', full: true }, { id: 'notes', label: 'Notes', type: 'textarea', value: c && c.notes || '', full: true }], onSubmit: v => c ? apiQ('customers.update', Object.assign({ customer_id: c.id }, v)) : apiQ('customers.create', v) }); }
  async function custDlg(id) {
    const c = C(id); let stm, bd = null; try { stm = await A.loadRead('customers.statement', { customer_id: id }); const all = await A.loadRead('customers.breakdowns', {}); bd = all && all[id]; } catch (e) { toast(e.message, 'err'); return; }
    modal(`<h2>${esc(c.name)}</h2><p class="muted">${CAT[c.category]} · ${esc(c.phone || 'no phone')} ${c.credit_approved ? badge('Credit approved' + (c.credit_limit_usd_cents ? ' · limit ' + usd(c.credit_limit_usd_cents) : ''), 'ok') : badge('No credit', 'gray')}</p>${c.notes ? `<p class="sm">${esc(c.notes)}</p>` : ''}
      <div class="grid kpis"><div class="card kpi"><div class="l">Ordinary customer credit</div><div class="v">${usd(c.customer_credit_outstanding_usd_cents || 0)}</div></div><div class="card kpi"><div class="l">Branch reconciliation</div><div class="v">${usd(c.branch_reconciliation_outstanding_usd_cents || 0)}</div></div><div class="card kpi"><div class="l">Total owed</div><div class="v">${usd(c.outstanding_usd_cents)}</div></div></div>
      ${bd ? `<h3 style="margin:16px 0 6px">Owed by branch</h3>${breakdownHtml(bd)}` : ''}
      <div class="row mt">${can('customers.manage') ? '<button class="btn sec sm" id="ed">Edit</button>' : ''}${can('credit.approve') && !c.system || can('credit.approve') && c.id === 'CUS-AANR' ? '<button class="btn sec sm" id="cr">Credit…</button>' : ''}${can('payments.record') && (c.customer_credit_outstanding_usd_cents || 0) > 0 ? '<button class="btn sm" id="pay">Record ordinary credit repayment</button>' : ''}<button class="btn sec sm" id="sm">Statement</button></div>
      <h3 class="mt">Credit account activity</h3>${table([['When'], ['What'], ['Charges', 'right'], ['Paid', 'right'], ['Balance', 'right']], stm.rows.map(r => `<tr><td class="sm nowrap">${dt(r.at)}</td><td>${esc(r.type)}<br><span class="muted sm">${esc(r.ref)}</span></td><td class="right">${r.debit ? usd(r.debit) : ''}</td><td class="right">${r.credit ? usd(r.credit) : ''}</td><td class="right b">${usd(r.balance)}</td></tr>`).join(''), 'No credit activity.')}${c.id === 'CUS-AANR' ? '<p class="muted sm mt">Branch sales are billed on reconciliation invoices (Branch Collections → Reconciliation).</p>' : ''}<button class="btn sec mt" data-close style="width:100%">Close</button>`, d => {
      const g = x => d.querySelector(x);
      if (g('#ed')) g('#ed').onclick = () => custForm(c);
      if (g('#cr')) g('#cr').onclick = () => formDlg({ title: 'Credit — ' + c.name, fields: [{ id: 'ap', label: 'Credit approved', type: 'select', options: [['0', 'No'], ['1', 'Yes']], value: c.credit_approved ? '1' : '0' }, { id: 'lm', label: 'Credit limit (USD, 0 = no limit)', type: 'number', value: c.credit_limit_usd_cents / 100 }, { id: 'rs', label: 'Reason', full: true }], onSubmit: v => apiQ('customers.setCredit', { customer_id: c.id, approved: v.ap === '1', limit_usd: v.lm, reason: v.rs }), okMsg: 'Credit updated' });
      if (g('#pay')) g('#pay').onclick = () => formDlg({ title: 'Payment from ' + c.name, intro: 'Ordinary customer credit outstanding: <b>' + usd(c.customer_credit_outstanding_usd_cents || 0) + '</b>. Branch reconciliation invoices must be paid from their own report screen.', fields: [{ id: 'm', label: 'Method', type: 'select', options: A.S.methods.filter(m => m.id !== 'CREDIT').map(m => [m.id, m.name]) }, { id: 'a', label: 'Amount (in the method’s currency)', type: 'number', step: '0.01' }, { id: 'rf', label: 'Reference (optional)', full: true }], ok: 'Record payment', onSubmit: v => apiQ('payments.recordRepayment', { customer_id: c.id, method_id: v.m, amount: v.a, reference: v.rf }), okMsg: 'Payment recorded' });
      g('#sm').onclick = () => A.docs.show({ title: 'Statement ' + c.name, html: A.docs.statement(stm), phone: c.phone, wa: `Adam Nokia Electronics\nStatement for ${c.name}\nBalance owed: ${usd(stm.balance)}\nThank you!` });
    });
  }
})();
