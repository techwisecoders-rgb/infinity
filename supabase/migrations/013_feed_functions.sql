-- 013_feed_functions.sql
-- Feed and post detail functions

-- Function: Get user feed (home, following, recommended)
CREATE OR REPLACE FUNCTION get_user_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_feed_type TEXT DEFAULT 'home'
)
RETURNS TABLE (
  id UUID,
  author_id UUID,
  type post_type,
  content TEXT,
  visibility post_visibility,
  like_count INT,
  comment_count INT,
  share_count INT,
  view_count INT,
  created_at TIMESTAMPTZ,
  author_username TEXT,
  author_display_name TEXT,
  author_avatar_url TEXT,
  author_is_verified BOOLEAN,
  media JSONB,
  hashtags TEXT[],
  user_has_liked BOOLEAN,
  user_has_bookmarked BOOLEAN,
  user_reaction reaction_type
) AS $$
DECLARE
  v_following UUID[];
  v_blocked_by UUID[];
  v_blocked UUID[];
  v_muted UUID[];
BEGIN
  SELECT array_agg(following_id) INTO v_following FROM follows WHERE follower_id = p_user_id;
  SELECT array_agg(blocker_id) INTO v_blocked_by FROM blocked_users WHERE blocked_id = p_user_id;
  SELECT array_agg(blocked_id) INTO v_blocked FROM blocked_users WHERE blocker_id = p_user_id;
  SELECT array_agg(muted_id) INTO v_muted FROM muted_users WHERE muter_id = p_user_id;

  RETURN QUERY
  WITH base_posts AS (
    SELECT
      p.id, p.author_id, p.type, p.content, p.visibility,
      p.like_count, p.comment_count, p.share_count, p.view_count,
      p.created_at,
      pr.username AS author_username, pr.display_name AS author_display_name,
      pr.avatar_url AS author_avatar_url, pr.is_verified AS author_is_verified,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id, 'type', m.type, 'r2_key', m.r2_key, 'r2_bucket', m.r2_bucket,
        'width', m.width, 'height', m.height, 'duration_seconds', m.duration_seconds,
        'thumbnail_r2_key', m.thumbnail_r2_key, 'blur_hash', m.blur_hash,
        'alt_text', m.alt_text, 'filename', m.filename, 'mime_type', m.mime_type
      ) ORDER BY pm.display_order) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS media,
      COALESCE(array_agg(h.tag) FILTER (WHERE h.tag IS NOT NULL), '{}'::text[]) AS hashtags,
      EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS user_has_liked,
      EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = p_user_id) AS user_has_bookmarked,
      (SELECT pr2.reaction_type FROM post_reactions pr2 WHERE pr2.post_id = p.id AND pr2.user_id = p_user_id LIMIT 1) AS user_reaction
    FROM posts p
    JOIN profiles pr ON pr.id = p.author_id
    LEFT JOIN post_media pm ON pm.post_id = p.id
    LEFT JOIN media m ON m.id = pm.media_id
    LEFT JOIN post_hashtags ph ON ph.post_id = p.id
    LEFT JOIN hashtags h ON h.id = ph.hashtag_id
    WHERE p.deleted_at IS NULL
      AND p.published_at IS NOT NULL
      AND p.published_at <= NOW()
      AND p.author_id NOT IN (SELECT unnest(v_blocked_by))
      AND p.author_id NOT IN (SELECT unnest(v_blocked))
      AND p.author_id NOT IN (SELECT unnest(v_muted))
      AND (p.visibility = 'public' OR (p.visibility = 'followers' AND p.author_id = ANY(v_following)) OR (p.visibility = 'private' AND p.author_id = p_user_id))
    GROUP BY p.id, pr.username, pr.display_name, pr.avatar_url, pr.is_verified
  )
  SELECT * FROM base_posts
  WHERE (p_cursor IS NULL OR created_at < p_cursor)
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;