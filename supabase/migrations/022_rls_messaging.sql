-- 022_rls_messaging.sql
-- RLS policies for messaging

-- ============================================
-- MESSAGING
-- ============================================
CREATE POLICY "conversations_read" ON conversations
  FOR SELECT USING (EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "conversations_create" ON conversations
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "conversations_update" ON conversations
  FOR UPDATE USING (EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid() AND cm.role IN ('admin', 'owner') AND cm.left_at IS NULL)) WITH CHECK (EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid() AND cm.role IN ('admin', 'owner') AND cm.left_at IS NULL));

CREATE POLICY "conversation_members_read" ON conversation_members
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = conversation_members.conversation_id AND cm2.user_id = auth.uid() AND cm2.left_at IS NULL));

CREATE POLICY "conversation_members_write" ON conversation_members
  FOR ALL USING (EXISTS(SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = conversation_members.conversation_id AND cm2.user_id = auth.uid() AND cm2.role IN ('admin', 'owner') AND cm2.left_at IS NULL)) WITH CHECK (EXISTS(SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = conversation_members.conversation_id AND cm2.user_id = auth.uid() AND cm2.role IN ('admin', 'owner') AND cm2.left_at IS NULL));

-- Self-manage membership
CREATE POLICY "conversation_members_self_leave" ON conversation_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "messages_read" ON messages
  FOR SELECT USING (EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "messages_create" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL)
  );

CREATE POLICY "messages_update" ON messages
  FOR UPDATE USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages_delete" ON messages
  FOR DELETE USING (sender_id = auth.uid());

CREATE POLICY "message_attachments_read" ON message_attachments
  FOR SELECT USING (EXISTS(SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_attachments.message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "message_attachments_write" ON message_attachments
  FOR ALL USING (EXISTS(SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_attachments.message_id AND m.sender_id = auth.uid() AND cm.left_at IS NULL)) WITH CHECK (EXISTS(SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_attachments.message_id AND m.sender_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "message_reactions_read" ON message_reactions
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "message_reactions_write" ON message_reactions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "message_read_receipts_read" ON message_read_receipts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "message_read_receipts_write" ON message_read_receipts
  FOR INSERT WITH CHECK (user_id = auth.uid());