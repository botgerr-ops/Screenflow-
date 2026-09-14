// Server time is anchored to a monotonic clock; workstation date changes do not
// extend a license. Player-side enforcement is implemented in the player itself.
let operationalData=null;
let operationalClock=0;
let operationalError='';
async function loadOperationalData(){
  try{
    const result=await request('/rest/v1/rpc/screenflow_operational_summary',{method:'POST',body:JSON.stringify({p_organization_id:isManager()?null:identity.organizationId})});
    if(!result?.server_time||!Number.isFinite(Date.parse(result.server_time)))throw Error('Ongeldige servertijd');
    operationalData=result;operationalClock=performance.now();operationalError='';
  }catch(e){operationalData=null;operationalError='Licentiecontrole en opslaggebruik konden niet worden opgehaald.'}
}
function licenseState(customer){
  if(!customer||customer.status!=='active')return {kind:'blocked',label:'Geblokkeerd',allowed:false};
  if(!operationalData)return {kind:'unknown',label:'Licentiedatum niet gecontroleerd',allowed:false};
  const now=new Date(Date.parse(operationalData.server_time)+Math.max(0,performance.now()-operationalClock));
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=t=>parts.find(p=>p.type===t).value;
  const today=Date.UTC(+part('year'),+part('month')-1,+part('day'));
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(customer.expiresAt));
  if(!match)return {kind:'unknown',label:'Einddatum ontbreekt',allowed:false};
  const end=Date.UTC(+match[1],+match[2]-1,+match[3]),days=Math.round((end-today)/86400000);
  if(days < -7)return {kind:'expired',label:'Verlopen · respijt voorbij',allowed:false,days};
  if(days < 0)return {kind:'grace',label:'Respijt · '+(8+days)+' dag(en) resterend',allowed:true,days};
  if(days===0)return {kind:'urgent',label:'Verloopt vandaag',allowed:true,days};
  if(days<=7)return {kind:'urgent',label:'Verloopt over '+days+' dag(en)',allowed:true,days};
  if(days<=14)return {kind:'warning',label:'Verloopt over '+days+' dagen',allowed:true,days};
  if(days<=30)return {kind:'notice',label:'Verloopt over '+days+' dagen',allowed:true,days};
  return {kind:'active',label:'Actief',allowed:true,days};
}
function licenseNotice(customer){
  const state=licenseState(customer);
  if(state.kind==='active')return '';
  return `<p class="license-notice ${state.kind}" role="status">${esc(state.label)}${['notice','warning','urgent'].includes(state.kind)?' · Neem tijdig contact op voor verlenging.':''}</p>`;
}
function storageUsageHtml(){
  if(!operationalData)return `<div class="storage-summary" role="status">${esc(operationalError||'Opslaggebruik wordt geladen…')}</div>`;
  return `<div class="storage-summary"><strong>Mediaopslag: ${fileSize(Number(operationalData.media_bytes||0))}</strong><span>${Number(operationalData.media_count||0)} geregistreerde bestanden · opslaglimiet nog niet ingesteld</span></div>`;
}
