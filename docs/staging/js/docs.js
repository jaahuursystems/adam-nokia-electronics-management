/* Printable / shareable documents: sales invoice, branch reconciliation invoice, purchase order, customer statement */
(function () {
  'use strict';
  const { esc, usd, slsh, dt, dday, dkey, $, modal, toast } = APP;
  const B = () => APP.S.settings;
  const aed = m => 'AED ' + (m / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shell = (title, no, meta, body) => `<div class="doc"><div class="doc-head"><img class="doc-logo" src="assets/logo/AdamNokia_Primary_FullColor.svg" alt="Adam Nokia Electronics"><div class="doc-biz"><b>${esc(B().business_name)}</b><br>Mobile Phone Parts Wholesale &amp; Retail<br>${esc(B().address)}<br>Tel ${esc(B().phone)} · ${esc(B().email)}<br>${esc(B().website)}</div></div>
    <h1>${title}</h1><div class="doc-meta"><div><span>Number:</span> <b>${esc(no)}</b></div>${meta.map(m => `<div><span>${m[0]}:</span> ${m[1]}</div>`).join('')}</div>${body}<div class="doc-sign"><div>Prepared by: <b>${esc((APP.S && APP.S.me && APP.S.me.name) || '')}</b></div><div class="muted-s">${dt(new Date().toISOString())}</div></div><div class="doc-foot">Thank you for your business · ${esc(B().business_name)} · ${esc(B().phone)}</div></div>`;
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
  /* ---------- Real PDF export (no external library): render the document to an image, then wrap it in a PDF ---------- */
  const A4W = 794, A4H = 1123, SCALE = 2;
  async function logoData() { try { const r = await fetch('assets/logo/AdamNokia_Primary_FullColor.svg'); const t = await r.text(); return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(t))); } catch (e) { return null; } }
  async function renderCanvas(html) {
    const css = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n').replace(/:root/g, '.pdfroot').replace(/@import[^;]+;/g, '');
    const host = document.createElement('div'); host.innerHTML = html; const logo = await logoData(); host.querySelectorAll('img').forEach(im => { if (logo) im.setAttribute('src', logo); });
    const wrap = document.createElement('div'); wrap.className = 'pdfroot'; wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); wrap.style.cssText = `width:${A4W}px;box-sizing:border-box;padding:28px;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif`; wrap.appendChild(host);
    const probe = wrap.cloneNode(true); probe.style.cssText += ';position:absolute;left:-9999px;top:0;visibility:hidden'; document.body.appendChild(probe); const H = Math.max(A4H, Math.ceil(probe.getBoundingClientRect().height) + 2); probe.remove();
    const xml = new XMLSerializer().serializeToString(wrap), svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A4W}" height="${H}"><foreignObject x="0" y="0" width="100%" height="100%"><style>${css.replace(/]]>/g, '')}</style>${xml}</foreignObject></svg>`;
    const img = new Image(); img.decoding = 'sync'; await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('Could not draw the document')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const cv = document.createElement('canvas'); cv.width = A4W * SCALE; cv.height = H * SCALE; const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.scale(SCALE, SCALE); cx.drawImage(img, 0, 0, A4W, H);
    try { cv.toDataURL('image/jpeg', .5); } catch (e) { throw new Error('This browser blocked the PDF export'); } return { cv, H };
  }
  function jpegBytes(cv, y, h) { const part = document.createElement('canvas'); part.width = cv.width; part.height = h * SCALE; const c = part.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, part.width, part.height); c.drawImage(cv, 0, y * SCALE, cv.width, h * SCALE, 0, 0, cv.width, h * SCALE); const b = atob(part.toDataURL('image/jpeg', .82).split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return { u, w: part.width, h: part.height }; }
  function makePdf(pages) {                       /* pages: [{u, w, h}] JPEG images, each on its own A4 page */
    const enc = new TextEncoder(), chunks = [], offs = []; let len = 0; const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const PW = 595.28, PH = 841.89, n = pages.length, obj = (id, body) => { offs[id] = len; put(id + ' 0 obj\n'); put(body); put('\nendobj\n'); };
    put('%PDF-1.4\n'); obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ')}] >>`);
    pages.forEach((pg, i) => { const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2, hh = PW * pg.h / pg.w, content = `q ${PW} 0 0 ${hh.toFixed(2)} 0 ${(PH - hh).toFixed(2)} cm /Im0 Do Q`;
      obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`); obj(cid, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      offs[iid] = len; put(`${iid} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.u.length} >>\nstream\n`); put(pg.u); put('\nendstream\nendobj\n'); });
    const total = 3 + n * 3, xref = len; put(`xref\n0 ${total}\n0000000000 65535 f \n`); for (let i = 1; i < total; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n'); put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out = new Uint8Array(len); let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; }); return out;
  }
  async function toPdf(html) {
    const { cv, H } = await renderCanvas(html), pages = []; for (let y = 0; y < H; y += A4H) pages.push(jpegBytes(cv, y, Math.min(A4H, H - y))); return makePdf(pages.slice(0, 12));
  }
  const safeName = t => String(t || 'document').replace(/[^A-Za-z0-9._ -]+/g, '-').replace(/\s+/g, '_').slice(0, 70);
  function b64(u) { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }
  /* Make the PDF, keep a private copy in Drive, then hand it to the phone's share sheet (WhatsApp appears there). Falls back to a download + text link. */
  async function sharePdf(o) {
    toast('Preparing PDF…');
    let bytes; try { bytes = await toPdf(o.html); } catch (e) { toast(e.message + '. Use Print / Save as PDF instead.', 'err'); if (o.wa) window.open('https://wa.me/' + (o.phone ? String(o.phone).replace(/\D/g, '') : '') + '?text=' + encodeURIComponent(o.wa), '_blank'); return; }
    const name = safeName(o.title) + '.pdf', file = new File([bytes], name, { type: 'application/pdf' });
    if (navigator.onLine && APP.api && o.save !== false) APP.api('docs.save', { name, kind: o.kind || 'DOCUMENT', pdf_base64: b64(bytes) }, undefined, { bg: true }).catch(() => { });   /* best effort: never blocks sharing */
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: o.title, text: (o.wa || '').split('\n').slice(0, 2).join(' · ') }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    const url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('PDF saved to this device. Open WhatsApp and attach it.'); if (o.phone || o.wa) setTimeout(() => window.open('https://wa.me/' + (o.phone ? String(o.phone).replace(/\D/g, '') : '') + '?text=' + encodeURIComponent((o.wa || '').split('\n')[0]), '_blank'), 600);
  }
  function print(html, title) {
    const pa = $('#printarea'), old = document.title; pa.innerHTML = html; document.body.classList.add('printing'); document.title = title || old;
    const done = () => { document.body.classList.remove('printing'); pa.innerHTML = ''; document.title = old; window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(() => window.print(), 80);
  }
  function show(o) {
    modal(`<div class="row mb"><button class="btn" id="dp">Print / Save as PDF</button><button class="btn wa" id="dw">Share on WhatsApp</button><button class="btn sec" data-close>Close</button></div>${o.note ? `<div class="notice info">${o.note}</div>` : ''}<div data-noi18n style="border:1px solid var(--line);border-radius:12px;padding:14px;background:#fff">${o.html}</div>`, d => {
      d.querySelector('#dp').onclick = () => print(o.html, o.title); d.querySelector('#dw').onclick = () => sharePdf(o);
    }, true);
  }
  APP.docs = { sale, recon, po, statement, print, show, sharePdf, toPdf };
})();
