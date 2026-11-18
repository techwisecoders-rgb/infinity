-- 019_rls_posts_media.sql
-- RLS policies for posts, media, and interactions

-- ============================================
-- POSTS
-- ============================================
-- Read: respect visibility and privacy
CREATE POLICY "posts_read" ON posts
  FOR SELECT USING (
    deleted_at IS NULL AND published_at IS NOT NULL AND published_at <= NOW() AND (
      visibility = 'public' OR
      (visibility = 'followers' AND EXISTS(
        SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = posts.author_id
      )) OR
      (visibility = 'private' AND author_id = auth.uid()) OR
      author_id = auth.uid()
    ) AND author_id NOT IN (
      SELECT blocked_id FROM blocked_users WHERE blocker_id = auth.uid()
    ) AND author_id NOT IN (
      SELECT blocker_id FROM blocked_users WHERE blocked_id = auth.uid()
    )
  );

-- Create: authenticated users
CREATE POLICY "posts_create" ON posts
  FOR INSERT WITH CHECK (author_id = auth.uid());

-- Update: own posts only
CREATE POLICY "posts_update" ON posts
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

-- Delete: own posts only
CREATE POLICY "posts_delete" ON posts
  FOR DELETE USING (author_id = auth.uid());

-- Admin can delete any post
CREATE POLICY "posts_admin_delete" ON posts
  FOR DELETE USING (is_admin_or_moderator(auth.uid()));

-- ============================================
-- MEDIA
-- ============================================
CREATE POLICY "media_read_owner" ON media
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "media_read_public" ON media
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM post_media pm
      JOIN posts p ON p.id = pm.post_id
      WHERE pm.media_id = media.id
        AND p.deleted_at IS NULL
        AND p.published_at IS NOT NULL
        AND p.published_at <= NOW()
        AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid())
    )
  );

CREATE POLICY "media_create" ON media
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "media_update" ON media
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "media_delete" ON media
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================
-- POST_MEDIA
-- ============================================
CREATE POLICY "post_media_read" ON post_media
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "post_media_write" ON post_media
  FOR ALL USING (
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.author_id = auth.uid())
  ) WITH CHECK (
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.author_id = auth.uid())
  );

-- ============================================
-- LIKES & REACTIONS
-- ============================================
CREATE POLICY "post_likes_read" ON post_likes
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_likes.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "post_likes_write" ON post_likes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "post_reactions_read" ON post_reactions
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_reactions.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "post_reactions_write" ON post_reactions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());