CREATE TABLE IF NOT EXISTS public.myself_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'personal',
  item_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  file_name TEXT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_myself_items_owner_created
  ON public.myself_items(owner_id, account_type, created_at ASC);
