import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.57.4";

export const API_VERSION = "narrowvision-player-v1";
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-player-id, x-player-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ api_version: API_VERSION, ...body }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function safeError(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.code, message: error.message }, error.status);
  console.error("player-api internal error", error instanceof Error ? error.name : "unknown");
  return json({ error: "internal_error", message: "Tijdelijke serverfout" }, 500);
}

export function requirePost(req: Request) {
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Alleen POST is toegestaan");
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Content-Type moet application/json zijn");
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new HttpError(400, "invalid_json", "Ongeldige JSON-payload"); }
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new HttpError(500, "server_configuration", "Serverconfiguratie ontbreekt");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function requiredText(body: Record<string, unknown>, key: string, min = 1, max = 200) {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (value.length < min || value.length > max) throw new HttpError(400, "invalid_request", `Ongeldig veld: ${key}`);
  return value;
}

export function optionalText(body: Record<string, unknown>, key: string, max = 200) {
  if (body[key] === undefined || body[key] === null || body[key] === "") return null;
  return requiredText(body, key, 1, max);
}

export function optionalInteger(body: Record<string, unknown>, key: string, min = 0, max = 100000) {
  if (body[key] === undefined || body[key] === null) return null;
  if (!Number.isInteger(body[key]) || Number(body[key]) < min || Number(body[key]) > max) {
    throw new HttpError(400, "invalid_request", `Ongeldig veld: ${key}`);
  }
  return Number(body[key]);
}

function bytesToHex(bytes: Uint8Array) { return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }

export async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function randomPairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, no ambiguous glyphs
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b & 31]).join("");
}

function constantTimeEqual(a: string, b: string) {
  const aa = new TextEncoder().encode(a); const bb = new TextEncoder().encode(b);
  let diff = aa.length ^ bb.length;
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i++) diff |= (aa[i % aa.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  return diff === 0;
}

export async function verifySecretHash(secret: string, expectedHash: string) {
  return secret.length >= 40 && secret.length <= 200 && constantTimeEqual(await sha256(secret), expectedHash);
}

export type PlayerRow = {
  id: string; device_uid: string; player_secret_hash: string; organization_id: string | null;
  name: string; status: "pending" | "active" | "blocked"; pairing_code: string | null;
  pairing_code_expires_at: string | null; config_revision: number; last_applied_config_revision: number | null;
};

export async function authenticatePlayer(req: Request, admin: SupabaseClient): Promise<PlayerRow> {
  const playerId = (req.headers.get("x-player-id") || "").trim();
  const secret = req.headers.get("x-player-secret") || "";
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || secret.length < 40 || secret.length > 200) {
    throw new HttpError(401, "invalid_player_credentials", "Ongeldige playergegevens");
  }
  const { data, error } = await admin.from("devices").select(
    "id,device_uid,player_secret_hash,organization_id,name,status,pairing_code,pairing_code_expires_at,config_revision,last_applied_config_revision",
  ).eq("id", playerId).maybeSingle();
  if (error || !data?.player_secret_hash) throw new HttpError(401, "invalid_player_credentials", "Ongeldige playergegevens");
  if (!await verifySecretHash(secret, data.player_secret_hash)) throw new HttpError(401, "invalid_player_credentials", "Ongeldige playergegevens");
  return data as PlayerRow;
}

export async function deliverCommands(admin: SupabaseClient, playerId: string) {
  const { data, error } = await admin.from("player_commands")
    .select("id,type,payload,status,created_at").eq("device_id", playerId).eq("status", "queued").order("created_at").limit(20);
  if (error) throw error;
  const ids = (data || []).map((command) => command.id);
  if (ids.length) {
    const { error: updateError } = await admin.from("player_commands").update({ status: "delivered", delivered_at: new Date().toISOString() })
      .in("id", ids).eq("device_id", playerId).eq("status", "queued");
    if (updateError) throw updateError;
  }
  return (data || []).map((command) => ({ ...command, status: "delivered" }));
}

