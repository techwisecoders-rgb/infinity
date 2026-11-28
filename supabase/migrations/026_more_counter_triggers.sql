-- 026_more_counter_triggers.sql
-- More counter triggers

-- Comment reply count
CREATE OR REPLACE FUNCTION update_comment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_comment_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count - 1 WHERE id = OLD.parent_comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_comment_reply_count ON comments;
CREATE TRIGGER trigger_comment_reply_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_reply_count();

-- Hashtag post count
CREATE OR REPLACE FUNCTION update_hashtag_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE hashtags SET post_count = post_count + 1 WHERE id = NEW.hashtag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE hashtags SET post_count = post_count - 1 WHERE id = OLD.hashtag_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hashtag_post_count ON post_hashtags;
CREATE TRIGGER trigger_hashtag_post_count
  AFTER INSERT OR DELETE ON post_hashtags
  FOR EACH ROW EXECUTE FUNCTION update_hashtag_post_count();

-- Story view count
CREATE OR REPLACE FUNCTION update_story_view_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE stories SET view_count = view_count + 1 WHERE id = NEW.story_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_story_view_count ON story_views;
CREATE TRIGGER trigger_story_view_count
  AFTER INSERT ON story_views
  FOR EACH ROW EXECUTE FUNCTION update_story_view_count();

-- Story reply count
CREATE OR REPLACE FUNCTION update_story_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE stories SET reply_count = reply_count + 1 WHERE id = NEW.story_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE stories SET reply_count = reply_count - 1 WHERE id = OLD.story_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_story_reply_count ON story_reactions;
CREATE TRIGGER trigger_story_reply_count
  AFTER INSERT OR DELETE ON story_reactions
  FOR EACH ROW EXECUTE FUNCTION update_story_reply_count();

-- Poll vote count
CREATE OR REPLACE FUNCTION update_poll_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
    UPDATE polls SET vote_count = vote_count + 1 WHERE id = NEW.poll_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE poll_options SET vote_count = vote_count - 1 WHERE id = OLD.option_id;
    UPDATE polls SET vote_count = vote_count - 1 WHERE id = OLD.poll_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_poll_vote_count ON poll_votes;
CREATE TRIGGER trigger_poll_vote_count
  AFTER INSERT OR DELETE ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION update_poll_vote_count();