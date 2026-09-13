const SUPABASE_URL = "https://eckmifmgrurxgriimgpp.supabase.co";
const SUPABASE_KEY = "sb_publishable_g0ktlqb7mJcLzkCysi7GCw_55uB5lmQ";
const STORAGE_KEY = "screenflow_manager_session";

const app = document.getElementById("app");
let session = loadSession();
let customers = [];
let players = [];
let error = "";
let query = "";
let activePage = "overview";
let selectedCustomerId = "";
let identity = null;

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
  const userId=session?.user?.id;
  const rows=await request(`/rest/v1/profiles?select=role,full_name&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  const profile=rows?.[0];
  if(String(profile?.role||"").toLowerCase()!=="manager") throw new Error("Dit account heeft geen toegang tot ScreenFlow Admin.");
  identity={role:"manager",organizationId:"",forcePasswordChange:false,name:profile?.full_name||session?.user?.email||"Manager"};
}
function isManager(){return identity?.role==="manager"}
async function bootAuthenticated(){
  try {
    await resolveIdentity();
    if(identity.forcePasswordChange){renderPasswordChange();return}
    await Promise.all([loadCustomers(),loadPlayers()]);
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
    await Promise.all([loadCustomers(),loadPlayers()]);
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
    const select=encodeURIComponent("id,name,contact_name,contact_email,created_at,licenses(id,status,player_limit,valid_until),devices(id)");
    const scope=isManager()?"":`&id=eq.${encodeURIComponent(identity.organizationId)}`;
    const rows=await request(`/rest/v1/organizations?select=${select}&order=created_at.desc${scope}`);
    customers=(rows||[]).map(o=>{const l=Array.isArray(o.licenses)?o.licenses[0]:o.licenses;return{id:o.id,licenseId:l?.id||"",name:o.name,contactName:o.contact_name||"",email:o.contact_email||"",status:l?.status||"blocked",playerLimit:l?.player_limit||0,playersUsed:o.devices?.length||0,expiresAt:l?.valid_until||new Date().toISOString().slice(0,10)}});
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

function nav(page,icon,label){return `<button data-page="${page}" class="${activePage===page?"active":""}">${icon} ${label}</button>`}
function renderDashboard() {
  if(!isManager()){renderCustomerDashboard();return}
  const shown=customers.filter(c=>(c.name+c.contactName+c.email).toLowerCase().includes(query.toLowerCase()));
  const active=customers.filter(c=>c.status==="active").length, licenses=customers.reduce((n,c)=>n+c.playerLimit,0), used=players.filter(p=>p.organizationId).length;
  const selected=customers.find(c=>c.id===selectedCustomerId);
  const title=activePage==="customer"?(selected?.name||"Klant"):activePage==="players"?"Playerbeheer":activePage==="customers"?"Klanten":"Goedemorgen, Robin.";
  const subtitle=activePage==="customer"?"Klantgegevens, licentie, account en gekoppelde players.":activePage==="players"?"Koppel, controleer en bedien Android-players op afstand.":"Beheer klanten en playerlicenties vanuit één plek.";
  const action=activePage==="customer"?'<button class="small-action back-button" id="back-customers">← Terug naar klanten</button>':activePage==="players"?'<button class="primary" id="pair-player">＋ Player koppelen</button>':'<button class="primary" id="new-customer">＋ Nieuwe klant</button>';
  app.innerHTML=`<main class="app-shell"><aside class="sidebar"><div class="brand">${logo()}<span>SCREENFLOW<small>ADMIN</small></span></div><nav>${nav("overview","▦","Overzicht")}${nav("customers","▣","Klanten")}${nav("players","▰","Players")}</nav><button class="logout" id="logout">↪ Uitloggen</button><div class="side-foot"><span class="shield">✓</span><div><strong>Manageraccount</strong><span>${esc(session?.user?.email||"")}</span></div></div></aside><section class="workspace"><header><div><p class="eyebrow">SCREENFLOW ADMIN</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</header><div class="stats"><article class="lime-card"><span class="stat-icon">▣</span><div><small>Actieve klanten</small><strong>${active}</strong><em>${customers.length-active} niet actief</em></div></article><article><span class="stat-icon">⌁</span><div><small>Uitgegeven licenties</small><strong>${licenses}</strong><em>${Math.max(0,licenses-used)} beschikbaar</em></div></article><article><span class="stat-icon">▰</span><div><small>Gekoppelde players</small><strong>${used}</strong><em>${players.filter(online).length} online</em></div></article></div>${error?`<p class="error-banner">${esc(error)}</p>`:""}${activePage==="customer"?customerDetailPanel(selected):activePage==="players"?playersPanel():customersPanel(shown)}</section></main><div id="modal-root"></div>`;
  document.getElementById("logout").onclick=()=>{saveSession(null);customers=[];players=[];renderLogin()};
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{activePage=b.dataset.page;query="";error="";renderDashboard()});
  document.getElementById("new-customer")?.addEventListener("click",renderModal);
  document.getElementById("pair-player")?.addEventListener("click",renderPairModal);
  document.getElementById("back-customers")?.addEventListener("click",()=>{activePage="customers";selectedCustomerId="";error="";renderDashboard()});
  document.querySelectorAll("[data-open-customer]").forEach(row=>row.onclick=e=>{if(e.target.closest("button,input"))return;selectedCustomerId=row.dataset.openCustomer;activePage="customer";error="";renderDashboard()});
  document.getElementById("customer-admin-access")?.addEventListener("click",()=>selected&&renderAdminAccessModal(selected));
  const search=document.getElementById("search"); if(search) search.oninput=e=>{query=e.target.value;renderDashboard();document.getElementById("search")?.focus()};
  document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>updateLicense(b.dataset.id,{status:b.dataset.status==="active"?"blocked":"active"}));
  document.querySelectorAll("[data-save-date]").forEach(b=>b.onclick=()=>saveLicenseDate(b.dataset.saveDate));
  document.querySelectorAll("[data-date-input]").forEach(input=>input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();saveLicenseDate(input.dataset.dateInput)}});
  document.querySelectorAll("[data-extend]").forEach(b=>b.onclick=()=>{const c=customers.find(x=>x.licenseId===b.dataset.extend);const base=Math.max(Date.now(),new Date(c.expiresAt+"T12:00:00").getTime());updateLicense(c.licenseId,{valid_until:new Date(base+365*86400000).toISOString().slice(0,10)})});
  document.querySelectorAll("[data-command]").forEach(b=>b.onclick=()=>sendCommand(b.dataset.player,b.dataset.command));
}
function renderCustomerDashboard(){
  const customer=customers[0];
  const ownPlayers=players.filter(p=>p.organizationId===identity.organizationId);
  const active=customer?.status==="active"&&new Date((customer?.expiresAt||"1970-01-01")+"T23:59:59").getTime()>=Date.now();
  const title=customer?.name||"Mijn organisatie";
  app.innerHTML=`<main class="app-shell customer-shell"><aside class="sidebar"><div class="brand">${logo()}<span>SCREENFLOW<small>ADMIN</small></span></div><nav><button class="active">▦ Overzicht</button><button id="customer-players">▰ Players</button><button disabled>▧ Media <small>Binnenkort</small></button><button disabled>≡ Planning <small>Binnenkort</small></button></nav><button class="logout" id="logout">↪ Uitloggen</button><div class="side-foot"><span class="shield">✓</span><div><strong>Klantaccount</strong><span>${esc(session?.user?.email||"")}</span></div></div></aside><section class="workspace"><header><div><p class="eyebrow">SCREENFLOW ADMIN</p><h1>Welkom, ${esc(identity.name)}.</h1><p>Beheer de narrowcasting van ${esc(title)}.</p></div></header><div class="stats customer-stats"><article class="${active?"lime-card":""}"><span class="stat-icon">▣</span><div><small>Licentie</small><strong class="compact-stat">${active?"Actief":"Niet actief"}</strong><em>Geldig tot ${fmt(customer?.expiresAt)}</em></div></article><article><span class="stat-icon">▰</span><div><small>Gekoppelde players</small><strong>${ownPlayers.length} / ${customer?.playerLimit||0}</strong><em>${ownPlayers.filter(online).length} online</em></div></article><article><span class="stat-icon">●</span><div><small>Systeemstatus</small><strong class="compact-stat">${ownPlayers.some(online)?"Online":"Stand-by"}</strong><em>${ownPlayers.length?"Players worden gecontroleerd":"Nog geen player gekoppeld"}</em></div></article></div>${error?`<p class="error-banner">${esc(error)}</p>`:""}<section class="panel"><div class="panel-head"><div><h2>Players van ${esc(title)}</h2><p>Alleen de players van jouw organisatie zijn zichtbaar.</p></div><button class="primary" id="customer-pair-player" ${!active||ownPlayers.length>=(customer?.playerLimit||0)?"disabled":""}>＋ Player koppelen</button></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Status</th><th>Versie</th><th>Laatste contact</th></tr></thead><tbody>${ownPlayers.length?ownPlayers.map(p=>`<tr><td><div class="customer"><span>▶</span><div><strong>${esc(p.name)}</strong><small>${esc(p.platform)}</small></div></div></td><td><span class="status ${online(p)?"active":"blocked"}">${online(p)?"Online":"Offline"}</span></td><td>${esc(p.version)}</td><td>${fmt(p.lastSeen)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty">Nog geen players gekoppeld. De echte koppelprocedure voegen we in de volgende stap toe.</td></tr>'}</tbody></table></div></section></section></main>`;
  document.getElementById("logout").onclick=()=>{saveSession(null);identity=null;customers=[];players=[];renderLogin()};
  document.getElementById("customer-pair-player")?.addEventListener("click",()=>{error="Playerkoppeling wordt aangesloten zodra de Android-testplayer beschikbaar is.";renderCustomerDashboard()});
  document.getElementById("customer-players")?.addEventListener("click",()=>document.querySelector(".panel")?.scrollIntoView({behavior:"smooth"}));
}

function customersPanel(shown){return `<section class="panel"><div class="panel-head"><div><h2>Klanten</h2><p>Licenties, looptijd en gebruik.</p></div><label class="search">⌕<input id="search" value="${esc(query)}" placeholder="Zoek klant"></label></div><div class="table-wrap"><table><thead><tr><th>Klant</th><th>Status</th><th>Players</th><th>Geldig tot</th><th></th></tr></thead><tbody>${shown.length?shown.map(rowHtml).join(""):'<tr><td colspan="5" class="empty">Nog geen klanten. Maak je eerste klant aan.</td></tr>'}</tbody></table></div></section>`}
function customerDetailPanel(c){
  if(!c)return '<section class="panel"><div class="empty">Klant niet gevonden.</div></section>';
  const customerPlayers=players.filter(p=>p.organizationId===c.id);
  return `<div class="customer-detail"><section class="detail-grid"><article class="detail-card"><p class="eyebrow">KLANTGEGEVENS</p><h2>${esc(c.name)}</h2><dl><dt>Contactpersoon</dt><dd>${esc(c.contactName||"—")}</dd><dt>E-mailadres</dt><dd>${esc(c.email||"—")}</dd><dt>Klantnummer</dt><dd class="code-value">${esc(c.id)}</dd></dl></article><article class="detail-card"><p class="eyebrow">LICENTIE</p><h2>${c.playerLimit} player${c.playerLimit===1?"":"s"}</h2><dl><dt>Status</dt><dd><span class="status ${esc(c.status)}">${c.status==="active"?"Actief":"Geblokkeerd"}</span></dd><dt>In gebruik</dt><dd>${c.playersUsed} van ${c.playerLimit}</dd><dt>Geldig tot</dt><dd>${fmt(c.expiresAt)}</dd></dl></article><article class="detail-card account-card"><p class="eyebrow">ADMINACCOUNT</p><h2>${esc(c.email||"Nog geen e-mail")}</h2><p>Het definitieve wachtwoord is beveiligd door Supabase en kan nooit in ScreenFlow Admin worden bekeken.</p><button class="primary" id="customer-admin-access" ${c.email?"":"disabled"}>Eenmalige toegang maken</button><small>Bij een bestaand account wordt het oude wachtwoord vervangen.</small></article></section><section class="panel"><div class="panel-head"><div><h2>Players van ${esc(c.name)}</h2><p>${customerPlayers.length} gekoppeld · ${customerPlayers.filter(online).length} online</p></div></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Status</th><th>Versie</th><th>Laatste contact</th></tr></thead><tbody>${customerPlayers.length?customerPlayers.map(p=>`<tr><td><div class="customer"><span>▶</span><div><strong>${esc(p.name)}</strong><small>${esc(p.platform)}</small></div></div></td><td><span class="status ${online(p)?"active":"blocked"}">${online(p)?"Online":"Offline"}</span></td><td>${esc(p.version)}</td><td>${fmt(p.lastSeen)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty">Deze klant heeft nog geen gekoppelde players.</td></tr>'}</tbody></table></div></section></div>`;
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
