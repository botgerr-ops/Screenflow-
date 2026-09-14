const {JSDOM}=require('jsdom');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM('<div id="app"></div>',{url:'https://screenflow.test',runScripts:'dangerously'}),w=dom.window;
const script=w.document.createElement('script');script.textContent=['content.js','recovery.js','operations.js','app.js'].map(f=>fs.readFileSync(path.join(__dirname,'../dist',f),'utf8')).join('\n');w.document.body.append(script);
w.eval(`operationalData={server_time:'2026-09-13T12:00:00Z',media_count:1001,media_bytes:5000};operationalClock=performance.now();`);
const state=date=>w.licenseState({status:'active',expiresAt:date});
assert.equal(state('2026-10-14').kind,'active');assert.equal(state('2026-10-13').kind,'notice');assert.equal(state('2026-09-27').kind,'warning');assert.equal(state('2026-09-20').kind,'urgent');assert.equal(state('2026-09-13').label,'Verloopt vandaag');assert.equal(state('2026-09-12').kind,'grace');assert.equal(state('2026-09-06').allowed,true);assert.equal(state('2026-09-05').allowed,false);
assert.equal(w.licenseState({status:'blocked',expiresAt:'2027-01-01'}).allowed,false);
// Amsterdam crosses into the next date while UTC is still on the previous day.
w.eval(`operationalData.server_time='2026-09-13T22:30:00Z';operationalClock=performance.now()`);assert.equal(state('2026-09-13').kind,'grace');
assert.match(w.storageUsageHtml(),/1001 geregistreerde/);
w.eval(`operationalData=null`);assert.equal(state('2027-01-01').allowed,false);assert.equal(state('2027-01-01').kind,'unknown');
// Dependency lookup must finish before asking permission; cancelled or failed checks never delete.
w.eval(`mediaItems=[{id:'m',name:'Test.png',storage_path:'a/test.png'}];window.calls=[];window.question='';request=async(path,options)=>{calls.push({path,options});return [{name:'Opening',uses:2}]};renderCustomerDashboard=()=>{};window.confirm=(question)=>{window.question=question;return false}`);
await w.deleteMedia('m');assert.match(w.question,/Opening \(2×\)/);assert.equal(w.calls.length,1);assert.match(w.calls[0].path,/screenflow_media_dependencies/);
w.eval(`window.calls=[];request=async(path)=>{calls.push(path);throw Error('offline')};window.confirm=()=>{throw Error('should not confirm')}`);await w.deleteMedia('m');assert.equal(w.calls.length,1);assert.match(w.eval('error'),/Verwijderen gestopt/);
dom.window.close();console.log('PASS: 30/14/7-day boundaries, 7-day grace, Amsterdam date, blocked and unknown deny, usage total, delete cancel and dependency failure.');
})().catch(e=>{console.error(e);process.exit(1)});
