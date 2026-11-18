-- 018_rls_core.sql
-- Core RLS policies: profiles, settings, follows, blocks, mutes

-- ============================================
-- PROFILES
-- ============================================
-- Public profiles readable by everyone (respecting privacy settings)
CREATE POLICY "profiles_public_read" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR
    account_visibility = 'public' OR
    (account_visibility = 'private' AND EXISTS(
      SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = profiles.id
    ))
  );

-- Users can update their own profile (except protected fields)
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any profile
CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE USING (is_admin_or_moderator(auth.uid()));

-- ============================================
-- USER SETTINGS & PRIVACY
-- ============================================
CREATE POLICY "user_settings_self" ON user_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_privacy_settings_self" ON user_privacy_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- FOLLOWS
-- ============================================
CREATE POLICY "follows_read" ON follows
  FOR SELECT USING (
    follower_id = auth.uid() OR following_id = auth.uid() OR
    EXISTS(SELECT 1 FROM profiles WHERE id = follows.following_id AND account_visibility = 'public')
  );

CREATE POLICY "follows_create" ON follows
  FOR INSERT WITH CHECK (follower_id = auth.uid());

CREATE POLICY "follows_delete" ON follows
  FOR DELETE USING (follower_id = auth.uid());

-- ============================================
-- FOLLOW REQUESTS
-- ============================================
CREATE POLICY "follow_requests_requester" ON follow_requests
  FOR SELECT USING (requester_id = auth.uid());

CREATE POLICY "follow_requests_target" ON follow_requests
  FOR SELECT USING (target_id = auth.uid());

CREATE POLICY "follow_requests_create" ON follow_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "follow_requests_update_target" ON follow_requests
  FOR UPDATE USING (target_id = auth.uid());

-- ============================================
-- BLOCKED/MUTED USERS
-- ============================================
CREATE POLICY "blocked_users_self" ON blocked_users
  FOR ALL USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "muted_users_self" ON muted_users
  FOR ALL USING (muter_id = auth.uid()) WITH CHECK (muter_id = auth.uid());