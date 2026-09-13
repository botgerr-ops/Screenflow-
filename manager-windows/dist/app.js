const SUPABASE_URL = "https://eckmifmgrurxgriimgnpp.supabase.co";
const SUPABASE_KEY = "sb_publishable_g0ktlqb7mJcLzkCysi7GCw_55uB5lmQ";
const STORAGE_KEY = "screenflow_manager_session";

const app = document.getElementById("app");
let session = loadSession();
let customers = [];
let players = [];
let error = "";
let query = "";
let activePage = "overview";

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

function renderLogin() {
  app.innerHTML = `<main class="login-screen"><form class="login-card" id="login-form">${logo()}<p class="eyebrow">SCREENFLOW MANAGER</p><h1>Welkom terug.</h1><p>Log in met jouw beveiligde ScreenFlow Manager-account.</p><label>E-mailadres<input id="email" autocomplete="email" type="email" required></label><label>Wachtwoord<input id="password" autocomplete="current-password" type="password" required></label><p class="login-error ${error?'':'hidden'}">${esc(error)}</p><button class="primary" id="login-button">Inloggen</button></form></main>`;
  document.getElementById("login-form").onsubmit = login;
}
async function login(event) {
  event.preventDefault(); error="";
  const button=document.getElementById("login-button"); button.disabled=true; button.textContent="Inloggen…";
  try {
    const data=await nativeRequest("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value})});
    saveSession(data); await Promise.all([loadCustomers(),loadPlayers()]); renderDashboard();
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
    const rows=await request(`/rest/v1/organizations?select=${select}&order=created_at.desc`);
    customers=(rows||[]).map(o=>{const l=Array.isArray(o.licenses)?o.licenses[0]:o.licenses;return{id:o.id,licenseId:l?.id||"",name:o.name,contactName:o.contact_name||"",email:o.contact_email||"",status:l?.status||"blocked",playerLimit:l?.player_limit||0,playersUsed:o.devices?.length||0,expiresAt:l?.valid_until||new Date().toISOString().slice(0,10)}});
    error="";
  } catch(e) { error="Kon de gegevens niet laden: "+(typeof e==="string"?e:(e?.message||e)); customers=[]; }
}

async function loadPlayers() {
  try {
    const rows=await request("/rest/v1/devices?select=*");
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

function nav(page,icon,label){return `<button data-page="${page}" class="${activePage===page?"active":""}">${icon} ${label}</button>`}
function renderDashboard() {
  const shown=customers.filter(c=>(c.name+c.contactName+c.email).toLowerCase().includes(query.toLowerCase()));
  const active=customers.filter(c=>c.status==="active").length, licenses=customers.reduce((n,c)=>n+c.playerLimit,0), used=players.filter(p=>p.organizationId).length;
  const title=activePage==="players"?"Playerbeheer":activePage==="customers"?"Klanten":"Goedemorgen, Robin.";
  const subtitle=activePage==="players"?"Koppel, controleer en bedien Android-players op afstand.":"Beheer klanten en playerlicenties vanuit één plek.";
  const action=activePage==="players"?'<button class="primary" id="pair-player">＋ Player koppelen</button>':'<button class="primary" id="new-customer">＋ Nieuwe klant</button>';
  app.innerHTML=`<main class="app-shell"><aside class="sidebar"><div class="brand">${logo()}<span>SCREENFLOW<small>MANAGER</small></span></div><nav>${nav("overview","▦","Overzicht")}${nav("customers","▣","Klanten")}${nav("players","▰","Players")}</nav><button class="logout" id="logout">↪ Uitloggen</button><div class="side-foot"><span class="shield">✓</span><div><strong>Manageraccount</strong><span>${esc(session?.user?.email||"")}</span></div></div></aside><section class="workspace"><header><div><p class="eyebrow">SCREENFLOW MANAGER</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</header><div class="stats"><article class="lime-card"><span class="stat-icon">▣</span><div><small>Actieve klanten</small><strong>${active}</strong><em>${customers.length-active} niet actief</em></div></article><article><span class="stat-icon">⌁</span><div><small>Uitgegeven licenties</small><strong>${licenses}</strong><em>${Math.max(0,licenses-used)} beschikbaar</em></div></article><article><span class="stat-icon">▰</span><div><small>Gekoppelde players</small><strong>${used}</strong><em>${players.filter(online).length} online</em></div></article></div>${error?`<p class="error-banner">${esc(error)}</p>`:""}${activePage==="players"?playersPanel():customersPanel(shown)}</section></main><div id="modal-root"></div>`;
  document.getElementById("logout").onclick=()=>{saveSession(null);customers=[];players=[];renderLogin()};
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{activePage=b.dataset.page;query="";error="";renderDashboard()});
  document.getElementById("new-customer")?.addEventListener("click",renderModal);
  document.getElementById("pair-player")?.addEventListener("click",renderPairModal);
  const search=document.getElementById("search"); if(search) search.oninput=e=>{query=e.target.value;renderDashboard();document.getElementById("search")?.focus()};
  document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>updateLicense(b.dataset.id,{status:b.dataset.status==="active"?"blocked":"active"}));
  document.querySelectorAll("[data-extend]").forEach(b=>b.onclick=()=>{const c=customers.find(x=>x.licenseId===b.dataset.extend);const base=Math.max(Date.now(),new Date(c.expiresAt).getTime());updateLicense(c.licenseId,{valid_until:new Date(base+365*86400000).toISOString().slice(0,10)})});
  document.querySelectorAll("[data-command]").forEach(b=>b.onclick=()=>sendCommand(b.dataset.player,b.dataset.command));
}
function customersPanel(shown){return `<section class="panel"><div class="panel-head"><div><h2>Klanten</h2><p>Licenties, looptijd en gebruik.</p></div><label class="search">⌕<input id="search" value="${esc(query)}" placeholder="Zoek klant"></label></div><div class="table-wrap"><table><thead><tr><th>Klant</th><th>Status</th><th>Players</th><th>Geldig tot</th><th></th></tr></thead><tbody>${shown.length?shown.map(rowHtml).join(""):'<tr><td colspan="5" class="empty">Nog geen klanten. Maak je eerste klant aan.</td></tr>'}</tbody></table></div></section>`}
function playersPanel(){
  const shown=players.filter(p=>(p.name+p.platform+p.version+p.code).toLowerCase().includes(query.toLowerCase()));
  return `<section class="panel"><div class="panel-head"><div><h2>Players</h2><p>Status, versie en bediening op afstand.</p></div><label class="search">⌕<input id="search" value="${esc(query)}" placeholder="Zoek player"></label></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Klant</th><th>Status</th><th>Versie</th><th>Acties</th></tr></thead><tbody>${shown.length?shown.map(playerRow).join(""):'<tr><td colspan="5" class="empty">Nog geen players geregistreerd. Open ScreenFlow Player om een koppelcode te krijgen.</td></tr>'}</tbody></table></div></section>`;
}
function playerRow(p){
  const customer=customers.find(c=>c.id===p.organizationId);
  return `<tr><td><div class="customer"><span>▶</span><div><strong>${esc(p.name)}</strong><small>${esc(p.platform)}${p.code?` · code ${esc(p.code)}`:""}</small></div></div></td><td>${customer?esc(customer.name):'<span class="muted">Niet gekoppeld</span>'}</td><td><span class="status ${online(p)?"active":"blocked"}">${online(p)?"Online":"Offline"}</span><small class="last-seen">${fmt(p.lastSeen)}</small></td><td>${esc(p.version)}</td><td><div class="actions"><button class="small-action" data-player="${esc(p.id)}" data-command="sync">Synchroniseer</button><button class="small-action" data-player="${esc(p.id)}" data-command="update">Update app</button>${p.pendingCommand?`<small class="pending">Wacht op: ${esc(p.pendingCommand)}</small>`:""}</div></td></tr>`;
}

function rowHtml(c) { const pct=c.playerLimit?Math.min(100,c.playersUsed/c.playerLimit*100):0;return `<tr><td><div class="customer"><span>${esc(c.name.slice(0,2).toUpperCase())}</span><div><strong>${esc(c.name)}</strong><small>${esc(c.contactName)} · ${esc(c.email)}</small></div></div></td><td><button data-status="${esc(c.status)}" data-id="${esc(c.licenseId)}" class="status ${esc(c.status)}">${c.status==="active"?"Actief":"Geblokkeerd"}</button></td><td><strong>${c.playersUsed} / ${c.playerLimit}</strong><div class="meter"><i style="width:${pct}%"></i></div></td><td><span class="date">▣ ${fmt(c.expiresAt)}</span></td><td><button class="small-action" data-extend="${esc(c.licenseId)}">+1 jaar</button></td></tr>`; }
async function updateLicense(id, values) { try {await request(`/rest/v1/licenses?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(values)});await loadCustomers();renderDashboard()}catch(e){error=typeof e==="string"?e:(e?.message||String(e));renderDashboard()} }
function renderModal() {
  const date=new Date(Date.now()+365*86400000).toISOString().slice(0,10);
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="customer-form"><div class="modal-title"><div><p class="eyebrow">NIEUWE LICENTIE</p><h2>Klant toevoegen</h2></div><button type="button" id="close">×</button></div><label>Bedrijfsnaam<input id="company" required></label><div class="form-row"><label>Contactpersoon<input id="contact" required></label><label>E-mailadres<input id="customer-email" required type="email"></label></div><div class="form-row"><label>Aantal players<input id="limit" required min="1" max="999" type="number" value="5"></label><label>Geldig tot<input id="expires" required type="date" value="${date}"></label></div><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="create-button">Klant aanmaken</button></div></form></div>`;
  const close=()=>document.getElementById("modal-root").innerHTML=""; document.getElementById("close").onclick=close;document.getElementById("cancel").onclick=close;document.getElementById("modal-bg").onclick=e=>{if(e.target.id==="modal-bg")close()};document.getElementById("customer-form").onsubmit=createCustomer;
}
async function createCustomer(event) {
  event.preventDefault();const button=document.getElementById("create-button");button.disabled=true;button.textContent="Aanmaken…";
  try {
    const org=await request("/rest/v1/organizations",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({name:document.getElementById("company").value,contact_name:document.getElementById("contact").value,contact_email:document.getElementById("customer-email").value})});
    await request("/rest/v1/licenses",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({organization_id:org[0].id,status:"active",player_limit:Number(document.getElementById("limit").value),valid_until:document.getElementById("expires").value})});
    document.getElementById("modal-root").innerHTML="";await loadCustomers();renderDashboard();
  } catch(e) {const p=document.getElementById("modal-error");p.textContent="Klant aanmaken mislukt: "+(typeof e==="string"?e:(e?.message||e));p.classList.remove("hidden");button.disabled=false;button.textContent="Klant aanmaken";}
}

async function sendCommand(playerId,command){try{await request("/rest/v1/rpc/manager_set_player_command",{method:"POST",body:JSON.stringify({p_device_id:playerId,p_command:command})});await loadPlayers();renderDashboard()}catch(e){error="Opdracht mislukt: "+(typeof e==="string"?e:(e?.message||e));renderDashboard()}}
function renderPairModal(){
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="pair-form"><div class="modal-title"><div><p class="eyebrow">ANDROID PLAYER</p><h2>Player koppelen</h2></div><button type="button" id="close">×</button></div><label>Zescijferige koppelcode<input id="pair-code" required inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="123456"></label><label>Klant<select id="pair-org" required><option value="">Kies een klant…</option>${customers.filter(c=>c.status==="active").map(c=>`<option value="${esc(c.id)}">${esc(c.name)} (${c.playersUsed}/${c.playerLimit})</option>`).join("")}</select></label><label>Naam van de player<input id="pair-name" required placeholder="Receptie Rotterdam"></label><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="create-button">Player koppelen</button></div></form></div>`;
  const close=()=>document.getElementById("modal-root").innerHTML="";document.getElementById("close").onclick=close;document.getElementById("cancel").onclick=close;document.getElementById("modal-bg").onclick=e=>{if(e.target.id==="modal-bg")close()};document.getElementById("pair-form").onsubmit=pairPlayer;
}
async function pairPlayer(event){
  event.preventDefault();const button=document.getElementById("create-button");button.disabled=true;button.textContent="Koppelen…";
  try{await request("/rest/v1/rpc/manager_pair_player",{method:"POST",body:JSON.stringify({p_pairing_code:document.getElementById("pair-code").value,p_organization_id:document.getElementById("pair-org").value,p_name:document.getElementById("pair-name").value})});document.getElementById("modal-root").innerHTML="";await Promise.all([loadCustomers(),loadPlayers()]);activePage="players";renderDashboard()}
  catch(e){const p=document.getElementById("modal-error");p.textContent="Koppelen mislukt: "+(typeof e==="string"?e:(e?.message||e));p.classList.remove("hidden");button.disabled=false;button.textContent="Player koppelen"}
}

async function start() { if(!session){renderLogin();return} await Promise.all([loadCustomers(),loadPlayers()]);renderDashboard(); }
start();
