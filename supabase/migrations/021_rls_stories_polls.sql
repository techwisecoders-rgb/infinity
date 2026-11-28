-- 021_rls_stories_polls.sql
-- RLS policies for stories, polls

-- ============================================
-- STORIES
-- ============================================
CREATE POLICY "stories_read" ON stories
  FOR SELECT USING (
    expires_at > NOW() AND (
      visibility = 'public' OR
      (visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = stories.author_id)) OR
      author_id = auth.uid()
    ) AND author_id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = auth.uid())
  );

CREATE POLICY "stories_create" ON stories
  FOR INSERT WITH CHECK (author_id = auth.uid());

CREATE POLICY "stories_update" ON stories
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

CREATE POLICY "stories_delete" ON stories
  FOR DELETE USING (author_id = auth.uid());

CREATE POLICY "story_media_read" ON story_media
  FOR SELECT USING (EXISTS(SELECT 1 FROM stories s WHERE s.id = story_media.story_id AND s.expires_at > NOW() AND (s.visibility = 'public' OR (s.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = s.author_id)) OR s.author_id = auth.uid())));

CREATE POLICY "story_media_write" ON story_media
  FOR ALL USING (EXISTS(SELECT 1 FROM stories s WHERE s.id = story_media.story_id AND s.author_id = auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM stories s WHERE s.id = story_media.story_id AND s.author_id = auth.uid()));

CREATE POLICY "story_views_read" ON story_views
  FOR SELECT USING (viewer_id = auth.uid() OR EXISTS(SELECT 1 FROM stories s WHERE s.id = story_views.story_id AND s.author_id = auth.uid()));

CREATE POLICY "story_views_write" ON story_views
  FOR INSERT WITH CHECK (viewer_id = auth.uid());

CREATE POLICY "story_reactions_read" ON story_reactions
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM stories s WHERE s.id = story_reactions.story_id AND s.author_id = auth.uid()));

CREATE POLICY "story_reactions_write" ON story_reactions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- POLLS
-- ============================================
CREATE POLICY "polls_read" ON polls
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM posts p WHERE p.id = polls.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "polls_write" ON polls
  FOR ALL USING (EXISTS(SELECT 1 FROM posts p WHERE p.id = polls.post_id AND p.author_id = auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM posts p WHERE p.id = polls.post_id AND p.author_id = auth.uid()));

CREATE POLICY "poll_options_read" ON poll_options
  FOR SELECT USING (EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_options.poll_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid())));

CREATE POLICY "poll_options_write" ON poll_options
  FOR ALL USING (EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_options.poll_id AND p.author_id = auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_options.poll_id AND p.author_id = auth.uid()));

CREATE POLICY "poll_votes_read" ON poll_votes
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_votes.poll_id AND p.author_id = auth.uid()));

CREATE POLICY "poll_votes_write" ON poll_votes
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_votes.poll_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()) AND (po.expires_at IS NULL OR po.expires_at > NOW()))
  );