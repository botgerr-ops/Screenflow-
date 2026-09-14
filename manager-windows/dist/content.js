let mediaItems = [];
let playlists = [];
let contentSchedules = [];
let contentBusy = false;

function storageRoute(path){
  return String(path).split("/").map(encodeURIComponent).join("/");
}
function fileSize(bytes){
  if(bytes<1024)return bytes+" B";
  if(bytes<1048576)return (bytes/1024).toFixed(1)+" KB";
  return (bytes/1048576).toFixed(1)+" MB";
}
function contentErrorMessage(e){
  return typeof e==="string"?e:(e?.message||String(e));
}
async function signedMediaUrl(path){
  try{
    const result=await request("/storage/v1/object/sign/screenflow-media/"+storageRoute(path),{method:"POST",body:JSON.stringify({expiresIn:3600})});
    const value=result?.signedURL||result?.signedUrl||"";
    if(!value)return "";
    if(value.startsWith("http"))return value;
    return value.startsWith("/storage/v1/")?SUPABASE_URL+value:SUPABASE_URL+"/storage/v1"+value;
  }catch{return ""}
}
async function loadContentData(){
  if(isManager()){mediaItems=[];playlists=[];contentSchedules=[];return}
  await Promise.all([loadMediaItems(),loadPlaylists(),loadContentSchedules()]);
}
async function loadMediaItems(){
  try{
    const rows=await request("/rest/v1/media_items?select=*&organization_id=eq."+encodeURIComponent(identity.organizationId)+"&order=created_at.desc");
    mediaItems=await Promise.all((rows||[]).map(async item=>({...item,signed_url:await signedMediaUrl(item.storage_path)})));
  }catch{mediaItems=[]}
}
async function loadPlaylists(){
  try{
    const select=encodeURIComponent("*,playlist_items(*,media_items(id,name,mime_type,storage_path))");
    const rows=await request("/rest/v1/playlists?select="+select+"&organization_id=eq."+encodeURIComponent(identity.organizationId)+"&order=updated_at.desc");
    playlists=(rows||[]).map(p=>({...p,playlist_items:[...(p.playlist_items||[])].sort((a,b)=>a.position-b.position)}));
  }catch{playlists=[]}
}
async function loadContentSchedules(){
  try{
    const select=encodeURIComponent("*,playlists(id,name)");
    const rows=await request("/rest/v1/content_schedules?select="+select+"&organization_id=eq."+encodeURIComponent(identity.organizationId)+"&order=created_at.desc");
    contentSchedules=rows||[];
  }catch{contentSchedules=[]}
}
function mediaKind(item){return String(item.mime_type||"").startsWith("video/")?"Video":"Afbeelding"}
function mediaPreview(item){
  if(!item.signed_url)return '<div class="media-placeholder">Geen preview</div>';
  if(String(item.mime_type).startsWith("video/"))return `<video controls preload="metadata" src="${esc(item.signed_url)}"></video>`;
  return `<img loading="lazy" src="${esc(item.signed_url)}" alt="${esc(item.name)}">`;
}
function customerMediaPage(){
  return `<section class="panel content-panel"><div class="panel-head"><div><h2>Media</h2><p>${mediaItems.length} bestand${mediaItems.length===1?"":"en"} · afbeeldingen en video's</p></div><div><input class="hidden" id="media-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"><button class="primary" id="upload-media" ${contentBusy?"disabled":""}>＋ Media uploaden</button></div></div>${mediaItems.length?`<div class="media-grid">${mediaItems.map(item=>`<article class="media-card"><div class="media-preview">${mediaPreview(item)}</div><div class="media-meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${mediaKind(item)} · ${fileSize(Number(item.size_bytes||0))}</small><div class="media-actions"><button class="small-action" data-preview-media="${esc(item.id)}">Openen</button><button class="small-action" data-rename-media="${esc(item.id)}">Hernoemen</button><button class="small-action danger" data-delete-media="${esc(item.id)}">Verwijderen</button></div></div></article>`).join("")}</div>`:'<div class="empty">Nog geen media. Upload je eerste afbeelding of video.</div>'}</section>`;
}
function customerPlaylistsPage(){
  return `<section class="panel content-panel"><div class="panel-head"><div><h2>Afspeellijsten</h2><p>Zet media in de juiste volgorde en bepaal de speelduur.</p></div><button class="primary" id="new-playlist" ${mediaItems.length?"":"disabled"}>＋ Nieuwe afspeellijst</button></div>${!mediaItems.length?'<div class="empty">Upload eerst media voordat je een afspeellijst maakt.</div>':playlists.length?`<div class="playlist-grid">${playlists.map(p=>`<article class="playlist-card"><span class="playlist-icon">▶</span><div><strong>${esc(p.name)}</strong><small>${p.playlist_items?.length||0} item${p.playlist_items?.length===1?"":"s"} · ${playlistDuration(p)} seconden</small></div><div class="playlist-actions"><button class="small-action" data-edit-playlist="${esc(p.id)}">Bewerken</button><button class="small-action danger" data-delete-playlist="${esc(p.id)}">Verwijderen</button></div></article>`).join("")}</div>`:'<div class="empty">Nog geen afspeellijsten aangemaakt.</div>'}</section>`;
}
function playlistDuration(p){return (p.playlist_items||[]).reduce((sum,item)=>sum+Number(item.duration_seconds||0),0)}
const DAY_NAMES=["Zo","Ma","Di","Wo","Do","Vr","Za"];
function scheduleDays(days){return [...(days||[])].sort().map(day=>DAY_NAMES[day]).join(", ")}
function shortTime(value){return String(value||"").slice(0,5)}
function customerPlanningPage(){
  return `<section class="panel content-panel"><div class="panel-head"><div><h2>Planning</h2><p>Koppel afspeellijsten aan vaste dagen en tijden.</p></div><button class="primary" id="new-schedule" ${playlists.length?"":"disabled"}>＋ Planning toevoegen</button></div>${!playlists.length?'<div class="empty">Maak eerst een afspeellijst voordat je een planning instelt.</div>':contentSchedules.length?`<div class="schedule-list">${contentSchedules.map(s=>`<article class="schedule-card"><span class="schedule-state ${s.active?"active":"blocked"}">${s.active?"Actief":"Uit"}</span><div><strong>${esc(s.name)}</strong><small>${esc(s.playlists?.name||"Afspeellijst")} · ${esc(scheduleDays(s.days_of_week))}</small><em>${esc(shortTime(s.start_time))} – ${esc(shortTime(s.end_time))}</em></div><div class="schedule-actions"><button class="small-action" data-edit-schedule="${esc(s.id)}">Bewerken</button><button class="small-action" data-toggle-schedule="${esc(s.id)}">${s.active?"Uitschakelen":"Inschakelen"}</button><button class="small-action danger" data-delete-schedule="${esc(s.id)}">Verwijderen</button></div></article>`).join("")}</div>`:'<div class="empty">Nog geen planning ingesteld.</div>'}</section>`;
}
function bindContentPage(){
  document.getElementById("upload-media")?.addEventListener("click",()=>document.getElementById("media-file")?.click());
  document.getElementById("media-file")?.addEventListener("change",e=>e.target.files?.[0]&&uploadMediaFile(e.target.files[0]));
  document.querySelectorAll("[data-preview-media]").forEach(b=>b.onclick=()=>previewMedia(b.dataset.previewMedia));
  document.querySelectorAll("[data-rename-media]").forEach(b=>b.onclick=()=>renameMedia(b.dataset.renameMedia));
  document.querySelectorAll("[data-delete-media]").forEach(b=>b.onclick=()=>deleteMedia(b.dataset.deleteMedia));
  document.getElementById("new-playlist")?.addEventListener("click",renderNewPlaylistModal);
  document.querySelectorAll("[data-edit-playlist]").forEach(b=>b.onclick=()=>renderPlaylistModal(b.dataset.editPlaylist));
  document.querySelectorAll("[data-delete-playlist]").forEach(b=>b.onclick=()=>deletePlaylist(b.dataset.deletePlaylist));
  document.getElementById("new-schedule")?.addEventListener("click",renderScheduleModal);
  document.querySelectorAll("[data-edit-schedule]").forEach(b=>b.onclick=()=>renderScheduleModal(contentSchedules.find(s=>s.id===b.dataset.editSchedule)));\n  document.querySelectorAll("[data-toggle-schedule]").forEach(b=>b.onclick=()=>toggleSchedule(b.dataset.toggleSchedule));
  document.querySelectorAll("[data-delete-schedule]").forEach(b=>b.onclick=()=>deleteSchedule(b.dataset.deleteSchedule));
}
async function fileToBase64(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary="";
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
}
async function uploadMediaFile(file){
  if(!file.type.startsWith("image/")&&!file.type.startsWith("video/")){error="Kies een afbeelding of video.";renderCustomerDashboard();return}
  if(file.size>104857600){error="Dit bestand is groter dan 100 MB.";renderCustomerDashboard();return}
  contentBusy=true;error="";renderCustomerDashboard();
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,"-").slice(-100)||"media";
  const path=identity.organizationId+"/"+crypto.randomUUID()+"-"+safeName;
  try{
    const dataBase64=await fileToBase64(file);
    if(window.__TAURI__?.core?.invoke){
      await window.__TAURI__.core.invoke("supabase_upload",{path:"/storage/v1/object/screenflow-media/"+storageRoute(path),dataBase64,contentType:file.type,token:session.access_token});
    }else{
      const response=await fetch(SUPABASE_URL+"/storage/v1/object/screenflow-media/"+storageRoute(path),{method:"POST",headers:{...apiHeaders(), "Content-Type":file.type,"x-upsert":"false"},body:file});
      if(!response.ok)throw new Error((await response.json().catch(()=>null))?.message||"Upload mislukt");
    }
    await request("/rest/v1/media_items",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({organization_id:identity.organizationId,uploaded_by:session.user.id,name:file.name,storage_path:path,mime_type:file.type,size_bytes:file.size})});
    await Promise.all([loadMediaItems(),loadPlaylists()]);
  }catch(e){error="Upload mislukt: "+contentErrorMessage(e)}
  contentBusy=false;renderCustomerDashboard();
}
function previewMedia(id){
  const item=mediaItems.find(m=>m.id===id);if(!item)return;
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><div class="modal media-modal"><div class="modal-title"><div><p class="eyebrow">${mediaKind(item).toUpperCase()}</p><h2>${esc(item.name)}</h2></div><button id="close">×</button></div><div class="large-media-preview">${mediaPreview(item)}</div><div class="modal-actions"><button class="primary" id="media-done">Klaar</button></div></div></div>`;
  const close=()=>document.getElementById("modal-root").innerHTML="";
  document.getElementById("close").onclick=close;document.getElementById("media-done").onclick=close;document.getElementById("modal-bg").onclick=e=>{if(e.target.id==="modal-bg")close()};
}
async function renameMedia(id){
  const item=mediaItems.find(m=>m.id===id);if(!item)return;
  const name=prompt("Nieuwe naam voor dit mediabestand:",item.name);
  if(!name||!name.trim()||name.trim()===item.name)return;
  try{
    await request("/rest/v1/media_items?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({name:name.trim(),updated_at:new Date().toISOString()})});
    await Promise.all([loadMediaItems(),loadPlaylists()]);renderCustomerDashboard();
  }catch(e){error="Hernoemen mislukt: "+contentErrorMessage(e);renderCustomerDashboard()}
}
async function deleteMedia(id){
  const item=mediaItems.find(m=>m.id===id);if(!item||!confirm("Media verwijderen? Het verdwijnt ook uit afspeellijsten."))return;
  try{
    await request("/storage/v1/object/screenflow-media/"+storageRoute(item.storage_path),{method:"DELETE"});
    await request("/rest/v1/media_items?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:{Prefer:"return=minimal"}});
    await Promise.all([loadMediaItems(),loadPlaylists(),loadContentSchedules()]);renderCustomerDashboard();
  }catch(e){error="Verwijderen mislukt: "+contentErrorMessage(e);renderCustomerDashboard()}
}
function modalCloseBindings(){
  const close=()=>document.getElementById("modal-root").innerHTML="";
  document.getElementById("close")?.addEventListener("click",close);
  document.getElementById("cancel")?.addEventListener("click",close);
  document.getElementById("modal-bg")?.addEventListener("click",e=>{if(e.target.id==="modal-bg")close()});
}
function renderNewPlaylistModal(){
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="playlist-create-form"><div class="modal-title"><div><p class="eyebrow">NIEUWE AFSPEELLIJST</p><h2>Naam kiezen</h2></div><button type="button" id="close">×</button></div><label>Naam<input id="playlist-name" minlength="1" maxlength="120" required placeholder="Bijvoorbeeld: Weekaanbiedingen"></label><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="playlist-create">Aanmaken</button></div></form></div>`;
  modalCloseBindings();document.getElementById("playlist-create-form").onsubmit=createPlaylist;
}
async function createPlaylist(e){
  e.preventDefault();const button=document.getElementById("playlist-create");button.disabled=true;
  try{
    const rows=await request("/rest/v1/playlists",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({organization_id:identity.organizationId,created_by:session.user.id,name:document.getElementById("playlist-name").value.trim()})});
    await loadPlaylists();renderPlaylistModal(rows?.[0]?.id||playlists[0]?.id);
  }catch(err){const p=document.getElementById("modal-error");p.textContent="Aanmaken mislukt: "+contentErrorMessage(err);p.classList.remove("hidden");button.disabled=false}
}
function renderPlaylistModal(id){
  const p=playlists.find(x=>x.id===id);if(!p)return;
  const items=p.playlist_items||[];
  document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><div class="modal playlist-modal"><div class="modal-title"><div><p class="eyebrow">AFSPEELLIJST</p><h2>${esc(p.name)}</h2></div><button type="button" id="close">×</button></div><div class="playlist-add"><select id="playlist-media-select">${mediaItems.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</select><label>Seconden<input id="playlist-media-duration" type="number" min="1" max="86400" value="10"></label><button class="primary" id="playlist-add-media">Toevoegen</button></div><div class="playlist-item-list">${items.length?items.map((item,index)=>`<div class="playlist-item"><span>${index+1}</span><div><strong>${esc(item.media_items?.name||"Verwijderde media")}</strong><small>${mediaKind(item.media_items||{})}</small></div><label><input data-item-duration="${esc(item.id)}" type="number" min="1" max="86400" value="${Number(item.duration_seconds||10)}"> sec.</label><div><button class="small-action" data-item-up="${esc(item.id)}" ${index===0?"disabled":""}>↑</button><button class="small-action" data-item-down="${esc(item.id)}" ${index===items.length-1?"disabled":""}>↓</button><button class="small-action danger" data-item-delete="${esc(item.id)}">×</button></div></div>`).join(""):'<div class="empty compact-empty">Voeg media toe aan deze lijst.</div>'}</div><div class="modal-actions"><button class="primary" id="playlist-done">Klaar</button></div></div></div>`;
  modalCloseBindings();document.getElementById("playlist-done").onclick=()=>{document.getElementById("modal-root").innerHTML="";renderCustomerDashboard()};
  document.getElementById("playlist-add-media").onclick=()=>addPlaylistItem(id);
  document.querySelectorAll("[data-item-duration]").forEach(input=>input.onchange=()=>updatePlaylistDuration(id,input.dataset.itemDuration,input.value));
  document.querySelectorAll("[data-item-up]").forEach(b=>b.onclick=()=>movePlaylistItem(id,b.dataset.itemUp,-1));
  document.querySelectorAll("[data-item-down]").forEach(b=>b.onclick=()=>movePlaylistItem(id,b.dataset.itemDown,1));
  document.querySelectorAll("[data-item-delete]").forEach(b=>b.onclick=()=>deletePlaylistItem(id,b.dataset.itemDelete));
}
async function addPlaylistItem(playlistId){
  const p=playlists.find(x=>x.id===playlistId);const mediaId=document.getElementById("playlist-media-select").value;
  const duration=Math.max(1,Number(document.getElementById("playlist-media-duration").value||10));
  try{
    await request("/rest/v1/playlist_items",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({playlist_id:playlistId,media_id:mediaId,position:p.playlist_items.length,duration_seconds:duration})});
    await touchPlaylist(playlistId);await loadPlaylists();renderPlaylistModal(playlistId);
  }catch(e){alert("Toevoegen mislukt: "+contentErrorMessage(e))}
}
async function updatePlaylistDuration(playlistId,itemId,value){
  try{
    await request("/rest/v1/playlist_items?id=eq."+encodeURIComponent(itemId),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({duration_seconds:Math.max(1,Number(value||1))})});
    await touchPlaylist(playlistId);await loadPlaylists();renderPlaylistModal(playlistId);
  }catch(e){alert("Speelduur opslaan mislukt: "+contentErrorMessage(e))}
}
async function movePlaylistItem(playlistId,itemId,direction){
  const p=playlists.find(x=>x.id===playlistId);const items=p.playlist_items;const index=items.findIndex(x=>x.id===itemId);const target=index+direction;
  if(index<0||target<0||target>=items.length)return;
  try{
    await request("/rest/v1/playlist_items?id=eq."+encodeURIComponent(items[index].id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({position:items[target].position})});
    await request("/rest/v1/playlist_items?id=eq."+encodeURIComponent(items[target].id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({position:items[index].position})});
    await touchPlaylist(playlistId);await loadPlaylists();renderPlaylistModal(playlistId);
  }catch(e){alert("Volgorde wijzigen mislukt: "+contentErrorMessage(e))}
}
async function deletePlaylistItem(playlistId,itemId){
  try{
    await request("/rest/v1/playlist_items?id=eq."+encodeURIComponent(itemId),{method:"DELETE",headers:{Prefer:"return=minimal"}});
    await touchPlaylist(playlistId);await loadPlaylists();renderPlaylistModal(playlistId);
  }catch(e){alert("Item verwijderen mislukt: "+contentErrorMessage(e))}
}
async function touchPlaylist(id){
  await request("/rest/v1/playlists?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({updated_at:new Date().toISOString()})});
}
async function deletePlaylist(id){
  if(!confirm("Afspeellijst en gekoppelde planningen verwijderen?"))return;
  try{
    await request("/rest/v1/playlists?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:{Prefer:"return=minimal"}});
    await Promise.all([loadPlaylists(),loadContentSchedules()]);renderCustomerDashboard();
  }catch(e){error="Afspeellijst verwijderen mislukt: "+contentErrorMessage(e);renderCustomerDashboard()}
}
function scheduleConflict(candidate,excludeId=null){return contentSchedules.find(s=>s.id!==excludeId&&s.active&&candidate.active&&(s.days_of_week||[]).some(day=>(candidate.days||[]).includes(day))&&s.start_time<candidate.end&&candidate.start<s.end_time);}
function renderScheduleModal(existing=null){
 const selected=new Set(existing?.days_of_week||[1,2,3,4,5]);
 document.getElementById("modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="schedule-form"><div class="modal-title"><div><p class="eyebrow">${existing?"PLANNING BEWERKEN":"NIEUWE PLANNING"}</p><h2>Wanneer moet hij spelen?</h2></div><button type="button" id="close">×</button></div><label>Naam<input id="schedule-name" maxlength="120" required value="${esc(existing?.name||"")}"></label><label>Afspeellijst<select id="schedule-playlist">${playlists.map(p=>`<option value="${esc(p.id)}" ${p.id===existing?.playlist_id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></label><fieldset class="weekday-field"><legend>Dagen</legend><div class="weekday-grid">${DAY_NAMES.map((name,day)=>`<label><input type="checkbox" name="schedule-day" value="${day}" ${selected.has(day)?"checked":""}><span>${name}</span></label>`).join("")}</div></fieldset><div class="form-row"><label>Begintijd<input id="schedule-start" type="time" value="${shortTime(existing?.start_time||"08:00")}" required></label><label>Eindtijd<input id="schedule-end" type="time" value="${shortTime(existing?.end_time||"18:00")}" required></label></div><label class="check-row"><input id="schedule-active" type="checkbox" ${existing?existing.active?"checked":"":"checked"}> Actief</label><p class="login-error hidden" id="modal-error"></p><div class="modal-actions"><button type="button" id="cancel">Annuleren</button><button class="primary" id="schedule-create">Opslaan</button></div></form></div>`;
 modalCloseBindings();document.getElementById("schedule-form").onsubmit=e=>saveSchedule(e,existing);
}
async function saveSchedule(e,existing){
 e.preventDefault();const button=document.getElementById("schedule-create");button.disabled=true;
 try{const days=[...document.querySelectorAll('[name="schedule-day"]:checked')].map(x=>Number(x.value));const start=document.getElementById("schedule-start").value,end=document.getElementById("schedule-end").value,active=document.getElementById("schedule-active").checked;if(!days.length)throw new Error("Kies minimaal één dag.");if(start>=end)throw new Error("De eindtijd moet later zijn dan de begintijd.");const value={playlist_id:document.getElementById("schedule-playlist").value,name:document.getElementById("schedule-name").value.trim(),days_of_week:days,start_time:start,end_time:end,active,timezone:"Europe/Amsterdam"};const conflict=scheduleConflict({...value,days},existing?.id);if(conflict)throw new Error("Planningconflict: "+(conflict.playlists?.name||"een andere playlist")+" overlapt deze periode.");if(existing)await request("/rest/v1/content_schedules?id=eq."+encodeURIComponent(existing.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({...value,updated_at:new Date().toISOString()})});else await request("/rest/v1/content_schedules",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({...value,organization_id:identity.organizationId,created_by:session.user.id})});document.getElementById("modal-root").innerHTML="";await loadContentSchedules();renderCustomerDashboard();
 }catch(err){const p=document.getElementById("modal-error");p.textContent="Planning opslaan mislukt: "+contentErrorMessage(err);p.classList.remove("hidden");button.disabled=false}
}
async function toggleSchedule(id){
  const schedule=contentSchedules.find(s=>s.id===id);if(!schedule)return;
  try{
    await request("/rest/v1/content_schedules?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({active:!schedule.active,updated_at:new Date().toISOString()})});
    await loadContentSchedules();renderCustomerDashboard();
  }catch(e){error="Planning wijzigen mislukt: "+contentErrorMessage(e);renderCustomerDashboard()}
}
async function deleteSchedule(id){
  if(!confirm("Deze planning verwijderen?"))return;
  try{
    await request("/rest/v1/content_schedules?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:{Prefer:"return=minimal"}});
    await loadContentSchedules();renderCustomerDashboard();
  }catch(e){error="Planning verwijderen mislukt: "+contentErrorMessage(e);renderCustomerDashboard()}
}
