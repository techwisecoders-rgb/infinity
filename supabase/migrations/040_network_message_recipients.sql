-- 040_network_message_recipients.sql
-- Support targeted recipients (null = everyone, array of UUIDs = selected supporters) on network_messages.

ALTER TABLE public.network_messages
  ADD COLUMN IF NOT EXISTS recipient_ids JSONB;
