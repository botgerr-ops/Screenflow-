const SUPABASE_URL = "https://eckmifmgrurxgriimgpp.supabase.co";
const SUPABASE_KEY = "sb_publishable_g0ktlqb7mJcLzkCysi7GCw_55uB5lmQ";
const STORAGE_KEY = "screenflow_manager_session";

const app = document.getElementById("app");
let session = loadSession();
let customers = [];
let players = [];
let supportRequests = [];
let error = "";
let query = "";
let activePage = "overview";
let selectedCustomerId = "";
let customerPage = "overview";
let identity = null;
let notificationTimer = null;

function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
}
function saveSession(value) {
  session = value;
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  else localStorage.removeItem(STORAGE_KEY);
}
function esc(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function logo() { return '<span class="brandmark"><i></i><i></i></span>'; }
function apiHeaders(json=false) {
  const h = { apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}
async function nativeRequest(path, options={}) {
  const method=options.method||"GET";
  const body=options.body ? JSON.parse(options.body) : null;
  const prefer=options.headers?.Prefer||null;
  if(window.__TAURI__?.core?.invoke) {
    return window.__TAURI__.core.invoke("supabase_request",{method,path,body,token:session?.access_token||null,prefer});
  }
  const response=await fetch(SUPABASE_URL+path,{...options,headers:{...apiHeaders(Boolean(options.body)),...(options.headers||{})}});
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(data?.message||data?.error_description||`Fout ${response.status}`);
  return data;
}
async function request(path, options={}) {
  try { return await nativeRequest(path,options); }
  catch(e) {
    if(session?.refresh_token && /401|jwt|token|unauthorized/i.test(String(e))) {
      const old=session; session=null;
      const refreshed=await nativeRequest("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:old.refresh_token})});
      saveSession(refreshed); return nativeRequest(path,options);
    }
    throw e;
  }
}

async function resolveIdentity() {
  const metadata=session?.user?.app_metadata||{};
  const role=String(metadata.role||"").toLowerCase();
  if(role==="customer_admin") {
    identity={
      role,
      organizationId:String(metadata.organization_id||""),
      forcePasswordChange:metadata.force_password_change===true,
      name:session?.user?.user_metadata?.full_name||session?.user?.email||"Klant"
    };
    if(!identity.organizationId) throw new Error("Dit klantaccount is nog niet aan een organisatie gekoppeld.");
    return;
  }
  const manager=await request("/rest/v1/rpc/is_manager",{method:"POST",body:"{}"});
  if(manager!==true) throw new Error("Dit account heeft geen toegang tot ScreenFlow Admin.");
  let profile=null;
  try { profile=await request("/rest/v1/rpc/current_screenflow_identity",{method:"POST",body:"{}"}); } catch {}
  identity={role:"manager",organizationId:"",forcePasswordChange:false,name:profile?.full_name||session?.user?.user_metadata?.full_name||session?.user?.email?.split("@")[0]||"Manager"};
}
function isManager(){return identity?.role==="manager"}
async function bootAuthenticated(){
  try {
    await resolveIdentity();
    if(identity.forcePasswordChange){renderPasswordChange();return}
    await Promise.all([loadCustomers(),loadPlayers(),loadSupportRequests()]);
    startNotificationPolling();
    renderDashboard();
  } catch(e) {
    saveSession(null);
    identity=null;
    error=typeof e==="string"?e:(e?.message||String(e));
    renderLogin();
  }
}
function renderPasswordChange(){
  app.innerHTML=`<main class="login-screen"><form class="login-card password-card" id="password-change-form">${logo()}<p class="eyebrow">EERSTE AANMELDING</p><h1>Kies je eigen wachtwoord.</h1><p>Het tijdelijke wachtwoord moet eerst worden vervangen. ScreenFlow en de Manager kunnen je nieuwe wachtwoord daarna niet bekijken.</p><label>Nieuw wachtwoord<input id="new-password" autocomplete="new-password" type="password" minlength="12" required></label><label>Herhaal wachtwoord<input id="repeat-password" autocomplete="new-password" type="password" minlength="12" required></label><small class="password-hint">Minimaal 12 tekens. Gebruik bij voorkeur woorden, cijfers en een teken.</small><p class="login-error ${error?"":"hidden"}">${esc(error)}</p><button class="primary" id="password-change-button">Wachtwoord opslaan</button><button class="text-button" type="button" id="password-logout">Uitloggen</button></form></main>`;
  document.getElementById("password-change-form").onsubmit=changeFirstPassword;
  document.getElementById("password-logout").onclick=()=>{saveSession(null);identity=null;error="";renderLogin()};
}
async function changeFirstPassword(event){
  event.preventDefault();error="";
  const password=document.getElementById("new-password").value;
  const repeated=document.getElementById("repeat-password").value;
  if(password.length<12){error="Gebruik minimaal 12 tekens.";renderPasswordChange();return}
  if(password!==repeated){error="De wachtwoorden zijn niet hetzelfde.";renderPasswordChange();return}
  const button=document.getElementById("password-change-button");button.disabled=true;button.textContent="Opslaan…";
  try {
    await request("/auth/v1/user",{method:"PUT",body:JSON.stringify({password})});
    await request("/functions/v1/manager-customer-admin",{method:"POST",body:JSON.stringify({action:"complete_password_change"})});
    session.user.app_metadata={...(session.user.app_metadata||{}),force_password_change:false};
    saveSession(session);
    identity.forcePasswordChange=false;
    await Promise.all([loadCustomers(),loadPlayers(),loadSupportRequests()]);
    renderDashboard();
  } catch(e) {
    error="Wachtwoord wijzigen mislukt: "+(typeof e==="string"?e:(e?.message||e));
    renderPasswordChange();
  }
}

function renderLogin() {
  app.innerHTML = `<main class="login-screen"><form class="login-card" id="login-form">${logo()}<p class="eyebrow">SCREENFLOW ADMIN</p><h1>Welkom terug.</h1><p>Log in met jouw beveiligde ScreenFlow-account.</p><label>E-mailadres<input id="email" autocomplete="email" type="email" required></label><label>Wachtwoord<input id="password" autocomplete="current-password" type="password" required></label><p class="login-error ${error?'':'hidden'}">${esc(error)}</p><button class="primary" id="login-button">Inloggen</button></form></main>`;
  document.getElementById("login-form").onsubmit = login;
}
async function login(event) {
  event.preventDefault(); error="";
  const button=document.getElementById("login-button"); button.disabled=true; button.textContent="Inloggen…";
  try {
    const data=await nativeRequest("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value})});
    saveSession(data); await bootAuthenticated();
  } catch(e) {
    const message=typeof e==="string" ? e : String(e?.message||e||"Onbekende fout");
    if(/invalid login credentials/i.test(message)) error="E-mailadres of wachtwoord is niet juist.";
    else if(/email not confirmed/i.test(message)) error="Je e-mailadres is nog niet bevestigd in Supabase.";
    else if(/failed to fetch|network/i.test(message)) error="Geen verbinding met Supabase. Controleer internet of firewall.";
    else error="Supabase: "+message;
    renderLogin();
  }
}
async function loadCustomers() {
  try {
    const select=encodeURIComponent("id,name,customer_number,contact_name,contact_email,address_street,address_house_number,address_postal_code,address_city,address_country,created_at,licenses(id,status,player_limit,valid_until),devices(id)");
    const scope=isManager()?"":`&id=eq.${encodeURIComponent(identity.organizationId)}`;
    const rows=await request(`/rest/v1/organizations?select=${select}&order=created_at.desc${scope}`);
    customers=(rows||[]).map(o=>{const l=Array.isArray(o.licenses)?o.licenses[0]:o.licenses;return{id:o.id,licenseId:l?.id||"",customerNumber:o.customer_number||"",name:o.name,contactName:o.contact_name||"",email:o.contact_email||"",street:o.address_street||"",houseNumber:o.address_house_number||"",postalCode:o.address_postal_code||"",city:o.address_city||"",country:o.address_country||"Nederland",status:l?.status||"blocked",playerLimit:l?.player_limit||0,playersUsed:o.devices?.length||0,expiresAt:l?.valid_until||new Date().toISOString().slice(0,10)}});
    error="";
  } catch(e) { error="Kon de gegevens niet laden: "+(typeof e==="string"?e:(e?.message||e)); customers=[]; }
}

async function loadPlayers() {
  try {
    const scope=isManager()?"":`&organization_id=eq.${encodeURIComponent(identity.organizationId)}`;
    const rows=await request(`/rest/v1/devices?select=*${scope}`);
    players=(rows||[]).map(d=>({
      id:d.id, name:d.name||d.device_name||"Naamloze player",
      platform:d.platform||"Android", version:d.app_version||"—",
      organizationId:d.organization_id||"", code:d.pairing_code||"",
      lastSeen:d.last_seen_at||d.updated_at||d.created_at||null,
      pendingCommand:d.pending_command||""
    }));
  } catch(e) { players=[]; }
}
async function loadSupportRequests(){
  try {
    const scope=isManager()?"":`&organization_id=eq.${encodeURIComponent(identity.organizationId)}`;
    const select=encodeURIComponent("*,support_request_messages(*)");
    const rows=await request(`/rest/v1/support_requests?select=${select}&order=created_at.desc${scope}`);
    supportRequests=(rows||[]).map(r=>({...r,support_request_messages:[...(r.support_request_messages||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))}));
    updateRequestBadge();
  } catch(e) { supportRequests=[]; }
}
function greeting(){
  const hour=new Date().getHours();
  return hour>=5&&hour<12?"Goedemorgen":hour>=12&&hour<18?"Goedemiddag":"Goedenavond";
}
function requestStatusLabel(value){return({new:"Nieuw",in_progress:"In behandeling",waiting_customer:"Wacht op klant",resolved:"Afgerond"})[value]||value}
function priorityLabel(value){return({low:"Laag",normal:"Normaal",high:"Hoog",urgent:"Spoed"})[value]||value}
function online(p){return p.lastSeen&&Date.now()-new Date(p.lastSeen).getTime()<90000}

function fmt(date) { if(!date)return "Nog nooit"; try { const value=String(date).includes("T")?date:date+"T12:00:00"; return new Intl.DateTimeFormat("nl-NL",{day:"numeric",month:"short",year:"numeric",hour:String(date).includes("T")?"2-digit":undefined,minute:String(date).includes("T")?"2-digit":undefined}).format(new Date(value)); } catch { return date; } }
function dateForInput(date) {
  const match=String(date||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}
function dateToIso(value) {
  const match=String(value||"").trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if(!match) return null;
  const day=Number(match[1]), month=Number(match[2]), year=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day) return null;
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function unreadManagerCount(){
  return supportRequests.reduce((count,r)=>count+(r.manager_viewed_at?0:1)+(r.support_request_messages||[]).filter(m=>m.sender_role==="customer"&&!m.manager_viewed_at).length,0);
}
function nav(page,icon,label,badge=0){
  return `<button data-page="${page}" class="${activePage===page?"active":""}"><span>${icon} ${label}</span><b class="nav-badge ${badge?"":"hidden"}">${badge>99?"99+":badge}</b></button>`;
}
function updateRequestBadge(){
  if(!isManager())return;
  const badge=document.querySelector('[data-page="requests"] .nav-badge');
  if(!badge)return;
  const count=unreadManagerCount();
  badge.textContent=count>99?"99+":String(count);
  badge.classList.toggle("hidden",count===0);
}
async function markManagerRequestsViewed(){
  try{
    await request("/rest/v1/rpc/manager_mark_requests_viewed",{method:"POST",body:"{}"});
    supportRequests=supportRequests.map(r=>({...r,manager_viewed_at:r.manager_viewed_at||new Date().toISOString(),support_request_messages:(r.support_request_messages||[]).map(m=>m.sender_role==="customer"?{...m,manager_viewed_at:m.manager_viewed_at||new Date().toISOString()}:m)}));
  }catch(e){
    error="Meldingen openen mislukt: "+(typeof e==="string"?e:(e?.message||String(e)));
  }
}
function stopNotificationPolling(){
  if(notificationTimer){clearInterval(notificationTimer);notificationTimer=null}
}
function startNotificationPolling(){
  stopNotificationPolling();
  if(!isManager())return;
  notificationTimer=setInterval(async()=>{
    if(!session||!isManager())return;
    await loadSupportRequests();
  },30000);
}
function renderDashboard() {
  if(!isManager()){renderCustomerDashboard();return}
  const shown=customers.filter(c=>(c.name+c.contactName+c.email).toLowerCase().includes(query.toLowerCase()));
  const active=customers.filter(c=>c.status==="active").length, licenses=customers.reduce((n,c)=>n+c.playerLimit,0), used=players.filter(p=>p.organizationId).length;
  const selected=customers.find(c=>c.id===selectedCustomerId);
  const title=activePage==="customer"?(selected?.name||"Klant"):activePage==="requests"?"Verzoeken":activePage==="customers"?"Klanten":`${greeting()}, ${identity.name}.`;
  const subtitle=activePage==="customer"?"Klantgegevens, licentie, account, players en verzoeken.":activePage==="requests"?"Alle openstaande klantvragen vanuit één plek.":"Beheer klanten en playerlicenties vanuit één plek.";
  const action=activePage==="customer"?'<button class="small-action back-button" id="back-customers">← Terug naar klanten</button>':activePage==="requests"?"":'<button class="primary" id="new-customer">＋ Nieuwe klant</button>';
  app.innerHTML=`<main class="app-shell"><aside class="sidebar"><div class="brand">${logo()}<span>SCREENFLOW<small>ADMIN</small></span></div><nav>${nav("overview","▦","Overzicht")}${nav("customers","▣","Klanten")}${nav("requests","✉","Verzoeken",unreadManagerCount())}</nav><button class="logout" id="logout">↪ Uitloggen</button><div class="side-foot"><span class="shield">✓</span><div><strong>Manageraccount</strong><span>${esc(session?.user?.email||"")}</span></div></div></aside><section class="workspace"><header><div><p class="eyebrow">SCREENFLOW ADMIN</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</header><div class="stats"><article class="lime-card"><span class="stat-icon">▣</span><div><small>Actieve klanten</small><strong>${active}</strong><em>${customers.length-active} niet actief</em></div></article><article><span class="stat-icon">⌁</span><div><small>Uitgegeven licenties</small><strong>${licenses}</strong><em>${Math.max(0,licenses-used)} beschikbaar</em></div></article><article><span class="stat-icon">▰</span><div><small>Gekoppelde players</small><strong>${used}</strong><em>${players.filter(online).length} online</em></div></article></div>${error?`<p class="error-banner">${esc(error)}</p>`:""}${activePage==="customer"?customerDetailPanel(selected):activePage==="requests"?requestsPanel():customersPanel(shown)}</section></main><div id="modal-root"></div>`;
  document.getElementById("logout").onclick=()=>{stopNotificationPolling();saveSession(null);identity=null;customers=[];players=[];supportRequests=[];renderLogin()};
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=async()=>{activePage=b.dataset.page;query="";error="";if(activePage==="requests")await markManagerRequestsViewed();renderDashboard()});
  document.getElementById("new-customer")?.addEventListener("click",renderModal);
  document.getElementById("back-customers")?.addEventListener("click",()=>{activePage="customers";selectedCustomerId="";error="";renderDashboard()});
  document.querySelectorAll("[data-open-customer]").forEach(row=>row.onclick=e=>{if(e.target.closest("button,input"))return;selectedCustomerId=row.dataset.openCustomer;activePage="customer";error="";renderDashboard()});
  document.getElementById("customer-admin-access")?.addEventListener("click",()=>selected&&renderAdminAccessModal(selected));
  document.getElementById("edit-customer")?.addEventListener("click",()=>selected&&renderEditCustomerModal(selected));
  document.querySelectorAll("[data-request-status]").forEach(select=>select.onchange=()=>updateRequestStatus(select.dataset.requestStatus,select.value));
  document.querySelectorAll("[data-reply-request]").forEach(button=>button.onclick=()=>renderManagerReplyModal(button.dataset.replyRequest));
  const search=document.getElementById("search"); if(search) search.oninput=e=>{query=e.target.value;renderDashboard();document.getElementById("search")?.focus()};
  document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>updateLicense(b.dataset.id,{status:b.dataset.status==="active"?"blocked":"active"}));
  document.querySelectorAll("[data-save-date]").forEach(b=>b.onclick=()=>saveLicenseDate(b.dataset.saveDate));
  document.querySelectorAll("[data-date-input]").forEach(input=>input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();saveLicenseDate(input.dataset.dateInput)}});
  document.querySelectorAll("[data-extend]").forEach(b=>b.onclick=()=>{const c=customers.find(x=>x.licenseId===b.dataset.extend);const base=Math.max(Date.now(),new Date(c.expiresAt+"T12:00:00").getTime());updateLicense(c.licenseId,{valid_until:new Date(base+365*86400000).toISOString().slice(0,10)})});
  document.querySelectorAll("[data-command]").forEach(b=>b.onclick=()=>sendCommand(b.dataset.player,b.dataset.command));
}
function customerNav(page,icon,label){
  return `<button data-customer-page="${page}" class="${customerPage===page?"active":""}">${icon} ${label}</button>`;
}
function customerOverviewPanel(customer,ownPlayers,active){
  const address=[`${customer?.street||""} ${customer?.houseNumber||""}`.trim(),`${customer?.postalCode||""} ${customer?.city||""}`.trim(),customer?.country].filter(Boolean).join(", ")||"Nog niet ingevuld";
  const allowed=customer?.playerLimit||0,used=ownPlayers.length;
  return `<div class="customer-page"><div class="stats customer-stats"><article class="${active?"lime-card":""}"><span class="stat-icon">▣</span><div><small>Licentie</small><strong class="compact-stat">${active?"Actief":"Niet actief"}</strong><em>Geldig tot ${fmt(customer?.expiresAt)}</em></div></article><article><span class="stat-icon">▰</span><div><small>Toegestane players</small><strong>${allowed}</strong><em>Volgens de huidige licentie</em></div></article><article><span class="stat-icon">●</span><div><small>Licenties in gebruik</small><strong>${used}</strong><em>${Math.max(0,allowed-used)} beschikbaar</em></div></article></div><section class="panel"><div class="panel-head"><div><h2>Bedrijfsgegevens</h2><p>De gegevens die bij jouw ScreenFlow-account horen.</p></div></div><div class="customer-info-grid"><div><small>Klantnummer</small><strong>${esc(customer?.customerNumber||"—")}</strong></div><div><small>Bedrijfsnaam</small><strong>${esc(customer?.name||"—")}</strong></div><div><small>Contactpersoon</small><strong>${esc(customer?.contactName||"—")}</strong></div><div><small>E-mailadres</small><strong>${esc(customer?.email||"—")}</strong></div><div class="wide"><small>Bedrijfsadres</small><strong>${esc(address)}</strong></div></div></section></div>`;
}
function customerPlayersPage(customer,ownPlayers,active){
  return `<section class="panel"><div class="panel-head"><div><h2>Players</h2><p>${ownPlayers.length} van ${customer?.playerLimit||0} licenties in gebruik · ${ownPlayers.filter(online).length} online</p></div><button class="primary" id="customer-pair-player" ${!active||ownPlayers.length>=(customer?.playerLimit||0)?"disabled":""}>＋ Player koppelen</button></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Status</th><th>Versie</th><th>Laatste contact</th></tr></thead><tbody>${ownPlayers.length?ownPlayers.map(p=>`<tr><td><div class="customer"><span>▶</span><div><strong>${esc(p.name)}</strong><small>${esc(p.platform)}</small></div></div></td><td><span class="status ${online(p)?"active":"blocked"}">${online(p)?"Online":"Offline"}</span></td><td>${esc(p.version)}</td><td>${fmt(p.lastSeen)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty">Nog geen players gekoppeld. De echte koppelprocedure volgt met de Android-testplayer.</td></tr>'}</tbody></table></div></section>`;
}
function customerComingSoonPage(kind){
  const media=kind==="media";
  return `<section class="panel coming-soon"><span class="coming-icon">${media?"▧":"≡"}</span><p class="eyebrow">${media?"MEDIA":"PLANNING"}</p><h2>${media?"Mediabibliotheek":"Contentplanning"}</h2><p>${media?"Hier komen afbeeldingen en video's die je naar players kunt sturen.":"Hier maak je straks per dag en tijdstip een afspeelschema."}</p><span class="status in_progress">Wordt opgebouwd</span></section>`;
}
function customerRequestsPage(ownRequests){
  return `<section class="panel"><div class="panel-head"><div><h2>Mijn verzoeken</h2><p>Stuur een vraag of probleem rechtstreeks naar ScreenFlow.</p></div><button class="primary" id="new-request">＋ Nieuw verzoek</button></div>${customerRequestsHtml(ownRequests)}</section>`;
}
function renderCustomerDashboard(){
  const customer=customers[0];
  const ownPlayers=players.filter(p=>p.organizationId===identity.organizationId);
  const ownRequests=supportRequests.filter(r=>r.organization_id===identity.organizationId);
  const active=customer?.status==="active"&&new Date((customer?.expiresAt||"1970-01-01")+"T23:59:59").getTime()>=Date.now();
  const title=customer?.name||"Mijn organisatie";
  const pageTitle=({overview:"Overzicht",players:"Players",media:"Media",planning:"Planning",requests:"Verzoeken"})[customerPage]||"Overzicht";
  const heading=customerPage==="overview"?`${greeting()}, ${esc(identity.name)}.`:esc(pageTitle);
  const content=customerPage==="players"?customerPlayersPage(customer,ownPlayers,active):customerPage==="media"?customerComingSoonPage("media"):customerPage==="planning"?customerComingSoonPage("planning"):customerPage==="requests"?customerRequestsPage(ownRequests):customerOverviewPanel(customer,ownPlayers,active);
  app.innerHTML=`<main class="app-shell customer-shell"><aside class="sidebar"><div class="brand">${logo()}<span>SCREENFLOW<small>ADMIN</small></span></div><nav>${customerNav("overview","▦","Overzicht")}${customerNav("players","▰","Players")}${customerNav("media","▧","Media")}${customerNav("planning","≡","Planning")}${customerNav("requests","✉","Verzoeken")}</nav><button class="logout" id="logout">↪ Uitloggen</button><div class="side-foot"><span class="shield">✓</span><div><strong>Klantaccount</strong><span>${esc(session?.user?.email||"")}</span></div></div></aside><section class="workspace"><header><div><p class="eyebrow">SCREENFLOW ADMIN · ${esc(pageTitle.toUpperCase())}</p><h1>${heading}</h1><p>${esc(title)} · ${esc(customer?.customerNumber||"")}</p></div></header>${error?`<p class="error-banner customer-error">${esc(error)}</p>`:""}${content}</section></main><div id="modal-root"></div>`;
  document.getElementById("logout").onclick=()=>{stopNotificationPolling();saveSession(null);identity=null;customerPage="overview";customers=[];players=[];supportRequests=[];renderLogin()};
  document.querySelectorAll("[data-customer-page]").forEach(button=>button.onclick=()=>{customerPage=button.dataset.customerPage;error="";renderCustomerDashboard()});
  document.getElementById("customer-pair-player")?.addEventListener("click",()=>{error="Playerkoppeling wordt aangesloten zodra de Android-testplayer beschikbaar is.";renderCustomerDashboard()});
  document.getElementById("new-request")?.addEventListener("click",renderNewRequestModal);
}

function requestThreadHtml(r){
  const messages=r.support_request_messages||[];
  const legacy=r.manager_note?[{sender_role:"manager",message:r.manager_note,created_at:r.updated_at||r.created_at}]:[];
  const all=[...legacy,...messages];
  return `<div class="request-thread"><div class="thread-message customer-message"><strong>Klant</strong><p>${esc(r.description)}</p><small>${fmt(r.created_at)}</small></div>${all.map(m=>`<div class="thread-message ${m.sender_role==="manager"?"manager-message":"customer-message"}"><strong>${m.sender_role==="manager"?"ScreenFlow":"Klant"}</strong><p>${esc(m.message)}</p><small>${fmt(m.created_at)}</small></div>`).join("")}</div>`;
}
function requestStatusSelect(r){
  return `<select data-request-status="${esc(r.id)}"><option value="new" ${r.status==="new"?"selected":""}>Nieuw</option><option value="in_progress" ${r.status==="in_progress"?"selected":""}>In behandeling</option><option value="waiting_customer" ${r.status==="waiting_customer"?"selected":""}>Wacht op klant</option><option value="resolved" ${r.status==="resolved"?"selected":""}>Afgerond</option></select>`;
}
function managerRequestCard(r,showCustomer=true){
  const customer=customers.find(c=>c.id===r.organization_id);
  return `<article class="request-card"><div><span class="priority ${esc(r.priority)}">${priorityLabel(r.priority)}</span><h3>${esc(r.subject)}</h3>${showCustomer?`<small>${esc(customer?.name||"Onbekende klant")} · ${esc(customer?.customerNumber||"")}</small>`:""}${requestThreadHtml(r)}</div><div class="request-controls">${requestStatusSelect(r)}<button class="primary reply-button" data-reply-request="${esc(r.id)}">Reageren</button><small>${fmt(r.created_at)}</small></div></article>`;
}
function customerRequestsHtml(rows){
  return rows.length?`<div class="request-list">${rows.map(r=>`<article class="request-card"><div><span class="priority ${esc(r.priority)}">${priorityLabel(r.priority)}</span><h3>${esc(r.subject)}</h3>${requestThreadHtml(r)}</div><div><span class="request-status ${esc(r.status)}">${requestStatusLabel(r.status)}</span><small>${fmt(r.created_at)}</small></div></article>`).join("")}</div>`:'<div class="empty">Nog geen verzoeken ingediend.</div>';
}
function requestsPanel(){
  const open=supportRequests.filter(r=>r.status!=="resolved");
  return `<section class="panel"><div class="panel-head"><div><h2>Verzoeken</h2><p>${open.length} openstaand · ${supportRequests.length} totaal</p></div></div><div class="request-list manager-requests">${supportRequests.length?supportRequests.map(r=>managerRequestCard(r,true)).join(""):'<div class="empty">Er zijn nog geen klantverzoeken.</div>'}</div></section>`;
}
function customerRequestPanel(c){
  const rows=supportRequests.filter(r=>r.organization_id===c.id);
  return `<section class="panel requests-section"><div class="panel-head"><div><h2>Verzoeken van ${esc(c.name)}</h2><p>${rows.filter(r=>r.status!=="resolved").length} openstaand · ${rows.length} totaal</p></div></div>${rows.length?`<div class="request-list manager-requests">${rows.map(r=>managerRequestCard(r,false)).join("")}</div>`:'<div class="empty">Deze klant heeft nog geen verzoeken ingediend.</div>'}</section>`;
}
function renderManagerReplyModal(id){
  const r=supportRequests.find(item=>item.id===id);
  if(!r)return;
  const customer=customers.find(c=>c.id===r.organization_id);
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal reply-modal" id="reply-form"><div class="modal-title"><div><p class="eyebrow">ANTWOORD AAN ${esc(customer?.name||"KLANT")}</p><h2>${esc(r.subject)}</h2></div><button type="button" id="close">×</button></div><div class="modal-thread">${requestThreadHtml(r)}</div><label>Jouw reactie<textarea id="reply-message" minlength="1" maxlength="4000" rows="5" required autofocus></textarea></label><label>Status na verzenden<select id="reply-status"><option value="in_progress" ${r.status==="in_progress"?"selected":""}>In behandeling</option><option value="waiting_customer" ${r.status==="waiting_customer"?"selected":""}>Wacht op klant</option><option value="resolved" ${r.status==="resolved"?"selected":""}>Afgerond</option><option value="new" ${r.status==="new"?"selected":""}>Nieuw</option></select></label><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="reply-submit">Reactie versturen</button></div></form></div>`;
  const close=()=>document.getElementById("modal-root").innerHTML="";
  document.getElementById("close").onclick=close;document.getElementById("cancel").onclick=close;document.getElementById("modal-bg").onclick=e=>{if(e.target.id==="modal-bg")close()};
  document.getElementById("reply-form").onsubmit=e=>sendManagerReply(e,id);
  document.getElementById("reply-message").focus();
}
async function sendManagerReply(event,id){
  event.preventDefault();
  const button=document.getElementById("reply-submit");button.disabled=true;button.textContent="Versturen…";
  try{
    await request("/rest/v1/rpc/manager_reply_to_request",{method:"POST",body:JSON.stringify({p_request_id:id,p_message:document.getElementById("reply-message").value.trim(),p_status:document.getElementById("reply-status").value})});
    document.getElementById("modal-root").innerHTML="";
    await loadSupportRequests();
    renderDashboard();
  }catch(e){
    const p=document.getElementById("modal-error");p.textContent="Reactie versturen mislukt: "+(typeof e==="string"?e:(e?.message||e));p.classList.remove("hidden");button.disabled=false;button.textContent="Reactie versturen";
  }
}
async function updateRequestStatus(id,status){
  try{
    await request("/rest/v1/rpc/manager_update_support_request",{method:"POST",body:JSON.stringify({p_request_id:id,p_status:status,p_manager_note:null})});
    await loadSupportRequests();renderDashboard();
  }catch(e){error="Verzoek bijwerken mislukt: "+(typeof e==="string"?e:(e?.message||e));renderDashboard()}
}
function renderNewRequestModal(){
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="request-form"><div class="modal-title"><div><p class="eyebrow">SUPPORT</p><h2>Nieuw verzoek</h2></div><button type="button" id="close">×</button></div><label>Onderwerp<input id="request-subject" minlength="3" maxlength="120" required></label><label>Omschrijving<textarea id="request-description" minlength="5" maxlength="4000" rows="6" required></textarea></label><label>Urgentie<select id="request-priority"><option value="low">Laag</option><option value="normal" selected>Normaal</option><option value="high">Hoog</option><option value="urgent">Spoed</option></select></label><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="request-submit">Verzoek versturen</button></div></form></div>`;
  const close=()=>document.getElementById("modal-root").innerHTML="";
  document.getElementById("close").onclick=close;document.getElementById("cancel").onclick=close;document.getElementById("modal-bg").onclick=e=>{if(e.target.id==="modal-bg")close()};
  document.getElementById("request-form").onsubmit=createSupportRequest;
}
async function createSupportRequest(event){
  event.preventDefault();const button=document.getElementById("request-submit");button.disabled=true;button.textContent="Versturen…";
  try{
    await request("/rest/v1/support_requests",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({organization_id:identity.organizationId,created_by:session.user.id,subject:document.getElementById("request-subject").value.trim(),description:document.getElementById("request-description").value.trim(),priority:document.getElementById("request-priority").value})});
    document.getElementById("modal-root").innerHTML="";await loadSupportRequests();renderCustomerDashboard();
  }catch(e){const p=document.getElementById("modal-error");p.textContent="Verzoek versturen mislukt: "+(typeof e==="string"?e:(e?.message||e));p.classList.remove("hidden");button.disabled=false;button.textContent="Verzoek versturen"}
}

function customersPanel(shown){return `<section class="panel"><div class="panel-head"><div><h2>Klanten</h2><p>Licenties, looptijd en gebruik.</p></div><label class="search">⌕<input id="search" value="${esc(query)}" placeholder="Zoek klant"></label></div><div class="table-wrap"><table><thead><tr><th>Klant</th><th>Status</th><th>Players</th><th>Geldig tot</th><th></th></tr></thead><tbody>${shown.length?shown.map(rowHtml).join(""):'<tr><td colspan="5" class="empty">Nog geen klanten. Maak je eerste klant aan.</td></tr>'}</tbody></table></div></section>`}
function customerDetailPanel(c){
  if(!c)return '<section class="panel"><div class="empty">Klant niet gevonden.</div></section>';
  const customerPlayers=players.filter(p=>p.organizationId===c.id);
  const address=[[`${c.street} ${c.houseNumber}`.trim(),`${c.postalCode} ${c.city}`.trim(),c.country].filter(Boolean).join(", ")][0]||"Nog niet ingevuld";
  return `<div class="customer-detail"><section class="detail-grid"><article class="detail-card"><p class="eyebrow">KLANTGEGEVENS</p><div class="card-title-action"><h2>${esc(c.name)}</h2><button class="small-action" id="edit-customer">Bewerken</button></div><dl><dt>Klantnummer</dt><dd class="code-value">${esc(c.customerNumber||"Wordt gegenereerd")}</dd><dt>Contactpersoon</dt><dd>${esc(c.contactName||"—")}</dd><dt>E-mailadres</dt><dd>${esc(c.email||"—")}</dd><dt>Adres</dt><dd>${esc(address)}</dd></dl></article><article class="detail-card"><p class="eyebrow">LICENTIE</p><h2>${c.playerLimit} player${c.playerLimit===1?"":"s"}</h2><dl><dt>Status</dt><dd><span class="status ${esc(c.status)}">${c.status==="active"?"Actief":"Geblokkeerd"}</span></dd><dt>In gebruik</dt><dd>${c.playersUsed} van ${c.playerLimit}</dd><dt>Geldig tot</dt><dd>${fmt(c.expiresAt)}</dd></dl></article><article class="detail-card account-card"><p class="eyebrow">ADMINACCOUNT</p><h2>${esc(c.email||"Nog geen e-mail")}</h2><p>Het definitieve wachtwoord is beveiligd door Supabase en kan nooit in ScreenFlow Admin worden bekeken.</p><button class="primary" id="customer-admin-access" ${c.email?"":"disabled"}>Eenmalige toegang maken</button><small>Bij een bestaand account wordt het tijdelijke wachtwoord vervangen.</small></article></section><section class="panel"><div class="panel-head"><div><h2>Players van ${esc(c.name)}</h2><p>${customerPlayers.length} gekoppeld · ${customerPlayers.filter(online).length} online</p></div></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Status</th><th>Versie</th><th>Laatste contact</th></tr></thead><tbody>${customerPlayers.length?customerPlayers.map(p=>`<tr><td><div class="customer"><span>▶</span><div><strong>${esc(p.name)}</strong><small>${esc(p.platform)}</small></div></div></td><td><span class="status ${online(p)?"active":"blocked"}">${online(p)?"Online":"Offline"}</span></td><td>${esc(p.version)}</td><td>${fmt(p.lastSeen)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty">Deze klant heeft nog geen gekoppelde players.</td></tr>'}</tbody></table></div></section>${customerRequestPanel(c)}</div>`;
}
function renderEditCustomerModal(c){
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="edit-customer-form"><div class="modal-title"><div><p class="eyebrow">${esc(c.customerNumber)}</p><h2>Klantgegevens bewerken</h2></div><button type="button" id="close">×</button></div><label>Bedrijfsnaam<input id="edit-company" required value="${esc(c.name)}"></label><div class="form-row"><label>Contactpersoon<input id="edit-contact" value="${esc(c.contactName)}"></label><label>E-mailadres<input id="edit-email" type="email" value="${esc(c.email)}"></label></div><div class="form-row"><label>Straat<input id="edit-street" value="${esc(c.street)}"></label><label>Huisnummer<input id="edit-house" value="${esc(c.houseNumber)}"></label></div><div class="form-row"><label>Postcode<input id="edit-postal" value="${esc(c.postalCode)}"></label><label>Plaats<input id="edit-city" value="${esc(c.city)}"></label></div><label>Land<input id="edit-country" value="${esc(c.country)}"></label><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="save-customer">Opslaan</button></div></form></div>`;
  const close=()=>document.getElementById("modal-root").innerHTML="";
  document.getElementById("close").onclick=close;document.getElementById("cancel").onclick=close;document.getElementById("modal-bg").onclick=e=>{if(e.target.id==="modal-bg")close()};
  document.getElementById("edit-customer-form").onsubmit=e=>saveCustomerDetails(e,c);
}
async function saveCustomerDetails(event,c){
  event.preventDefault();const button=document.getElementById("save-customer");button.disabled=true;button.textContent="Opslaan…";
  try{
    await request("/rest/v1/rpc/manager_update_customer",{method:"POST",body:JSON.stringify({p_organization_id:c.id,p_name:document.getElementById("edit-company").value,p_contact_name:document.getElementById("edit-contact").value,p_contact_email:document.getElementById("edit-email").value,p_address_street:document.getElementById("edit-street").value,p_address_house_number:document.getElementById("edit-house").value,p_address_postal_code:document.getElementById("edit-postal").value,p_address_city:document.getElementById("edit-city").value,p_address_country:document.getElementById("edit-country").value})});
    document.getElementById("modal-root").innerHTML="";await loadCustomers();renderDashboard();
  }catch(e){const p=document.getElementById("modal-error");p.textContent="Opslaan mislukt: "+(typeof e==="string"?e:(e?.message||e));p.classList.remove("hidden");button.disabled=false;button.textContent="Opslaan"}
}

function renderAdminAccessModal(c){
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="admin-access-form"><div class="modal-title"><div><p class="eyebrow">EENMALIGE TOEGANG</p><h2>Adminaccount voor ${esc(c.name)}</h2></div><button type="button" id="close">×</button></div><p class="modal-copy">ScreenFlow maakt een sterk tijdelijk wachtwoord. Het wordt na aanmaak één keer getoond en moet bij de eerste login direct worden gewijzigd.</p><label>Naam<input id="admin-name" required value="${esc(c.contactName)}"></label><label>E-mailadres<input id="admin-email" required type="email" value="${esc(c.email)}"></label><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="admin-create-button">Toegang genereren</button></div></form></div>`;
  const close=()=>document.getElementById("modal-root").innerHTML="";
  document.getElementById("close").onclick=close;document.getElementById("cancel").onclick=close;document.getElementById("modal-bg").onclick=e=>{if(e.target.id==="modal-bg")close()};document.getElementById("admin-access-form").onsubmit=e=>createAdminAccess(e,c);
}
async function createAdminAccess(event,c){
  event.preventDefault();const button=document.getElementById("admin-create-button");button.disabled=true;button.textContent="Genereren…";
  try{
    const result=await request("/functions/v1/manager-customer-admin",{method:"POST",body:JSON.stringify({action:"issue_temporary_access",organization_id:c.id,email:document.getElementById("admin-email").value.trim(),full_name:document.getElementById("admin-name").value.trim()})});
    const password=result?.temporary_password;if(!password)throw new Error("De server gaf geen tijdelijk wachtwoord terug.");
    document.getElementById("modal-root").innerHTML=`<div class="modal-bg"><div class="modal"><div class="modal-title"><div><p class="eyebrow">ALLEEN NU ZICHTBAAR</p><h2>Tijdelijk wachtwoord</h2></div></div><p class="modal-copy">Geef dit veilig aan <strong>${esc(result.email)}</strong>. Na het sluiten is het niet meer op te vragen.</p><div class="temporary-password"><code id="temporary-password">${esc(password)}</code><button class="small-action" id="copy-password">Kopiëren</button></div><div class="modal-actions"><button class="primary" id="password-done">Klaar</button></div></div></div>`;
    document.getElementById("copy-password").onclick=async()=>{await navigator.clipboard.writeText(password);document.getElementById("copy-password").textContent="Gekopieerd ✓"};document.getElementById("password-done").onclick=()=>document.getElementById("modal-root").innerHTML="";
  }catch(e){const p=document.getElementById("modal-error");p.textContent="Toegang maken mislukt: "+(typeof e==="string"?e:(e?.message||e));p.classList.remove("hidden");button.disabled=false;button.textContent="Toegang genereren";}
}

function playersPanel(){
  const shown=players.filter(p=>(p.name+p.platform+p.version+p.code).toLowerCase().includes(query.toLowerCase()));
  return `<section class="panel"><div class="panel-head"><div><h2>Players</h2><p>Status, versie en bediening op afstand.</p></div><label class="search">⌕<input id="search" value="${esc(query)}" placeholder="Zoek player"></label></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Klant</th><th>Status</th><th>Versie</th><th>Acties</th></tr></thead><tbody>${shown.length?shown.map(playerRow).join(""):'<tr><td colspan="5" class="empty">Nog geen players geregistreerd. Open ScreenFlow Player om een koppelcode te krijgen.</td></tr>'}</tbody></table></div></section>`;
}
function playerRow(p){
  const customer=customers.find(c=>c.id===p.organizationId);
  return `<tr><td><div class="customer"><span>▶</span><div><strong>${esc(p.name)}</strong><small>${esc(p.platform)}${p.code?` · code ${esc(p.code)}`:""}</small></div></div></td><td>${customer?esc(customer.name):'<span class="muted">Niet gekoppeld</span>'}</td><td><span class="status ${online(p)?"active":"blocked"}">${online(p)?"Online":"Offline"}</span><small class="last-seen">${fmt(p.lastSeen)}</small></td><td>${esc(p.version)}</td><td><div class="actions"><button class="small-action" data-player="${esc(p.id)}" data-command="sync">Synchroniseer</button><button class="small-action" data-player="${esc(p.id)}" data-command="update">Update app</button>${p.pendingCommand?`<small class="pending">Wacht op: ${esc(p.pendingCommand)}</small>`:""}</div></td></tr>`;
}

function rowHtml(c) { const pct=c.playerLimit?Math.min(100,c.playersUsed/c.playerLimit*100):0;return `<tr data-open-customer="${esc(c.id)}" class="clickable-row"><td><div class="customer"><span>${esc(c.name.slice(0,2).toUpperCase())}</span><div><strong>${esc(c.name)}</strong><small>${esc(c.contactName)} · ${esc(c.email)}</small></div></div></td><td><button data-status="${esc(c.status)}" data-id="${esc(c.licenseId)}" class="status ${esc(c.status)}">${c.status==="active"?"Actief":"Geblokkeerd"}</button></td><td><strong>${c.playersUsed} / ${c.playerLimit}</strong><div class="meter"><i style="width:${pct}%"></i></div></td><td><div class="date-editor"><input class="license-date" data-date-input="${esc(c.licenseId)}" value="${esc(dateForInput(c.expiresAt))}" placeholder="dd-mm-jjjj" maxlength="10" inputmode="numeric" aria-label="Geldig tot"><button class="small-action" data-save-date="${esc(c.licenseId)}">Opslaan</button></div></td><td><button class="small-action" data-extend="${esc(c.licenseId)}">+1 jaar</button></td></tr>`; }
async function saveLicenseDate(id) {
  const input=document.querySelector(`[data-date-input="${id}"]`);
  const iso=dateToIso(input?.value);
  if(!iso) {
    error="Vul de datum in als dd-mm-jjjj, bijvoorbeeld 31-12-2027.";
    renderDashboard();
    document.querySelector(`[data-date-input="${id}"]`)?.focus();
    return;
  }
  await updateLicense(id,{valid_until:iso});
}
async function updateLicense(id, values) { try {await request("/rest/v1/rpc/manager_update_license",{method:"POST",body:JSON.stringify({p_license_id:id,p_status:values.status||null,p_valid_until:values.valid_until||null})});await loadCustomers();renderDashboard()}catch(e){error=typeof e==="string"?e:(e?.message||String(e));renderDashboard()} }
function renderModal() {
  const date=dateForInput(new Date(Date.now()+365*86400000).toISOString().slice(0,10));
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="customer-form"><div class="modal-title"><div><p class="eyebrow">NIEUWE LICENTIE</p><h2>Klant toevoegen</h2></div><button type="button" id="close">×</button></div><label>Bedrijfsnaam<input id="company" required></label><div class="form-row"><label>Contactpersoon<input id="contact" required></label><label>E-mailadres<input id="customer-email" required type="email"></label></div><div class="form-row"><label>Aantal players<input id="limit" required min="1" max="999" type="number" value="5"></label><label>Geldig tot<input id="expires" required type="text" inputmode="numeric" maxlength="10" placeholder="dd-mm-jjjj" value="${date}"></label></div><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="create-button">Klant aanmaken</button></div></form></div>`;
  const close=()=>document.getElementById("modal-root").innerHTML=""; document.getElementById("close").onclick=close;document.getElementById("cancel").onclick=close;document.getElementById("modal-bg").onclick=e=>{if(e.target.id==="modal-bg")close()};document.getElementById("customer-form").onsubmit=createCustomer;
}
async function createCustomer(event) {
  event.preventDefault();
  const button=document.getElementById("create-button");
  button.disabled=true;
  button.textContent="Aanmaken…";
  try {
    const validUntil=dateToIso(document.getElementById("expires").value);
    if(!validUntil) throw new Error("Vul Geldig tot in als dd-mm-jjjj, bijvoorbeeld 31-12-2027.");
    await request("/rest/v1/rpc/manager_create_customer",{
      method:"POST",
      body:JSON.stringify({
        p_name:document.getElementById("company").value,
        p_contact_name:document.getElementById("contact").value,
        p_contact_email:document.getElementById("customer-email").value,
        p_player_limit:Number(document.getElementById("limit").value),
        p_valid_until:validUntil
      })
    });
    document.getElementById("modal-root").innerHTML="";
    await loadCustomers();
    renderDashboard();
  } catch(e) {
    const p=document.getElementById("modal-error");
    p.textContent="Klant aanmaken mislukt: "+(typeof e==="string"?e:(e?.message||e));
    p.classList.remove("hidden");
    button.disabled=false;
    button.textContent="Klant aanmaken";
  }
}

async function start() { if(!session){renderLogin();return} await bootAuthenticated(); }
start();
