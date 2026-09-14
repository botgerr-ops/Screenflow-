// Integration harness contract. Supply only TEST values through environment variables.
// Never point this script at production and never print PLAYER_SECRET.
import assert from "node:assert/strict";

const baseUrl = process.env.SUPABASE_TEST_URL;
const publishableKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
assert(baseUrl?.includes("bqapbwsvfofgnfogwhdx"), "Refusing non-test Supabase URL");
assert(publishableKey, "SUPABASE_TEST_PUBLISHABLE_KEY is required");

async function call(slug, body, headers = {}) {
  const response = await fetch(`${baseUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publishableKey, ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const uid = `integration-${crypto.randomUUID()}`;
const bootstrap = await call("player-bootstrap", { device_uid: uid, platform: "test", manufacturer: "NarrowVision", model: "Integration" });
assert.equal(bootstrap.status, 201);
assert.equal(typeof bootstrap.body.player_secret, "string");
assert.equal(typeof bootstrap.body.pairing_code, "string");

const auth = { "X-Player-Id": bootstrap.body.player_id, "X-Player-Secret": bootstrap.body.player_secret };
const heartbeat = await call("player-heartbeat", { app_version: "integration" }, auth);
assert.equal(heartbeat.status, 200);

const badSecret = await call("player-heartbeat", {}, { ...auth, "X-Player-Secret": "x".repeat(43) });
assert.equal(badSecret.status, 401);

const pendingConfig = await call("player-config", {}, auth);
assert.equal(pendingConfig.status, 403);

console.log(JSON.stringify({ bootstrap: bootstrap.status, heartbeat: heartbeat.status, bad_secret: badSecret.status, pending_config: pendingConfig.status }));
