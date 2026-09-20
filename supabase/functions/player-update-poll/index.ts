import { createClient } from 'jsr:@supabase/supabase-js@2.57.4';

// This endpoint uses authenticated per-device secrets, NOT end-user JWTs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
const same = (a: string, b: string) => { let diff = a.length ^ b.length; for(let i=0;i<Math.max(a.length,b.length);i++) diff |= a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i % (b.length || 1)); return diff===0; };

Deno.serve(async request => {
  if (request.method !== 'POST') return reply(405,{error:'method_not_allowed'});
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply(503,{error:'configuration_unavailable'});
    const id = request.headers.get('X-Player-Id') || '';
    const secret = request.headers.get('X-Player-Secret') || '';
    if (!UUID.test(id) || secret.length < 40 || secret.length > 200) return reply(401,{error:'invalid_credentials'});
    const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data: device,error: deviceError} = await admin.from('devices')
      .select('id,organization_id,status,player_secret_hash')
      .eq('id',id).maybeSingle();
    if (deviceError) throw deviceError;
    if (!device?.player_secret_hash) return reply(401,{error:'invalid_credentials'});
    const actual = hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))));
    if (!same(actual,device.player_secret_hash)) return reply(401,{error:'invalid_credentials'});
    if (device.status!=='active' || !device.organization_id) return reply(403,{error:'device_not_active'});
    const {data:org,error:orgError}=await admin.from('organizations').select('deletion_status').eq('id',device.organization_id).maybeSingle();
    if(orgError) throw orgError;
    if(!org || org.deletion_status!=='active') return reply(403,{error:'customer_inactive'});
    const {data:commands,error:commandsError}=await admin.from('player_commands')
      .select('id,payload').eq('device_id',id).eq('type','update').eq('status','delivered')
      .order('created_at',{ascending:false}).limit(1);
    if(commandsError) throw commandsError;
    if(!commands?.length) return reply(200,{commands:[]});
    const command=commands[0],releaseId=command.payload?.release_id;
    if(typeof releaseId!=='string'||!UUID.test(releaseId))return reply(409,{error:'invalid_release_reference'});
    const {data:release,error:releaseError}=await admin.from('nv_player_releases')
      .select('id,version_code,version_name,package_name,storage_path,sha256,size_bytes,status')
      .eq('id',releaseId).eq('status','approved').maybeSingle();
    if(releaseError) throw releaseError;
    if(!release) return reply(409,{error:'release_not_approved'});
    const {data:signed,error:signError}=await admin.storage.from('nv-player-releases').createSignedUrl(release.storage_path,3600);
    if(signError||!signed?.signedUrl)throw signError||new Error('signed_url_missing');
    return reply(200,{commands:[{id:command.id,type:'update',payload:{
      target_version_code:release.version_code,target_version_name:release.version_name,
      package_name:release.package_name,download_url:signed.signedUrl,
      sha256:release.sha256,size_bytes:release.size_bytes
    }}]});
  } catch(error) {
    console.error('player-update-poll',error instanceof Error?error.name:'unknown');
    return reply(500,{error:'internal_error'});
  }
});
