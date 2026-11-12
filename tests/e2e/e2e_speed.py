import subprocess, time, json, urllib.request, sys
from playwright.sync_api import sync_playwright
BE = subprocess.Popen(['node','tests/e2e/fake_backend.js'], stdout=subprocess.PIPE, text=True)
WEB = subprocess.Popen(['python3','-m','http.server','8766','--directory','docs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
get = lambda p: urllib.request.urlopen('http://localhost:8767'+p).read().decode()
code = get('/__code'); res = {}
try:
  with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width':390,'height':800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/js/config.js', lambda r: r.fulfill(content_type='text/javascript', body="window.ANE_CONFIG={API_URL:'http://localhost:8767/'};"))
    pg.goto('http://localhost:8766/index.html'); pg.wait_for_selector('#u')
    pg.fill('#u','owner.test'); pg.fill('#p','Pass12345'); t=time.time(); pg.click('#go'); pg.wait_for_timeout(300)
    # NEEDS_SETUP path: first sign-in with no password set yet
    pg.wait_for_selector('#sc', timeout=15000); res['needs_setup_screen_s']=round(time.time()-t,1)
    pg.fill('#sc', code); pg.fill('#p','Pass12345'); pg.fill('#p2','Pass12345'); t=time.time(); pg.click('#go'); pg.wait_for_timeout(250)
    res['setup_btn_text_250ms']=pg.inner_text('#go'); res['setup_btn_disabled']=pg.is_disabled('#go'); res['setup_hint']=pg.inner_text('#hint')
    pg.wait_for_selector('.shell', timeout=30000); res['setup_to_dashboard_s']=round(time.time()-t,1)
    pg.wait_for_timeout(500); res['dashboard_text']=pg.inner_text('.top h1')
    log1 = json.loads(get('/__log')); res['requests_login_flow']=log1
    # tab switches: first visit may show skeleton; revisit must be instant
    def nav(r):
        t=time.time(); pg.evaluate(f"location.hash='#{r}'"); pg.wait_for_selector(f'.nav.on[href="#{r}"]', timeout=5000, state='attached'); return round((time.time()-t)*1000)
    pg.wait_for_timeout(9000)  # let the background warm-up finish
    res['warm_requests']=json.loads(get('/__log'))
    res['inventory_ms']=nav('inventory'); res['customers_ms']=nav('customers'); res['sales_ms']=nav('sales'); res['finance_ms']=nav('finance'); res['branches_ms']=nav('branches')
    pg.wait_for_timeout(300); res['sales_after_warm_has_content']= 'Loading' not in pg.inner_text('#page')
    pg.evaluate("location.hash='#sales'"); pg.wait_for_timeout(300); res['sales_page_loading_text']='Loading' in pg.inner_text('#page')
    get('/__log'); t=time.time()
    pg.evaluate("document.body.insertAdjacentHTML('beforeend','<button id=tb style=\"position:fixed;top:60px;left:10px;z-index:99999\">Save</button>'); window.__n=0;window.__ev=[];document.addEventListener('click',e=>window.__ev.push([e.target.id||e.target.tagName,e.isTrusted,Math.round(performance.now())]),true);document.getElementById('tb').onclick=()=>{window.__n++;window.__p=APP.act(async()=>APP.apiQ('stock.adjust',{product_id:'ANE-LCD-001',delta:1,reason:'speed test'}),'Saved')};0")
    pg.click('#tb'); pg.wait_for_timeout(250); res['save_btn_during']=pg.inner_text('#tb'); res['save_btn_disabled']=pg.is_disabled('#tb')
    pg.evaluate("window.__p"); res['save_total_s']=round(time.time()-t,1); res['requests_for_one_save']=json.loads(get('/__log'))
    res['toast']=pg.inner_text('#toasts'); res['clicks']=pg.evaluate('window.__n'); res['click_events']=pg.evaluate('window.__ev')
    res['page_errors']=errs; b.close()
finally:
  BE.terminate(); WEB.terminate()
print(json.dumps(res, indent=1))
