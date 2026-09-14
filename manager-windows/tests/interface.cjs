const {JSDOM}=require('jsdom');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM('<div id="app"></div>',{url:'https://screenflow.test',runScripts:'dangerously'});const w=dom.window;
const script=w.document.createElement('script');script.textContent=['content.js','recovery.js','operations.js','app.js'].map(f=>fs.readFileSync(path.join(__dirname,'../dist',f),'utf8')).join('\n');w.document.body.append(script);
const el=id=>w.document.getElementById(id),count=s=>w.document.querySelectorAll(s).length;
assert.match(w.document.body.textContent,/NARROWVISION ADMIN/);assert.equal(count('.brandmark svg'),1);
el('forgot-password').click();
w.eval(`window.calls=[];recoveryRequest=async(path,body,token)=>{calls.push({path,body,token});if(path.endsWith('/verify')){if(body.token==='000000')throw Error('expired token');return {access_token:'recovery-only',user:{app_metadata:{role:'customer_admin'}}}}return {}}`);
const submit=()=>el('recovery-form').onsubmit({preventDefault(){}});
el('recovery-email').value='test@example.com';await submit();el('recovery-code').value='000000';await submit();assert.match(el('recovery-error').textContent,/onjuist of verlopen/);
el('recovery-code').value='123456';await submit();assert.equal(w.localStorage.getItem('screenflow_manager_session'),null);
el('recovery-password').value='Twelve-test-123';el('recovery-repeat').value='different';await submit();assert.match(el('recovery-error').textContent,/hetzelfde/);
el('recovery-repeat').value='Twelve-test-123';await submit();assert.ok(el('login-form'));assert.equal(w.calls.find(c=>c.path==='/auth/v1/user').token,'recovery-only');assert.equal(w.calls.find(c=>c.path==='/auth/v1/verify').body.type,'recovery');
w.eval(`identity={role:'manager',name:'Manager'};session={user:{email:'manager@example.com'}};customers=[{id:'a',name:'Voorbeeld BV',customerNumber:'SF-1',contactName:'Testpersoon',email:'test@example.com',status:'active',playerLimit:2,playersUsed:2,expiresAt:'2027-01-01',street:'Voorbeeldstraat',houseNumber:'1',postalCode:'1234AB',city:'Teststad',country:'Nederland'}];players=[{id:'p',name:'Online',organizationId:'a',version:'0.3.0',firmware:'Build 123',latestVersion:'0.3.1',lastSeen:new Date().toISOString()},{id:'q',name:'Offline',organizationId:'a',version:'0.3.0',firmware:'Niet gemeld',lastSeen:null}];supportRequests=[{id:'1',organization_id:'a',ticket_number:'SFT-1',subject:'Beeld',description:'Geen beeld',priority:'normal',status:'resolved',created_at:'2026-09-13',support_request_messages:[]},{id:'2',organization_id:'a',ticket_number:'SFT-2',subject:'Oud probleem',description:'Probleem',priority:'normal',status:'resolved',archived_at:'2026-09-13',created_at:'2026-09-13',support_request_messages:[{sender_role:'manager',message:'Adapter verwisseld',created_at:'2026-09-13'}]}];activePage='overview';renderDashboard()`);
assert.equal(count('.stats'),1);
w.eval(`activePage='customers';renderDashboard()`);assert.equal(count('.stats'),0);
w.eval(`selectedCustomerId='a';activePage='customer';renderDashboard()`);assert.match(w.document.body.textContent,/1 online · 1 offline/);assert.match(w.document.body.textContent,/Beschikbaar: 0.3.1/);
w.eval(`activePage='requests';renderDashboard()`);assert.equal(count('.stats'),0);assert.equal(count('.request-card'),1);
w.document.querySelector('[data-ticket-folder="archive"]').click();el('ticket-search').value='Adapter';el('ticket-search').oninput();assert.equal(count('.request-card'),1);assert.equal(count('[data-reply-request]'),0);
w.eval(`identity={role:'customer_admin',organizationId:'a',name:'Test'};customerPage='requests';requestFolder='open';ticketQuery='';renderCustomerDashboard()`);assert.equal(count('[data-confirm-ticket]'),1);
w.document.querySelector('[data-ticket-folder="archive"]').click();assert.equal(count('[data-confirm-ticket]'),0);assert.equal(count('[data-customer-reply]'),0);
// Cancelling a pending code verification must not leave a recovery session.
w.eval(`exitRecovery();renderRecovery('code');recoveryRequest=()=>new Promise(resolve=>window.finishVerification=resolve)`);el('recovery-code').value='123456';const pending=submit();el('recovery-back').click();w.finishVerification({access_token:'late'});await pending;assert.equal(w.eval('recoverySession'),null);assert.ok(el('login-form'));
dom.window.close();console.log('PASS: NarrowVision branding, manager layout, archive search, customer confirmation, recovery invalid code/mismatch, isolated session and cancellation.');
})().catch(e=>{console.error(e);process.exit(1)});
