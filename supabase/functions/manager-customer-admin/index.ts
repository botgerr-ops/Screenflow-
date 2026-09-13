import { createClient } from "jsr:@supabase/supabase-js@2";

const FUNCTION_VERSION = "screenflow-admin-v6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
function json(body: unknown, status = 200) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : { data: body };
  if (typeof value.message === "string") value.message = `[${FUNCTION_VERSION}] ${value.message}`;
  return new Response(JSON.stringify({ function_version: FUNCTION_VERSION, ...value }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let value = "";
  for (const number of bytes) value += chars[number % chars.length];
  return value.slice(0, 5) + "!" + value.slice(5, 10) + "7" + value.slice(10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ message: "Serverconfiguratie ontbreekt" }, 500);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ message: "Niet ingelogd" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ message: "Ongeldige sessie" }, 401);

    const body = await req.json();
    if (body.action === "complete_password_change") {
      const role = String(authData.user.app_metadata?.role || "").toLowerCase();
      if (role !== "customer_admin") return json({ message: "Alleen een klantbeheerder kan deze stap afronden" }, 403);
      const { error } = await admin.auth.admin.updateUserById(authData.user.id, {
        app_metadata: { ...authData.user.app_metadata, force_password_change: false },
      });
      if (error) throw error;
      return json({ ok: true, password_change_completed: true });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    let rpcManager = false;
    if (anonKey) {
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await userClient.rpc("is_manager");
      rpcManager = data === true;
    }
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role").eq("user_id", authData.user.id).maybeSingle();
    const profileManager = String(profile?.role || "").trim().toLowerCase() === "manager";
    if (!rpcManager && !profileManager) {
      return json({
        message: `Geen managerrechten voor ${authData.user.email || authData.user.id}; profielrol: ${profileError ? "niet leesbaar" : (profile?.role || "ontbreekt")}`,
      }, 403);
    }

    if (body.action !== "issue_temporary_access") return json({ message: "Ongeldige actie" }, 400);
    const organizationId = String(body.organization_id || "");
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !organizationId) return json({ message: "Controleer klant en e-mailadres" }, 400);
    const temporaryPassword = randomPassword();
    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === email);
    let created = false;
    let membership = null;
    if (user) {
      const { data: existingProfile } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
      if (existingProfile?.role === "manager" || user.app_metadata?.role === "manager") {
        return json({ message: "Dit e-mailadres hoort bij een Manager-account. Gebruik een ander klantadres." }, 409);
      }
      const membershipResult = await admin.from("organization_members").select("organization_id").eq("user_id", user.id).maybeSingle();
      membership = membershipResult.data;
      if (membership && membership.organization_id !== organizationId) {
        return json({ message: "Dit e-mailadres hoort al bij een andere klant" }, 409);
      }
      const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        password: temporaryPassword, email_confirm: true,
        user_metadata: { ...user.user_metadata, full_name: fullName },
        app_metadata: { ...user.app_metadata, role: "customer_admin", organization_id: organizationId, force_password_change: true },
      });
      if (error) throw error;
      user = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, password: temporaryPassword, email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { role: "customer_admin", organization_id: organizationId, force_password_change: true },
      });
      if (error) throw error;
      user = data.user;
      created = true;
    }
    if (!membership) {
      const { error } = await admin.from("organization_members").insert({ organization_id: organizationId, user_id: user.id });
      if (error) {
        if (created) await admin.auth.admin.deleteUser(user.id);
        throw error;
      }
    }
    await admin.from("profiles").update({ full_name: fullName }).eq("user_id", user.id);
    return json({ email, temporary_password: temporaryPassword, created });
  } catch (error) {
    console.error("manager-customer-admin", error);
    let message = "Onbekende serverfout";
    if (error instanceof Error) message = error.message;
    else if (typeof error === "string") message = error;
    else if (error && typeof error === "object") {
      const value = error as Record<string, unknown>;
      message = String(value.message || value.error_description || value.details || value.hint || JSON.stringify(value));
    }
    return json({ message }, 400);
  }
});
