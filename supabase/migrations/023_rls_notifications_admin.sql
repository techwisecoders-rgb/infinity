-- 023_rls_notifications_admin.sql
-- RLS policies for notifications, admin, media processing, search

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE POLICY "notifications_self" ON notifications
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences_self" ON notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_self" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- REPORTS & MODERATION
-- ============================================
CREATE POLICY "reports_create" ON reported_content
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "reports_read_reporter" ON reported_content
  FOR SELECT USING (reporter_id = auth.uid());

CREATE POLICY "reports_read_moderator" ON reported_content
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "reports_update_moderator" ON reported_content
  FOR UPDATE USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "moderation_actions_read_moderator" ON moderation_actions
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "moderation_actions_write_moderator" ON moderation_actions
  FOR INSERT WITH CHECK (is_admin_or_moderator(auth.uid()) AND moderator_id = auth.uid());

-- ============================================
-- ADMIN & AUDIT
-- ============================================
CREATE POLICY "audit_logs_read_admin" ON audit_logs
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "admin_roles_read_admin" ON admin_roles
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "admin_roles_write_superadmin" ON admin_roles
  FOR ALL USING (
    EXISTS(SELECT 1 FROM admin_roles WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = TRUE)
  ) WITH CHECK (
    EXISTS(SELECT 1 FROM admin_roles WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = TRUE)
  );

CREATE POLICY "platform_settings_read_public" ON platform_settings
  FOR SELECT USING (is_public = true);

CREATE POLICY "platform_settings_read_admin" ON platform_settings
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "platform_settings_write_admin" ON platform_settings
  FOR ALL USING (is_admin_or_moderator(auth.uid()) AND updated_by = auth.uid()) WITH CHECK (is_admin_or_moderator(auth.uid()) AND updated_by = auth.uid());

-- ============================================
-- MEDIA PROCESSING & STORAGE
-- ============================================
CREATE POLICY "media_processing_read_owner" ON media_processing_jobs
  FOR SELECT USING (EXISTS(SELECT 1 FROM media WHERE id = media_processing_jobs.media_id AND owner_id = auth.uid()));

CREATE POLICY "media_processing_write_system" ON media_processing_jobs
  FOR ALL USING (false); -- Only system/service role can write

CREATE POLICY "upload_sessions_self" ON media_upload_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "storage_usage_self" ON storage_usage
  FOR SELECT USING (user_id = auth.uid());

-- ============================================
-- SEARCH & TRENDING
-- ============================================
CREATE POLICY "search_history_self" ON search_history
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "trending_hashtags_read" ON trending_hashtags
  FOR SELECT USING (true);

CREATE POLICY "post_views_read" ON post_views
  FOR SELECT USING (viewer_id = auth.uid() OR EXISTS(SELECT 1 FROM posts p WHERE p.id = post_views.post_id AND p.author_id = auth.uid()));