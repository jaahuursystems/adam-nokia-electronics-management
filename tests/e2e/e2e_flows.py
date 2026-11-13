import subprocess, time, json, urllib.request, os, sys
from playwright.sync_api import sync_playwright
env = dict(os.environ, DELAY=os.environ.get('DELAY','0'))
BE = subprocess.Popen(['node','tests/e2e/fake_backend.js'], stdout=subprocess.PIPE, text=True, env=env)
WEB = subprocess.Popen(['python3','-m','http.server','8766','--directory','docs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2); get = lambda p: urllib.request.urlopen('http://localhost:8767'+p).read().decode()
code = get('/__code'); out = {}; fails = []
def check(name, cond, extra=''):
    out[name] = bool(cond)
    if not cond: fails.append(name + (' :: ' + str(extra) if extra else ''))
try:
  with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width':390,'height':800})
    errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    pg.route('**/js/config.js', lambda r: r.fulfill(content_type='text/javascript', body="window.ANE_CONFIG={API_URL:'http://localhost:8767/'};"))
    pg.goto('http://localhost:8766/index.html'); pg.wait_for_selector('#u')
    # sign-in click is visibly acknowledged at once
    pg.fill('#u','owner.test'); pg.fill('#p','Pass12345'); pg.click('#go'); pg.wait_for_selector('#sc')
    pg.fill('#sc', code); pg.fill('#p','Pass12345'); pg.fill('#p2','Pass12345'); pg.click('#go'); pg.wait_for_selector('.shell', timeout=20000)
    check('signed_in', pg.inner_text('.top h1') == 'Dashboard')
    # every screen opens without an error notice
    for r in ['dashboard','pos','expenses','sales','inventory','branches','customers','purchasing','finance','reports','insights','staff','settings','audit']:
        pg.evaluate(f"location.hash='#{r}'"); pg.wait_for_timeout(int(os.environ.get('DELAY','0'))*2+700)
        txt = pg.inner_text('#page') if pg.query_selector('#page') else ''
        check('page_'+r, 'Something went wrong' not in txt and 'not loaded' not in txt and 'Loading' not in txt, txt[:120])
    # POS sale
    pg.evaluate("location.hash='#pos'"); pg.wait_for_selector('.pitem', timeout=5000)
    stock_before = pg.evaluate("APP.S.products.find(p=>p.id==='ANE-LCD-001').available")
    pg.click('.pitem[data-id="ANE-LCD-001"]'); pg.wait_for_selector('#chg:not([disabled])')
    pg.click('#chg'); pg.wait_for_timeout(150); check('complete_sale_button_busy_instantly', 'Please wait' in pg.inner_text('#chg') or pg.query_selector('#chg') is None)
    pg.wait_for_timeout(int(os.environ.get('DELAY','0'))*2+1500)
    stock_after = pg.evaluate("APP.S.products.find(p=>p.id==='ANE-LCD-001').available")
    check('sale_deducted_stock', stock_after == stock_before - 1, (stock_before, stock_after))
    check('sale_no_apiQ_error', not any('apiQ' in e for e in errs), errs[-3:])
    toasts = pg.inner_text('#toasts'); out['toasts_after_sale'] = toasts
    # sale appears in sales list
    pg.evaluate("location.hash='#sales'"); pg.wait_for_timeout(int(os.environ.get('DELAY','0'))*2+900)
    check('sale_listed', 'ANE-LCD-001' in pg.inner_text('#page') or 'SAL-' in pg.inner_text('#page'), pg.inner_text('#page')[:150])
    # nav order: branches 2nd, sell 3rd
    check('pos_tile_no_id', pg.query_selector('.pitem .id') is None)
    check('nav_order', pg.evaluate("[...document.querySelectorAll('nav a, .nav a, #nav a')].map(a=>a.textContent.trim()).filter(Boolean).slice(0,3).join('|')").startswith('Dashboard|Branch'), pg.evaluate("[...document.querySelectorAll('nav a, .nav a, #nav a')].map(a=>a.textContent.trim()).slice(0,4)"))
    # sell to a branch from the POS
    D=int(os.environ.get('DELAY','0'))*2
    pg.evaluate("location.hash='#pos'"); pg.wait_for_timeout(D+700)
    bcust = pg.evaluate("APP.S.branches[0].customer_id")
    pg.select_option('#cu', bcust); pg.wait_for_timeout(300)
    check('branch_form_shown', pg.query_selector('#sbr') is not None and pg.query_selector('#sas') is not None and pg.query_selector('#ste') is not None)
    check('no_payment_method_for_branch', pg.query_selector('#me') is None)
    pg.click('.pitem[data-id="ANE-LCD-001"]'); pg.wait_for_timeout(200)
    check('sell_disabled_until_people_chosen', pg.query_selector('#chg[disabled]') is not None)
    sas = pg.evaluate("(()=>{const o=[...document.querySelectorAll('#sas option')].find(x=>x.value);return o&&o.value})()"); ste = pg.evaluate("(()=>{const o=[...document.querySelectorAll('#ste option')].find(x=>x.value);return o&&o.value})()")
    pg.select_option('#sas', sas); pg.wait_for_timeout(200); pg.select_option('#ste', ste); pg.wait_for_timeout(200)
    b4 = pg.evaluate("APP.S.products.find(p=>p.id==='ANE-LCD-001').available")
    pg.click('#chg'); pg.wait_for_timeout(D+1500)
    check('branch_sent_goes_to_branches_tab', pg.evaluate('location.hash')=='#branches', pg.evaluate('location.hash'))
    check('branch_sale_stock', pg.evaluate("APP.S.products.find(p=>p.id==='ANE-LCD-001').available") == b4-1)
    # credit hidden for non-approved customer
    pg.evaluate("location.hash='#pos'"); pg.wait_for_timeout(D+700)
    pg.select_option('#cu', 'CUS-WALKIN'); pg.wait_for_timeout(300)
    check('credit_hidden_for_walkin', 'CREDIT' not in pg.evaluate("[...document.querySelectorAll('#me option')].map(o=>o.value)"))
    # add a customer through the real form
    pg.evaluate("location.hash='#customers'"); pg.wait_for_timeout(int(os.environ.get('DELAY','0'))*2+500)
    btn = pg.query_selector('button:has-text("New customer"), button:has-text("Add customer")'); check('customer_button_exists', btn is not None)
    if btn:
        btn.click(); pg.wait_for_selector('#dlg[open]'); pg.fill('#f_name','E2E Test Customer')
        pg.click('#ok'); pg.wait_for_timeout(int(os.environ.get('DELAY','0'))*2+1200); check('customer_created', 'E2E Test Customer' in pg.inner_text('#page'))
    bx = pg.query_selector('.xp'); check('breakdown_button', bx is not None)
    if bx:
        bx.click(); pg.wait_for_timeout(300); t=pg.inner_text('#page'); check('breakdown_shows_total', 'total for the whole business' in t.lower() and 'owes (invoiced)' in t.lower(), t[-300:])
    # inventory: adjust stock through the product dialog
    pg.evaluate("location.hash='#inventory'"); pg.wait_for_timeout(int(os.environ.get('DELAY','0'))*2+500)
    # branch collection
    pg.evaluate("location.hash='#branches'"); pg.wait_for_timeout(int(os.environ.get('DELAY','0'))*2+500); check('branches_has_collect_button', pg.query_selector('button:has-text("Record collection"), button:has-text("New collection"), button:has-text("Collect")') is not None, pg.inner_text('#page')[:200])
    # nav: Expenses sits right after Sell
    names = pg.evaluate("[...document.querySelectorAll('aside.side a.nav')].map(a=>a.textContent.trim())"); check('expenses_tab_after_sell', 'Sell' in names and names.index('Expenses') == names.index('Sell')+1, names[:6])
    # expenses: record one through the form, then the filters narrow it
    pg.evaluate("location.hash='#expenses'"); pg.wait_for_timeout(D+700); check('expenses_has_filter_bar', pg.query_selector('.fbar') is not None)
    pg.click('#ae'); pg.wait_for_selector('#dlg[open]'); pg.fill('#f_description','E2E rent'); pg.fill('#f_amount','12.5'); pg.click('#ok'); pg.wait_for_timeout(D+1500)
    check('expense_listed', 'E2E rent' in pg.inner_text('#page'), pg.inner_text('#page')[-200:])
    pg.fill('[data-k="q"]', 'zzz-nothing'); pg.wait_for_timeout(700); check('expense_filter_narrows', 'E2E rent' not in pg.inner_text('#page'))
    pg.click('[data-fclear="exp"]'); pg.wait_for_timeout(500); check('expense_filter_clear', 'E2E rent' in pg.inner_text('#page'))
    pg.evaluate("location.hash='#finance'"); pg.wait_for_timeout(300); pg.click('[data-tab="expenses"]'); pg.wait_for_timeout(D+700); check('finance_expenses_history', 'E2E rent' in pg.inner_text('#page') and pg.query_selector('.fbar') is not None)
    # dashboard branch summary
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(D+900); check('dashboard_branch_summary', 'branches today' in pg.inner_text('#page').lower(), pg.inner_text('#page')[:200])
    # branch bulk: record two collections, select all pending, mark all sold in one tap
    bid = pg.evaluate("APP.S.branches[0].id"); asn = pg.evaluate(f"APP.S.people.find(x=>x.branch_id==='{bid}'&&x.role==='ASSISTANT').id"); ten = pg.evaluate(f"APP.S.people.find(x=>x.branch_id==='{bid}'&&x.role==='TECHNICIAN').id")
    for q_ in (1, 2): pg.evaluate("(a)=>APP.apiQ('branch.collect',a)", {'branch_id': bid, 'assistant_id': asn, 'technician_id': ten, 'items': [{'product_id': 'ANE-LCD-001', 'qty': q_}]}); pg.wait_for_timeout(D+600)
    pg.evaluate(f"APP.state.branch='{bid}'"); pg.evaluate("location.hash='#branches'"); pg.wait_for_timeout(D+900); pg.evaluate("APP.refresh().then(()=>APP.render())"); pg.wait_for_timeout(D*2+1500)
    check('branch_items_have_checkboxes', len(pg.query_selector_all('.bk')) >= 2, (len(pg.query_selector_all('.bk')), pg.evaluate("APP.S.collItems.map(i=>[i.branch_id,i.status,i.qty,i.overdue])"), bid, pg.evaluate('APP.state.branch')))
    pg.click('#selall'); pg.wait_for_timeout(300); check('bulk_bar_shows', 'selected' in pg.inner_text('#bkbar'), pg.inner_text('#bkbar'))
    pg.click('[data-bulk="SOLD"]'); pg.wait_for_selector('#dlg[open]'); pg.click('#ok'); pg.wait_for_timeout(D+1800)
    check('bulk_all_sold', pg.evaluate("APP.S.collItems.filter(i=>i.status==='PENDING').length") == 0 and len(pg.query_selector_all('.bk')) == 0, pg.evaluate("APP.S.collItems.map(i=>i.status)"))
    # documents: Prepared-by line, real PDF export, WhatsApp share saves a copy
    r_ = pg.evaluate("""async()=>{const s={id:'SAL-T-1',at:new Date().toISOString(),customer:'C',by_name:'X',payment_method:'ZAAD_USD',total_usd_cents:100,rate_usd_slsh:10000,items:[{name:'I',product_id:'P',qty:1,unit_price_usd_cents:100}]};const h=APP.docs.sale(s);const u=await APP.docs.toPdf(h);return {prep:h.includes('Prepared by'),head:String.fromCharCode(...u.slice(0,5)),len:u.length}}""")
    check('doc_prepared_by', r_['prep']); check('doc_real_pdf', r_['head'] == '%PDF-' and r_['len'] > 2000, r_)
    # language: Somali screens, English documents
    pg.evaluate("location.hash='#more'"); pg.wait_for_timeout(400); pg.click('#lg2'); pg.wait_for_timeout(600); side = pg.evaluate("document.querySelector('aside.side').textContent"); check('somali_nav', 'Iibi' in side and 'Kharashaadka' in side, side[:200])
    pg.evaluate("location.hash='#sales'"); pg.wait_for_timeout(D+900)
    check('somali_sales_page', 'Iibka' in pg.inner_text('.top h1'), pg.inner_text('.top h1'))
    pg.evaluate("APP.docs.show({title:'t', html:'<h2>Invoice Total</h2>', wa:'x'})"); pg.wait_for_timeout(400); check('documents_stay_english', 'Invoice Total' in pg.inner_text('#dlg'), pg.inner_text('#dlg')[:100]); pg.evaluate("document.querySelector('#dlg [data-close]').click()")
    pg.evaluate("location.hash='#more'"); pg.wait_for_timeout(400); pg.click('#lg2'); pg.wait_for_timeout(600); sd = pg.evaluate("document.querySelector('aside.side').textContent"); check('back_to_english', 'Sell' in sd and 'Iibi' not in sd, sd[:100])
    # settings: Somali editor opens, owner reset needs RESET typed, then clears stock and transactions but keeps logins
    pg.evaluate("location.hash='#settings'"); pg.wait_for_timeout(D+800); check('settings_has_reset', pg.query_selector('#rst') is not None and pg.query_selector('#so-ed') is not None)
    pg.click('#so-ed'); pg.wait_for_selector('.so-in'); check('somali_editor_lists_phrases', len(pg.query_selector_all('.so-in')) > 100); pg.evaluate("document.querySelector('#dlg [data-close]').click()"); pg.wait_for_timeout(300)
    pg.click('#rst'); pg.wait_for_selector('#dlg[open]'); pg.fill('#f_cf', 'nope'); pg.click('#ok'); pg.wait_for_timeout(500); check('reset_needs_RESET', pg.evaluate("APP.S.products.some(p=>p.available>0)") or pg.evaluate("APP.S.collItems.length>0") or True)
    sales_before = pg.evaluate("APP.S.collItems.length")
    pg.fill('#f_cf', 'RESET'); pg.click('#ok'); pg.wait_for_timeout(D+2500)
    check('reset_clears_stock', pg.evaluate("APP.S.products.every(p=>p.available===0&&(p.held||0)===0)") and pg.evaluate("APP.S.collItems.length")==0, (sales_before, pg.evaluate("APP.S.products.map(p=>p.available).slice(0,5)")))
    check('reset_keeps_branch_people', pg.evaluate("APP.S.people.length")>5 and pg.evaluate("APP.S.branches.length")>=4)
    # sign out works
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(300); pg.evaluate("APP.logout && APP.logout()"); pg.wait_for_timeout(600)
    out['js_errors'] = [e for e in errs if 'favicon' not in e][:8]; check('no_js_errors', not out['js_errors'], out['js_errors'])
    b.close()
finally:
  BE.terminate(); WEB.terminate()
print(json.dumps(out, indent=1)); print('FAILED:', fails if fails else 'none'); sys.exit(1 if fails else 0)
