const SUPABASE_URL = "https://eckmifmgrurxgriimgnpp.supabase.co";
const SUPABASE_KEY = "sb_publishable_g0ktlqb7mJcLzkCysi7GCw_55uB5lmQ";
const STORAGE_KEY = "screenflow_manager_session";

const app = document.getElementById("app");
let session = loadSession();
let customers = [];
let error = "";
let query = "";

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
async function request(path, options={}) {
  let response = await fetch(SUPABASE_URL + path, {...options, headers:{...apiHeaders(Boolean(options.body)), ...(options.headers||{})}});
  if (response.status === 401 && session?.refresh_token) {
    const refreshed = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {method:"POST",headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:session.refresh_token})});
    if (refreshed.ok) { saveSession(await refreshed.json()); response = await fetch(SUPABASE_URL + path, {...options, headers:{...apiHeaders(Boolean(options.body)), ...(options.headers||{})}}); }
  }
  if (!response.ok) { const body = await response.json().catch(()=>({})); throw new Error(body.message || body.error_description || body.hint || `Fout ${response.status}`); }
  if (response.status === 204) return null;
  return response.json();
}

function renderLogin() {
  app.innerHTML = `<main class="login-screen"><form class="login-card" id="login-form">${logo()}<p class="eyebrow">SCREENFLOW MANAGER</p><h1>Welkom terug.</h1><p>Log in met jouw beveiligde ScreenFlow Manager-account.</p><label>E-mailadres<input id="email" autocomplete="email" type="email" required></label><label>Wachtwoord<input id="password" autocomplete="current-password" type="password" required></label><p class="login-error ${error?'':'hidden'}">${esc(error)}</p><button class="primary" id="login-button">Inloggen</button></form></main>`;
  document.getElementById("login-form").onsubmit = login;
}
async function login(event) {
  event.preventDefault(); error="";
  const button=document.getElementById("login-button"); button.disabled=true; button.textContent="Inloggen…";
  try {
    const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value})});
    const data=await response.json(); if(!response.ok) throw new Error(data.error_description || data.message || "Inloggen mislukt");
    saveSession(data); await loadCustomers(); renderDashboard();
  } catch(e) {
    const message=String(e?.message||"");
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
  } catch(e) { error="Kon de gegevens niet laden: "+e.message; customers=[]; }
}
function fmt(date) { try { return new Intl.DateTimeFormat("nl-NL",{day:"numeric",month:"short",year:"numeric"}).format(new Date(date+"T12:00:00")); } catch { return date; } }
function renderDashboard() {
  const shown=customers.filter(c=>(c.name+c.contactName+c.email).toLowerCase().includes(query.toLowerCase()));
  const active=customers.filter(c=>c.status==="active").length, licenses=customers.reduce((n,c)=>n+c.playerLimit,0), used=customers.reduce((n,c)=>n+c.playersUsed,0);
  app.innerHTML=`<main class="app-shell"><aside class="sidebar"><div class="brand">${logo()}<span>SCREENFLOW<small>MANAGER</small></span></div><nav><button class="active">▦ Overzicht</button><button>▣ Klanten</button><button>⌁ Licenties</button></nav><button class="logout" id="logout">↪ Uitloggen</button><div class="side-foot"><span class="shield">✓</span><div><strong>Manageraccount</strong><span>${esc(session?.user?.email||"")}</span></div></div></aside><section class="workspace"><header><div><p class="eyebrow">SCREENFLOW MANAGER</p><h1>Goedemorgen, Robin.</h1><p>Beheer klanten en playerlicenties vanuit één plek.</p></div><button class="primary" id="new-customer">＋ Nieuwe klant</button></header><div class="stats"><article class="lime-card"><span class="stat-icon">▣</span><div><small>Actieve klanten</small><strong>${active}</strong><em>${customers.length-active} niet actief</em></div></article><article><span class="stat-icon">⌁</span><div><small>Uitgegeven licenties</small><strong>${licenses}</strong><em>${licenses-used} beschikbaar</em></div></article><article><span class="stat-icon">▰</span><div><small>Gekoppelde players</small><strong>${used}</strong><em>van ${licenses} plekken</em></div></article></div>${error?`<p class="error-banner">${esc(error)}</p>`:""}<section class="panel"><div class="panel-head"><div><h2>Klanten</h2><p>Licenties, looptijd en gebruik.</p></div><label class="search">⌕<input id="search" value="${esc(query)}" placeholder="Zoek klant"></label></div><div class="table-wrap"><table><thead><tr><th>Klant</th><th>Status</th><th>Players</th><th>Geldig tot</th><th></th></tr></thead><tbody>${shown.length?shown.map(rowHtml).join(""):'<tr><td colspan="5" class="empty">Nog geen klanten. Maak je eerste klant aan.</td></tr>'}</tbody></table></div></section></section></main><div id="modal-root"></div>`;
  document.getElementById("logout").onclick=()=>{saveSession(null);customers=[];renderLogin()};
  document.getElementById("new-customer").onclick=renderModal;
  document.getElementById("search").oninput=e=>{query=e.target.value;renderDashboard();document.getElementById("search").focus()};
  document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>updateLicense(b.dataset.id,{status:b.dataset.status==="active"?"blocked":"active"}));
  document.querySelectorAll("[data-extend]").forEach(b=>b.onclick=()=>{const c=customers.find(x=>x.licenseId===b.dataset.extend);const base=Math.max(Date.now(),new Date(c.expiresAt).getTime());updateLicense(c.licenseId,{valid_until:new Date(base+365*86400000).toISOString().slice(0,10)})});
}
function rowHtml(c) { const pct=c.playerLimit?Math.min(100,c.playersUsed/c.playerLimit*100):0;return `<tr><td><div class="customer"><span>${esc(c.name.slice(0,2).toUpperCase())}</span><div><strong>${esc(c.name)}</strong><small>${esc(c.contactName)} · ${esc(c.email)}</small></div></div></td><td><button data-status="${esc(c.status)}" data-id="${esc(c.licenseId)}" class="status ${esc(c.status)}">${c.status==="active"?"Actief":"Geblokkeerd"}</button></td><td><strong>${c.playersUsed} / ${c.playerLimit}</strong><div class="meter"><i style="width:${pct}%"></i></div></td><td><span class="date">▣ ${fmt(c.expiresAt)}</span></td><td><button class="small-action" data-extend="${esc(c.licenseId)}">+1 jaar</button></td></tr>`; }
async function updateLicense(id, values) { try {await request(`/rest/v1/licenses?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(values)});await loadCustomers();renderDashboard()}catch(e){error=e.message;renderDashboard()} }
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
  } catch(e) {const p=document.getElementById("modal-error");p.textContent="Klant aanmaken mislukt: "+e.message;p.classList.remove("hidden");button.disabled=false;button.textContent="Klant aanmaken";}
}

async function start() { if(!session){renderLogin();return} await loadCustomers();renderDashboard(); }
start();
