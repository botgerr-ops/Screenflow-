-- NarrowVision TEST only. Applied to project bqapbwsvfofgnfogwhdx on 2026-09-20.
-- Apply only after the customer safe-unpair schema/function has been installed.
-- The previous function read request.jwt.claim.role exclusively, but newer
-- service-role API keys may provide only request.jwt.claims JSON. The physical
-- player therefore received HTTP 409 unpair_ack_failed instead of completion.
-- auth.role() validates the role from the signed PostgREST JWT context using
-- the legacy GUC with a JSON claims fallback. Do not use current_user in a
-- SECURITY DEFINER function (it would identify the definer instead).
-- No production deployment or automatic migration has been requested.
CREATE OR REPLACE FUNCTION public.nv_player_complete_device_unpair(p_device uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_device public.devices%rowtype;
  v_request public.nv_device_unpair_requests%rowtype;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Alleen de geauthenticeerde playerservice mag ontkoppeling voltooien' USING ERRCODE='42501';
  END IF;
  SELECT d.* INTO v_device FROM public.devices d WHERE d.id=p_device FOR UPDATE;
  IF NOT FOUND OR v_device.status<>'blocked' OR v_device.organization_id IS NULL THEN
    RAISE EXCEPTION 'Geen openstaande ontkoppeling voor deze player' USING ERRCODE='23514';
  END IF;
  SELECT r.* INTO v_request FROM public.nv_device_unpair_requests r
    WHERE r.device_id=p_device AND r.organization_id=v_device.organization_id AND r.status='requested' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ontkoppelingsverzoek ontbreekt' USING ERRCODE='23514'; END IF;
  UPDATE public.player_commands c SET status='failed',failed_at=now(),error_message='Scherm is ontkoppeld'
    WHERE c.device_id=p_device AND c.status IN ('queued','delivered','acknowledged');
  DELETE FROM public.player_playlist_assignments a WHERE a.device_id=p_device;
  UPDATE public.devices d SET organization_id=NULL,status='pending',pairing_code=NULL,pairing_code_expires_at=NULL,
    current_playlist_id=NULL,last_sync_at=NULL,last_applied_config_revision=NULL,config_revision=0,
    location=NULL
    WHERE d.id=p_device AND d.organization_id=v_request.organization_id AND d.status='blocked';
  UPDATE public.nv_device_unpair_requests r SET status='completed',completed_at=now() WHERE r.id=v_request.id;
  RETURN jsonb_build_object('device_id',p_device,'request_id',v_request.id,'status','completed');
END;
$function$;

-- Verification performed in TEST with a rollback-only call using
-- request.jwt.claims={"role":"service_role"}: completion succeeds.
-- With request.jwt.claims={"role":"authenticated"}: SQLSTATE 42501.
-- Actual player confirmed request completed, status pending, license usage 0/1,
-- pairing_code present. Never embed real pairing codes or player secrets here.
