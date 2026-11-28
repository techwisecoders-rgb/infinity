-- 014_post_detail_function.sql
-- Get post with full details function

CREATE OR REPLACE FUNCTION get_post_with_details(
  p_post_id UUID,
  p_viewer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, author_id UUID, type post_type, content TEXT,
  visibility post_visibility, like_count INT, comment_count INT,
  share_count INT, view_count INT, created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ, author_username TEXT, author_display_name TEXT,
  author_avatar_url TEXT, author_is_verified BOOLEAN, media JSONB,
  hashtags TEXT[], user_has_liked BOOLEAN, user_has_bookmarked BOOLEAN,
  user_reaction reaction_type, poll JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.author_id, p.type, p.content, p.visibility,
    p.like_count, p.comment_count, p.share_count, p.view_count,
    p.created_at, p.updated_at,
    pr.username AS author_username, pr.display_name AS author_display_name,
    pr.avatar_url AS author_avatar_url, pr.is_verified AS author_is_verified,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'type', m.type, 'r2_key', m.r2_key, 'r2_bucket', m.r2_bucket,
      'width', m.width, 'height', m.height, 'duration_seconds', m.duration_seconds,
      'thumbnail_r2_key', m.thumbnail_r2_key, 'blur_hash', m.blur_hash,
      'alt_text', m.alt_text, 'filename', m.filename, 'mime_type', m.mime_type
    ) ORDER BY pm.display_order) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS media,
    COALESCE(array_agg(h.tag) FILTER (WHERE h.tag IS NOT NULL), '{}'::text[]) AS hashtags,
    CASE WHEN p_viewer_id IS NOT NULL THEN EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_viewer_id) ELSE FALSE END AS user_has_liked,
    CASE WHEN p_viewer_id IS NOT NULL THEN EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = p_viewer_id) ELSE FALSE END AS user_has_bookmarked,
    CASE WHEN p_viewer_id IS NOT NULL THEN (SELECT pr2.reaction_type FROM post_reactions pr2 WHERE pr2.post_id = p.id AND pr2.user_id = p_viewer_id LIMIT 1) ELSE NULL END AS user_reaction,
    CASE WHEN p.type = 'poll' THEN (
      SELECT jsonb_build_object(
        'id', po.id, 'question', po.question, 'is_multiple_choice', po.is_multiple_choice,
        'expires_at', po.expires_at, 'vote_count', po.vote_count,
        'options', (SELECT jsonb_agg(jsonb_build_object('id', opt.id, 'text', opt.text, 'vote_count', opt.vote_count, 'user_voted', EXISTS(SELECT 1 FROM poll_votes pv WHERE pv.option_id = opt.id AND pv.user_id = p_viewer_id)) ORDER BY opt.display_order) FROM poll_options opt WHERE opt.poll_id = po.id)
      ) FROM polls po WHERE po.post_id = p.id
    ) ELSE NULL END AS poll
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  LEFT JOIN post_media pm ON pm.post_id = p.id
  LEFT JOIN media m ON m.id = pm.media_id
  LEFT JOIN post_hashtags ph ON ph.post_id = p.id
  LEFT JOIN hashtags h ON h.id = ph.hashtag_id
  WHERE p.id = p_post_id AND p.deleted_at IS NULL
  GROUP BY p.id, pr.username, pr.display_name, pr.avatar_url, pr.is_verified;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;