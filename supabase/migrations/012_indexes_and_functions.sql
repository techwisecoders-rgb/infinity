-- 012_indexes_and_functions.sql
-- Additional indexes, search functions, and utility functions

-- Full-text search vector for posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Trigger function to update search_vector
CREATE OR REPLACE FUNCTION update_post_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE((
      SELECT string_agg(h.tag, ' ')
      FROM post_hashtags ph
      JOIN hashtags h ON h.id = ph.hashtag_id
      WHERE ph.post_id = NEW.id
    ), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS trigger_update_post_search_vector ON posts;
CREATE TRIGGER trigger_update_post_search_vector
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_search_vector();

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_posts_search_vector ON posts USING gin(search_vector);

-- Full-text search for profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION update_profile_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.username, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.display_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_profile_search_vector ON profiles;
CREATE TRIGGER trigger_update_profile_search_vector
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_profile_search_vector();

CREATE INDEX IF NOT EXISTS idx_profiles_search_vector ON profiles USING gin(search_vector);