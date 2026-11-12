/* Printable / shareable documents: sales invoice, branch reconciliation invoice, purchase order, customer statement */
(function () {
  'use strict';
  const { esc, usd, slsh, dt, dday, dkey, $, modal, toast } = APP;
  const B = () => APP.S.settings;
  const aed = m => 'AED ' + (m / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shell = (title, no, meta, body) => `<div class="doc"><div class="doc-head"><img class="doc-logo" src="assets/logo/AdamNokia_Primary_FullColor.svg" alt="Adam Nokia Electronics"><div class="doc-biz"><b>${esc(B().business_name)}</b><br>Mobile Phone Parts Wholesale &amp; Retail<br>${esc(B().address)}<br>Tel ${esc(B().phone)} · ${esc(B().email)}<br>${esc(B().website)}</div></div>
    <h1>${title}</h1><div class="doc-meta"><div><span>Number:</span> <b>${esc(no)}</b></div>${meta.map(m => `<div><span>${m[0]}:</span> ${m[1]}</div>`).join('')}</div>${body}<div class="doc-foot">Thank you for your business · ${esc(B().business_name)} · ${esc(B().phone)}<br>Generated ${dt(new Date().toISOString())}</div></div>`;
  const rows = (arr, f) => arr.map(f).join('');

  function sale(s) {
    const slshT = Math.round(s.total_usd_cents * s.rate_usd_slsh / 100);
    return shell('INVOICE', s.id, [['Date', dday(s.offline_at || s.at) + ' ' + dt(s.offline_at || s.at).slice(-5)], ['Customer', esc(s.customer)], ['Served by', esc(s.by_name || '')], ['Payment', s.payment_method === 'CREDIT' ? 'On credit (pay later)' : esc(String(s.payment_method).replace('_', ' '))]],
      `<table><thead><tr><th>#</th><th>Item</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Total</th></tr></thead><tbody>${rows(s.items, (i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}<br><span style="color:#666;font-size:10.5px">${esc(i.product_id)}</span></td><td class="right">${i.qty}</td><td class="right">${usd(i.unit_price_usd_cents)}</td><td class="right">${usd(i.qty * i.unit_price_usd_cents)}</td></tr>`)}</tbody></table>
      <div class="doc-sum"><div class="g"><span>Total (USD)</span><b>${usd(s.total_usd_cents)}</b></div><div><span>Equivalent</span><span>${slsh(slshT)}</span></div><div><span>Rate used</span><span>1 USD = ${APP.num(s.rate_usd_slsh)} SLSH</span></div></div>`);
  }
  function recon(g) {
    const p = g.period, r = g.revision, sumQ = a => a.reduce((s, x) => s + x.qty, 0), isCur = r.is_current;
    const sold = r.sold.length ? `<table><thead><tr><th>Product</th><th>ID</th><th>Technician</th><th>Assistant</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Line total</th></tr></thead><tbody>${rows(r.sold, x => `<tr><td>${esc(x.name)}</td><td>${esc(x.sku)}</td><td>${esc(x.technician)}</td><td>${esc(x.assistant)}</td><td class="right">${x.qty}</td><td class="right">${usd(x.unit_price_usd_cents)}</td><td class="right">${usd(x.total_usd_cents)}</td></tr>`)}<tr class="totrow"><td colspan="4">Invoice total (confirmed sold)</td><td class="right">${sumQ(r.sold)}</td><td></td><td class="right">${usd(r.total_usd_cents)}</td></tr></tbody></table>` : '<p>No items confirmed sold yet.</p>';
    const pend = r.pending.length ? `<table><thead><tr><th>Product</th><th>Technician</th><th>Assistant</th><th class="right">Qty</th><th>Collected</th><th>Pending</th><th>Status</th></tr></thead><tbody>${rows(r.pending, x => `<tr><td>${esc(x.name)}</td><td>${esc(x.technician)}</td><td>${esc(x.assistant)}</td><td class="right">${x.qty}</td><td>${dt(x.collected_at)}</td><td>${x.age_hours}h</td><td>${x.overdue ? '<b>Overdue — Review Required</b>' : 'Pending'}</td></tr>`)}</tbody></table>` : '<p>No pending items.</p>';
    const ST = { RETURN_REPORTED: 'Returned — awaiting inspection', RETURN_INSPECTED: 'Inspected — awaiting approval', RETURNED_APPROVED: 'Returned to stock', RETURN_REJECTED: 'Return rejected' };
    const ret = r.returned.length ? `<h3 class="amb">Returned items (history — not billed)</h3><table><thead><tr><th>Product</th><th>Technician</th><th class="right">Qty</th><th>Status</th></tr></thead><tbody>${rows(r.returned, x => `<tr><td>${esc(x.name)}</td><td>${esc(x.technician)}</td><td class="right">${x.qty}</td><td>${ST[x.status] || x.status}</td></tr>`)}</tbody></table>` : '';
    return shell('RECONCILIATION INVOICE', p.invoice_no, [['Report no.', esc(p.report_no) + ' · Revision ' + r.rev + (isCur ? ' (current)' : ' (superseded)')], ['Customer', esc(g.customer.name)], ['Branch', esc(p.branch_name)], ['Period', p.period_start === p.period_end ? dkey(p.period_start) : dkey(p.period_start) + ' – ' + dkey(p.period_end)], ['Generated', dt(r.generated_at)], ['Payment due', dt(p.due_at)]],
      `${isCur ? '' : '<div class="doc-note"><b>Superseded version.</b> A newer revision of this report exists. Only the current revision is billable.</div>'}<h3>Section A — Confirmed sold items (billable)</h3>${sold}<h3 class="amb">Section B — Pending items (not billed)</h3>${pend}${ret}
      <div class="doc-sum"><div class="g"><span>Amount due (revision ${r.rev})</span><b>${usd(r.total_usd_cents)}</b></div>${isCur ? `<div><span>Paid</span><span>${usd(p.paid_usd_cents)}</span></div><div><span>Remaining balance</span><b>${usd(p.balance_usd_cents)}</b></div><div><span>Status</span><span>${p.overdue ? 'OVERDUE' : p.status}</span></div>` : ''}</div>
      <div class="doc-note">Only items confirmed sold are billed. Pending items stay with the branch and are billed only after they are confirmed sold. Returned items are credited after inspection. The current revision replaces earlier ones; no item is ever billed twice.</div>`);
  }
  function po(g) {
    const o = g.po, rate = o.aed_usd_rate;
    return shell('PURCHASE ORDER', o.po_no, [['Date', dday(o.created_at)], ['Supplier', esc(o.supplier_name)], ['Status', esc(o.status)], ['Payment terms', esc(o.payment_terms || '—')], ['Prepared by', esc(o.created_by_name)], ['Exchange rate', 'AED ' + rate + ' = USD 1']],
      `<table><thead><tr><th>#</th><th>Item (supplier name)</th><th>Our ID</th><th class="right">Qty</th><th class="right">Unit cost (AED)</th><th class="right">Total (AED)</th><th class="right">Total (USD)</th></tr></thead><tbody>${rows(o.items, (i, n) => `<tr><td>${n + 1}</td><td>${esc(i.supplier_item_name)}</td><td>${esc(i.product_id)}</td><td class="right">${i.qty_ordered}</td><td class="right">${aed(i.unit_cost_aed_minor)}</td><td class="right">${aed(i.qty_ordered * i.unit_cost_aed_minor)}</td><td class="right">${usd(i.qty_ordered * i.unit_cost_usd_cents)}</td></tr>`)}</tbody></table>
      <div class="doc-sum"><div class="g"><span>Total</span><b>${aed(o.total_aed_minor)}</b></div><div><span>Total in USD</span><span>${usd(o.total_usd_cents)}</span></div>${o.paid_usd_cents ? `<div><span>Deposit / paid</span><span>${usd(o.paid_usd_cents)}</span></div><div><span>Remaining</span><b>${usd(o.remaining_usd_cents)}</b></div>` : ''}</div>${o.notes ? `<div class="doc-note"><b>Notes:</b> ${esc(o.notes)}</div>` : ''}`);
  }
  function statement(st) {
    const c = st.customer;
    return shell(st.supplier ? 'SUPPLIER STATEMENT' : 'CUSTOMER STATEMENT', 'STM-' + c.id, [[st.supplier ? 'Supplier' : 'Customer', esc(c.name)], ['Phone', esc(c.phone || '—')], ['As of', dt(st.as_of)]].concat(st.supplier ? [] : [['Credit', c.credit_approved ? 'Approved' + (c.credit_limit_usd_cents ? ', limit ' + usd(c.credit_limit_usd_cents) : '') : 'Not approved']]),
      `<table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th class="right">Charges</th><th class="right">Payments</th><th class="right">Balance</th></tr></thead><tbody>${rows(st.rows, r => `<tr><td>${dt(r.at)}</td><td>${esc(r.type)}</td><td>${esc(r.ref)}</td><td class="right">${r.debit ? usd(r.debit) : ''}</td><td class="right">${r.credit ? usd(r.credit) : ''}</td><td class="right">${usd(r.balance)}</td></tr>`) || '<tr><td colspan="6">No credit activity.</td></tr>'}</tbody></table>
      <div class="doc-sum">${st.supplier ? `<div class="g"><span>We owe (negative = deposit paid in advance)</span><b>${usd(st.balance)}</b></div>` : `<div><span>Ordinary customer credit</span><span>${usd(c.customer_credit_outstanding_usd_cents || 0)}</span></div><div><span>Branch reconciliation</span><span>${usd(c.branch_reconciliation_outstanding_usd_cents || 0)}</span></div><div class="g"><span>Total owed</span><b>${usd(st.balance)}</b></div>`}</div>`);
  }
  function print(html, title) {
    const pa = $('#printarea'), old = document.title; pa.innerHTML = html; document.body.classList.add('printing'); document.title = title || old;
    const done = () => { document.body.classList.remove('printing'); pa.innerHTML = ''; document.title = old; window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(() => window.print(), 80);
  }
  function show(o) {
    modal(`<div class="row mb"><button class="btn" id="dp">Print / Save as PDF</button><button class="btn wa" id="dw">Share on WhatsApp</button><button class="btn sec" data-close>Close</button></div>${o.note ? `<div class="notice info">${o.note}</div>` : ''}<div style="border:1px solid var(--line);border-radius:12px;padding:14px;background:#fff">${o.html}</div>`, d => {
      d.querySelector('#dp').onclick = () => print(o.html, o.title); d.querySelector('#dw').onclick = () => { window.open('https://wa.me/' + (o.phone ? String(o.phone).replace(/\D/g, '') : '') + '?text=' + encodeURIComponent(o.wa), '_blank'); toast('WhatsApp opened. Attach the PDF from Print / Save as PDF if needed.'); };
    }, true);
  }
  APP.docs = { sale, recon, po, statement, print, show };
})();
