import {createClient} from 'jsr:@supabase/supabase-js@2.57.4';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
const hex=(bytes:Uint8Array)=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const same=(a:string,b:string)=>{let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=a.charCodeAt(i%(a.length||1))^b.charCodeAt(i%(b.length||1));return d===0;};

Deno.serve(async req=>{
 if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
 try{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply(503,{error:'configuration_unavailable'});
  const id=req.headers.get('X-Player-Id')||'',secret=req.headers.get('X-Player-Secret')||'';
  if(!UUID.test(id)||secret.length<40||secret.length>200)return reply(401,{error:'invalid_credentials'});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:device,error:deviceError}=await admin.from('devices').select('id,player_secret_hash').eq('id',id).maybeSingle();
  if(deviceError)throw deviceError;
  if(!device?.player_secret_hash)return reply(401,{error:'invalid_credentials'});
  const digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))));
  if(!same(digest,device.player_secret_hash))return reply(401,{error:'invalid_credentials'});
  const raw=await req.text();if(raw.length>2048)return reply(413,{error:'request_too_large'});
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}
  catch{return reply(400,{error:'invalid_json'});}
  const commandId=body.command_id,status=body.status,reason=body.reason||'';
  if(typeof commandId!=='string'||!UUID.test(commandId)||!['acknowledged','completed','failed'].includes(String(status))
    ||typeof reason!=='string'||reason.length>80||!/^([a-z0-9_]+)?$/.test(reason))return reply(400,{error:'invalid_status'});
  const {data:command,error:readError}=await admin.from('player_commands')
    .select('id,status').eq('id',commandId).eq('device_id',id).eq('type','update').maybeSingle();
  if(readError)throw readError;
  if(!command)return reply(404,{error:'command_not_found'});
  if(command.status===status)return reply(200,{ok:true,status});
  if(!['delivered','acknowledged'].includes(command.status) ||
      (status==='acknowledged'&&command.status!=='delivered'))return reply(409,{error:'invalid_transition'});
  const fields:Record<string,unknown>={status};
  if(status==='acknowledged')fields.acknowledged_at=new Date().toISOString();
  if(status==='completed')fields.completed_at=new Date().toISOString();
  if(status==='failed'){fields.failed_at=new Date().toISOString();fields.error_message=reason||'update_failed';}
  const {data:updated,error:writeError}=await admin.from('player_commands').update(fields)
    .eq('id',commandId).eq('device_id',id).eq('status',command.status).select('id').maybeSingle();
  if(writeError)throw writeError;
  if(!updated)return reply(409,{error:'concurrent_update'});
  return reply(200,{ok:true,status});
 }catch(error){console.error('player-update-status',error instanceof Error?error.name:'unknown');return reply(500,{error:'internal_error'});}
});
