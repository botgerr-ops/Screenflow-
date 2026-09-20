import { adminClient, authenticatePlayer, corsHeaders, deliverCommands, HttpError, json, optionalInteger, optionalText, randomPairingCode, readJson, requirePost, safeError } from "../_shared/player.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    requirePost(req); const body = await readJson(req); const admin = adminClient();
    const player = await authenticatePlayer(req, admin);
    const isActive = player.status === "active" && !!player.organization_id;
    const update: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(), manufacturer: optionalText(body, "manufacturer", 120),
      model: optionalText(body, "model", 120), os_version: optionalText(body, "os_version", 80),
      sdk_version: optionalInteger(body, "sdk_version"), firmware_version: optionalText(body, "firmware_version", 120),
      app_version: optionalText(body, "app_version", 80),
    };
    Object.keys(update).forEach((key) => update[key] === null && delete update[key]);
    const appliedRevision = optionalInteger(body, "config_revision", 0, Number.MAX_SAFE_INTEGER);
    if (isActive && appliedRevision !== null) update.last_applied_config_revision = appliedRevision;
    if (isActive && body.sync_succeeded === true) update.last_sync_at = new Date().toISOString();
    const playlistId = body.current_playlist_id;
    if (!isActive) {
      // First heartbeat after unlink still carries the old playlist ID. Never return 400:
      // the device must receive pending/paired=false to erase that old tenant's media.
      update.current_playlist_id = null;
    } else if (playlistId !== undefined && playlistId !== null) {
      if (typeof playlistId !== "string") throw new HttpError(400, "invalid_playlist", "Ongeldige playlist");
      const { data: playlist } = await admin.from("playlists").select("id").eq("id", playlistId).eq("organization_id", player.organization_id).maybeSingle();
      if (!playlist) throw new HttpError(400, "invalid_playlist", "Ongeldige playlist");
      update.current_playlist_id = playlistId;
    } else if (playlistId === null) update.current_playlist_id = null;
    // Never let an in-flight active heartbeat overwrite a concurrent unpair transaction.
    let updateQuery = admin.from("devices").update(update).eq("id", player.id).eq("status", player.status);
    updateQuery = player.organization_id ? updateQuery.eq("organization_id", player.organization_id) : updateQuery.is("organization_id", null);
    const { data: updated, error } = await updateQuery.select("id").maybeSingle();
    if (error) throw error;
    if (!updated) throw new HttpError(409, "pairing_state_changed", "Playerstatus is gewijzigd; synchroniseer opnieuw");

    let pairing: Record<string, unknown> = {};
    if (player.status === "pending" && !player.organization_id) {
      const { data: current, error: readError } = await admin.from("devices")
        .select("pairing_code,pairing_code_expires_at")
        .eq("id", player.id).eq("status", "pending").is("organization_id", null).maybeSingle();
      if (readError || !current) throw new HttpError(409, "pairing_state_changed", "Playerstatus is gewijzigd");
      let code = current.pairing_code;
      let expiry = current.pairing_code_expires_at;
      if (!code || !expiry || Date.parse(expiry) <= Date.now() + 30_000) {
        let renewed = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = randomPairingCode();
          const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
          const result = await admin.from("devices")
            .update({ pairing_code: candidate, pairing_code_expires_at: expiresAt })
            .eq("id", player.id).eq("status", "pending").is("organization_id", null)
            .select("pairing_code,pairing_code_expires_at").maybeSingle();
          if (!result.error && result.data) { code = result.data.pairing_code; expiry = result.data.pairing_code_expires_at; renewed = true; break; }
          if (result.error?.code !== "23505") throw new HttpError(409, "pairing_state_changed", "Koppelcode vernieuwen mislukt");
        }
        if (!renewed) throw new HttpError(503, "pairing_retry", "Koppelcode vernieuwen mislukt");
      }
      pairing = { pairing_code: code, pairing_code_expires_at: expiry };
    }
    const commands = isActive ? await deliverCommands(admin, player.id) : [];
    const knownRevision = appliedRevision ?? player.last_applied_config_revision;
    return json({ status: player.status, paired: !!player.organization_id, server_time: new Date().toISOString(),
      config_revision: player.config_revision, config_update_available: knownRevision !== player.config_revision,
      open_commands: commands.length, commands, ...pairing });
  } catch (error) { return safeError(error); }
});
