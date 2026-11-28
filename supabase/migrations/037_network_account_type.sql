-- 037_network_account_type.sql
-- Scope created networks per account_type (personal / creator / business) so switching accounts switches Build Network.

ALTER TABLE public.networks
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'personal';

CREATE INDEX IF NOT EXISTS idx_networks_owner_account_type
  ON public.networks(owner_id, account_type);
