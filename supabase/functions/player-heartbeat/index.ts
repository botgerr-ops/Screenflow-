import { adminClient, authenticatePlayer, corsHeaders, deliverCommands, HttpError, json, optionalInteger, optionalText, readJson, requirePost, safeError } from "../_shared/player.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    requirePost(req); const body = await readJson(req); const admin = adminClient();
    const player = await authenticatePlayer(req, admin);
    const update: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(), manufacturer: optionalText(body, "manufacturer", 120),
      model: optionalText(body, "model", 120), os_version: optionalText(body, "os_version", 80),
      sdk_version: optionalInteger(body, "sdk_version"), firmware_version: optionalText(body, "firmware_version", 120),
      app_version: optionalText(body, "app_version", 80),
    };
    Object.keys(update).forEach((key) => update[key] === null && delete update[key]);
    const appliedRevision = optionalInteger(body, "config_revision", 0, Number.MAX_SAFE_INTEGER);
    if (appliedRevision !== null) update.last_applied_config_revision = appliedRevision;
    if (body.sync_succeeded === true) update.last_sync_at = new Date().toISOString();
    const playlistId = body.current_playlist_id;
    if (playlistId !== undefined && playlistId !== null) {
      if (typeof playlistId !== "string" || !player.organization_id) throw new HttpError(400, "invalid_playlist", "Ongeldige playlist");
      const { data: playlist } = await admin.from("playlists").select("id").eq("id", playlistId).eq("organization_id", player.organization_id).maybeSingle();
      if (!playlist) throw new HttpError(400, "invalid_playlist", "Ongeldige playlist");
      update.current_playlist_id = playlistId;
    } else if (playlistId === null) update.current_playlist_id = null;
    const { error } = await admin.from("devices").update(update).eq("id", player.id);
    if (error) throw error;
    const commands = await deliverCommands(admin, player.id);
    const knownRevision = appliedRevision ?? player.last_applied_config_revision;
    return json({ status: player.status, paired: !!player.organization_id, server_time: new Date().toISOString(),
      config_revision: player.config_revision, config_update_available: knownRevision !== player.config_revision,
      open_commands: commands.length, commands });
  } catch (error) { return safeError(error); }
});

