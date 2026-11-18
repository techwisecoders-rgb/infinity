-- 015_search_functions.sql
-- Search functions for users, posts, and trending hashtags

-- Function: Search users
CREATE OR REPLACE FUNCTION search_users(
  p_query TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_viewer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, username TEXT, display_name TEXT, avatar_url TEXT,
  bio TEXT, is_verified BOOLEAN, verification_tier verification_tier,
  follower_count BIGINT, is_following BOOLEAN, is_followed_by BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id, pr.username, pr.display_name, pr.avatar_url, pr.bio,
    pr.is_verified, pr.verification_tier,
    (SELECT count(*) FROM follows f WHERE f.following_id = pr.id) AS follower_count,
    CASE WHEN p_viewer_id IS NOT NULL THEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = pr.id) ELSE FALSE END AS is_following,
    CASE WHEN p_viewer_id IS NOT NULL THEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = pr.id AND f.following_id = p_viewer_id) ELSE FALSE END AS is_followed_by
  FROM profiles pr
  WHERE pr.deleted_at IS NULL
    AND (pr.username ILIKE '%' || p_query || '%' OR pr.display_name ILIKE '%' || p_query || '%' OR pr.bio ILIKE '%' || p_query || '%')
    AND (pr.username IS NOT NULL OR pr.display_name IS NOT NULL)
    AND (p_viewer_id IS NULL OR pr.id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = p_viewer_id) OR pr.id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = p_viewer_id))
  ORDER BY CASE WHEN pr.username ILIKE p_query || '%' THEN 0 WHEN pr.username ILIKE '%' || p_query || '%' THEN 1 ELSE 2 END, follower_count DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Search posts
CREATE OR REPLACE FUNCTION search_posts(
  p_query TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_viewer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, author_id UUID, type post_type, content TEXT,
  visibility post_visibility, like_count INT, comment_count INT,
  created_at TIMESTAMPTZ, author_username TEXT, author_display_name TEXT,
  author_avatar_url TEXT, author_is_verified BOOLEAN, media JSONB, hashtags TEXT[]
) AS $$
DECLARE
  v_following UUID[]; v_blocked_by UUID[]; v_blocked UUID[]; v_muted UUID[];
BEGIN
  IF p_viewer_id IS NOT NULL THEN
    SELECT array_agg(following_id) INTO v_following FROM follows WHERE follower_id = p_viewer_id;
    SELECT array_agg(blocker_id) INTO v_blocked_by FROM blocked_users WHERE blocked_id = p_viewer_id;
    SELECT array_agg(blocked_id) INTO v_blocked FROM blocked_users WHERE blocker_id = p_viewer_id;
    SELECT array_agg(muted_id) INTO v_muted FROM muted_users WHERE muter_id = p_viewer_id;
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.author_id, p.type, p.content, p.visibility,
    p.like_count, p.comment_count, p.created_at,
    pr.username AS author_username, pr.display_name AS author_display_name,
    pr.avatar_url AS author_avatar_url, pr.is_verified AS author_is_verified,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'type', m.type, 'r2_key', m.r2_key, 'r2_bucket', m.r2_bucket,
      'width', m.width, 'height', m.height, 'duration_seconds', m.duration_seconds,
      'thumbnail_r2_key', m.thumbnail_r2_key, 'blur_hash', m.blur_hash, 'alt_text', m.alt_text
    ) ORDER BY pm.display_order) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS media,
    COALESCE(array_agg(h.tag) FILTER (WHERE h.tag IS NOT NULL), '{}'::text[]) AS hashtags
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  LEFT JOIN post_media pm ON pm.post_id = p.id
  LEFT JOIN media m ON m.id = pm.media_id
  LEFT JOIN post_hashtags ph ON ph.post_id = p.id
  LEFT JOIN hashtags h ON h.id = ph.hashtag_id
  WHERE p.deleted_at IS NULL
    AND p.published_at IS NOT NULL
    AND p.published_at <= NOW()
    AND (p.search_vector @@ plainto_tsquery('english', p_query) OR p.content ILIKE '%' || p_query || '%')
    AND (p_viewer_id IS NULL OR p.author_id NOT IN (SELECT unnest(v_blocked_by)))
    AND (p_viewer_id IS NULL OR p.author_id NOT IN (SELECT unnest(v_blocked)))
    AND (p_viewer_id IS NULL OR p.author_id NOT IN (SELECT unnest(v_muted)))
    AND (p.visibility = 'public' OR (p.visibility = 'followers' AND p_viewer_id IS NOT NULL AND p.author_id = ANY(v_following)) OR (p.visibility = 'private' AND p.author_id = p_viewer_id))
  GROUP BY p.id, pr.username, pr.display_name, pr.avatar_url, pr.is_verified
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get trending hashtags
CREATE OR REPLACE FUNCTION get_trending_hashtags(
  p_limit INT DEFAULT 20,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (tag TEXT, post_count INT, trend_score DOUBLE PRECISION) AS $$
BEGIN
  RETURN QUERY
  SELECT h.tag, h.post_count,
    CASE WHEN p_since IS NOT NULL THEN h.post_count::DOUBLE PRECISION / GREATEST(EXTRACT(EPOCH FROM (NOW() - p_since)) / 3600, 1) ELSE h.post_count::DOUBLE PRECISION END AS trend_score
  FROM hashtags h
  WHERE h.post_count > 0 AND (p_since IS NULL OR h.updated_at >= p_since)
  ORDER BY trend_score DESC, h.post_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;