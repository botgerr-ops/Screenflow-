// Recovery sessions stay in memory and never enter the regular dashboard flow.
let recoverySession = null;
let recoveryEmail = '';
let recoveryGeneration = 0;
let recoveryPending = false;
function exitRecovery(){
  recoveryGeneration++; recoverySession=null; recoveryEmail=''; recoveryPending=false;
  error=''; renderLogin();
}
async function recoveryRequest(path,body,token=null,method='POST'){
  if(window.__TAURI__?.core?.invoke)return window.__TAURI__.core.invoke('supabase_request',{method,path,body,token,prefer:null});
  const response=await fetch(SUPABASE_URL+path,{method,headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+(token||SUPABASE_KEY),'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.msg||data?.message||data?.error_description||'Verzoek mislukt');
  return data;
}
function recoveryError(e){
  const message=String(e?.message||e);
  if(/expired|invalid.*token|otp/i.test(message))return 'De herstelcode is onjuist of verlopen. Vraag eventueel een nieuwe code aan.';
  if(/rate|429|seconds|security purposes/i.test(message))return 'Te veel pogingen. Wacht even voordat je het opnieuw probeert.';
  return 'Herstellen mislukt: '+message;
}
function renderRecovery(step='email',message=''){
  const fields=step==='email'?`<label>E-mailadres<input id="recovery-email" type="email" autocomplete="email" required value="${esc(recoveryEmail)}"></label>`:step==='code'?`<p>Als dit adres een account heeft, ontvang je een herstelcode. Controleer ook je spammap.</p><label>Code uit je e-mail<input id="recovery-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required></label>`:`<label>Nieuw wachtwoord<input id="recovery-password" type="password" autocomplete="new-password" minlength="12" required></label><label>Herhaal wachtwoord<input id="recovery-repeat" type="password" autocomplete="new-password" minlength="12" required></label>`;
  app.innerHTML=`<main class="login-screen"><form class="login-card" id="recovery-form">${logo()}<p class="eyebrow">WACHTWOORD HERSTELLEN</p><h1>${step==='password'?'Kies een nieuw wachtwoord.':'Wachtwoord vergeten?'}</h1>${fields}<p id="recovery-error" class="login-error">${esc(message)}</p><button class="primary" id="recovery-submit">${step==='email'?'Herstelcode aanvragen':step==='code'?'Code controleren':'Wachtwoord opslaan'}</button>${step==='code'?'<button class="text-button" type="button" id="recovery-again">Nieuwe code aanvragen / ander adres</button>':''}<button class="text-button" type="button" id="recovery-back">Terug naar inloggen</button></form></main>`;
  document.getElementById('recovery-back').onclick=exitRecovery;
  document.getElementById('recovery-again')?.addEventListener('click',()=>{recoveryGeneration++;recoveryPending=false;renderRecovery()});
  document.getElementById('recovery-form').onsubmit=async e=>{
    e.preventDefault();if(recoveryPending)return;
    const generation=recoveryGeneration;recoveryPending=true;
    const button=document.getElementById('recovery-submit');button.disabled=true;
    try{
      if(step==='email'){
        recoveryEmail=document.getElementById('recovery-email').value.trim();
        await recoveryRequest('/auth/v1/recover',{email:recoveryEmail});
        if(generation===recoveryGeneration)renderRecovery('code');
      }else if(step==='code'){
        const result=await recoveryRequest('/auth/v1/verify',{email:recoveryEmail,token:document.getElementById('recovery-code').value.trim(),type:'recovery'});
        if(generation!==recoveryGeneration)return;
        if(!result?.access_token)throw new Error('Geen geldige herstelsessie ontvangen.');
        recoverySession=result;renderRecovery('password');
      }else{
        const password=document.getElementById('recovery-password').value;
        if(password.length<12||password!==document.getElementById('recovery-repeat').value)throw new Error('Gebruik minimaal 12 tekens en vul tweemaal hetzelfde wachtwoord in.');
        if(!recoverySession?.access_token)throw new Error('Vraag een nieuwe herstelcode aan.');
        if(recoverySession.user?.app_metadata?.force_password_change===true){
          await recoveryRequest('/functions/v1/manager-customer-admin',{action:'complete_password_change',new_password:password},recoverySession.access_token);
        }else{
          await recoveryRequest('/auth/v1/user',{password},recoverySession.access_token,'PUT');
        }
        if(generation!==recoveryGeneration)return;
        await recoveryRequest('/auth/v1/logout?scope=global',{},recoverySession.access_token).catch(()=>{});
        exitRecovery();
        const info=document.createElement('p');info.className='recovery-success';info.textContent='Je wachtwoord is gewijzigd. Log in met je nieuwe wachtwoord.';
        document.getElementById('login-form').prepend(info);
      }
    }catch(err){if(generation===recoveryGeneration){document.getElementById('recovery-error').textContent=recoveryError(err);button.disabled=false}}
    finally{if(generation===recoveryGeneration)recoveryPending=false}
  };
}
