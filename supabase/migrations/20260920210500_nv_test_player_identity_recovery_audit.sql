-- TEST only: preserve a durable record when a physically present player is
-- recovered after its Android installation unexpectedly registers a new identity.
-- This migration does not change any device, license or playlist state.
CREATE TABLE IF NOT EXISTS public.nv_player_identity_recovery_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_device_id uuid NOT NULL REFERENCES public.devices(id),
  replacement_device_id uuid NOT NULL REFERENCES public.devices(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  playlist_id uuid NOT NULL REFERENCES public.playlists(id),
  reason text NOT NULL,
  recovered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nv_recovery_distinct_devices CHECK (previous_device_id <> replacement_device_id),
  CONSTRAINT nv_recovery_unique_previous UNIQUE (previous_device_id),
  CONSTRAINT nv_recovery_unique_replacement UNIQUE (replacement_device_id)
);
ALTER TABLE public.nv_player_identity_recovery_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nv_player_identity_recovery_audit FROM PUBLIC, anon, authenticated;
