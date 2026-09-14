import { adminClient, corsHeaders, HttpError, json, optionalInteger, optionalText, randomPairingCode, randomSecret, readJson, requiredText, requirePost, safeError, sha256, verifySecretHash } from "../_shared/player.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    requirePost(req);
    const body = await readJson(req);
    const deviceUid = requiredText(body, "device_uid", 16, 200);
    const metadata = {
      platform: requiredText(body, "platform", 2, 40), manufacturer: optionalText(body, "manufacturer", 120),
      model: optionalText(body, "model", 120), os_version: optionalText(body, "os_version", 80),
      sdk_version: optionalInteger(body, "sdk_version"), firmware_version: optionalText(body, "firmware_version", 120),
      app_version: optionalText(body, "app_version", 80),
    };
    const admin = adminClient();
    const forwarded = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
    const fingerprint = await sha256(`${forwarded}|${(req.headers.get("user-agent") || "unknown").slice(0, 200)}`);
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count, error: countError } = await admin.from("player_bootstrap_attempts").select("id", { count: "exact", head: true })
      .eq("fingerprint_hash", fingerprint).gte("attempted_at", since);
    if (countError) throw countError;
    const { data: attemptRow, error: attemptError } = await admin.from("player_bootstrap_attempts")
      .insert({ fingerprint_hash: fingerprint }).select("id").single();
    if (attemptError) throw attemptError;
    if ((count || 0) >= 10) throw new HttpError(429, "rate_limited", "Te veel registratiepogingen; probeer later opnieuw");

    const { data: existing, error: findError } = await admin.from("devices")
      .select("id,status,player_secret_hash,pairing_code_expires_at").eq("device_uid", deviceUid).maybeSingle();
    if (findError) throw findError;
    if (existing) {
      const suppliedSecret = req.headers.get("x-player-secret") || "";
      if (!existing.player_secret_hash || !await verifySecretHash(suppliedSecret, existing.player_secret_hash)) {
        throw new HttpError(409, "device_already_registered", "Device is al geregistreerd");
      }
      return json({ player_id: existing.id, status: existing.status, pairing_code_expires_at: existing.pairing_code_expires_at, already_registered: true });
    }

    const { count: pendingCount, error: pendingCountError } = await admin.from("devices").select("id", { count: "exact", head: true })
      .is("organization_id", null).eq("status", "pending").gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
    if (pendingCountError) throw pendingCountError;
    if ((pendingCount || 0) >= 500) throw new HttpError(503, "registration_capacity", "Registratie tijdelijk niet beschikbaar");

    const secret = randomSecret(); const secretHash = await sha256(secret);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const pairingCode = randomPairingCode();
      const { data, error } = await admin.from("devices").insert({
        device_uid: deviceUid, player_secret_hash: secretHash, player_secret_updated_at: new Date().toISOString(),
        pairing_code: pairingCode, pairing_code_expires_at: expiresAt, status: "pending", organization_id: null,
        name: `${metadata.manufacturer || metadata.platform} ${metadata.model || "player"}`.slice(0, 160), ...metadata,
      }).select("id,status,pairing_code,pairing_code_expires_at").single();
      if (!error) {
        await admin.from("player_bootstrap_attempts").update({ created_device: true }).eq("id", attemptRow.id);
        return json({ player_id: data.id, player_secret: secret, pairing_code: data.pairing_code, pairing_code_expires_at: data.pairing_code_expires_at, status: data.status }, 201);
      }
      if (error.code !== "23505") throw error;
    }
    throw new HttpError(503, "registration_retry", "Registratie tijdelijk niet beschikbaar");
  } catch (error) { return safeError(error); }
});

