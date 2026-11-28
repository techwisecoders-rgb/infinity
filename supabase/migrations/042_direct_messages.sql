CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_pair_created
  ON public.direct_messages(sender_id, recipient_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_created
  ON public.direct_messages(recipient_id, sender_id, created_at ASC);
