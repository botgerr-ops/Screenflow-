import { adminClient, authenticatePlayer, corsHeaders, deliverCommands, HttpError, json, readJson, requirePost, safeError } from "../_shared/player.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    requirePost(req); await readJson(req); const admin = adminClient();
    const player = await authenticatePlayer(req, admin);
    if (player.status !== "active" || !player.organization_id) throw new HttpError(403, "player_not_active", "Player is niet actief gekoppeld");
    const today = new Date().toISOString().slice(0, 10);
    const { data: license, error: licenseError } = await admin.from("licenses").select("status,valid_until")
      .eq("organization_id", player.organization_id).eq("status", "active").gte("valid_until", today).maybeSingle();
    if (licenseError || !license) throw new HttpError(403, "license_inactive", "Licentie is niet actief");
    const { data: schedules, error: scheduleError } = await admin.from("content_schedules")
      .select("id,playlist_id,name,days_of_week,start_time,end_time,timezone,active,updated_at")
      .eq("organization_id", player.organization_id).eq("active", true).order("start_time");
    if (scheduleError) throw scheduleError;
    const playlistIds = [...new Set((schedules || []).map((s) => s.playlist_id))];
    const playlistResult = playlistIds.length ? await admin.from("playlists").select("id,name,updated_at")
      .eq("organization_id", player.organization_id).in("id", playlistIds) : { data: [], error: null };
    if (playlistResult.error) throw playlistResult.error;
    const playlists = playlistResult.data || [];
    const itemResult = playlistIds.length ? await admin.from("playlist_items").select("id,playlist_id,media_id,position,duration_seconds")
      .in("playlist_id", playlistIds).order("position") : { data: [], error: null };
    if (itemResult.error) throw itemResult.error;
    const items = itemResult.data || [];
    const mediaIds = [...new Set(items.map((item) => item.media_id))];
    const mediaResult = mediaIds.length ? await admin.from("media_items").select("id,name,storage_path,mime_type,size_bytes,updated_at")
      .eq("organization_id", player.organization_id).in("id", mediaIds) : { data: [], error: null };
    if (mediaResult.error) throw mediaResult.error;
    const media = mediaResult.data || [];
    const signedMedia = [];
    for (const item of media) {
      const { data, error } = await admin.storage.from("screenflow-media").createSignedUrl(item.storage_path, 900);
      if (error) throw error;
      signedMedia.push({ media_id: item.id, name: item.name, mime_type: item.mime_type, size_bytes: item.size_bytes,
        updated_at: item.updated_at, signed_url: data.signedUrl, expires_in: 900 });
    }
    const commands = await deliverCommands(admin, player.id);
    return json({ player_id: player.id, organization_id: player.organization_id, player_name: player.name,
      server_time: new Date().toISOString(), config_revision: player.config_revision,
      manifest: { schedules, playlists, playlist_items: items, media: signedMedia }, commands,
      scheduling_notes: { priority_model: "not_implemented", player_evaluates_timezone: true } });
  } catch (error) { return safeError(error); }
});

