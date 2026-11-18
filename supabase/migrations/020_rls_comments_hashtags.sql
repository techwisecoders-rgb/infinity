-- 020_rls_comments_hashtags.sql
-- RLS policies for comments, hashtags, mentions, stories, polls

-- ============================================
-- COMMENTS
-- ============================================
CREATE POLICY "comments_read" ON comments
  FOR SELECT USING (
    deleted_at IS NULL AND (
      EXISTS(SELECT 1 FROM posts p WHERE p.id = comments.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
    )
  );

CREATE POLICY "comments_create" ON comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid() AND
    EXISTS(SELECT 1 FROM posts p WHERE p.id = comments.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "comments_update" ON comments
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

CREATE POLICY "comments_delete" ON comments
  FOR DELETE USING (author_id = auth.uid());

-- ============================================
-- COMMENT LIKES/REACTIONS
-- ============================================
CREATE POLICY "comment_likes_read" ON comment_likes
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = comment_likes.comment_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "comment_likes_write" ON comment_likes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "comment_reactions_read" ON comment_reactions
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = comment_reactions.comment_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "comment_reactions_write" ON comment_reactions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- SHARES & BOOKMARKS
-- ============================================
CREATE POLICY "post_shares_read" ON post_shares
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM posts p WHERE p.id = post_shares.post_id AND p.deleted_at IS NULL AND p.visibility = 'public'));

CREATE POLICY "post_shares_write" ON post_shares
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "bookmarks_self" ON bookmarks
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- HASHTAGS
-- ============================================
CREATE POLICY "hashtags_read" ON hashtags FOR SELECT USING (true);
CREATE POLICY "hashtags_write" ON hashtags FOR ALL USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "post_hashtags_read" ON post_hashtags FOR SELECT USING (
  EXISTS(SELECT 1 FROM posts p WHERE p.id = post_hashtags.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
);
CREATE POLICY "post_hashtags_write" ON post_hashtags FOR ALL USING (
  EXISTS(SELECT 1 FROM posts p WHERE p.id = post_hashtags.post_id AND p.author_id = auth.uid())
) WITH CHECK (
  EXISTS(SELECT 1 FROM posts p WHERE p.id = post_hashtags.post_id AND p.author_id = auth.uid())
);

-- ============================================
-- MENTIONS
-- ============================================
CREATE POLICY "mentions_read" ON mentions
  FOR SELECT USING (
    mentioned_user_id = auth.uid() OR
    (post_id IS NOT NULL AND EXISTS(SELECT 1 FROM posts p WHERE p.id = mentions.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))) OR
    (comment_id IS NOT NULL AND EXISTS(SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = mentions.comment_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid())))
  );

CREATE POLICY "mentions_write" ON mentions
  FOR INSERT WITH CHECK (true); -- Created by triggers