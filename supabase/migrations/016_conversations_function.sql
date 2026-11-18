-- 016_conversations_function.sql
-- Get conversations with details function

CREATE OR REPLACE FUNCTION get_conversations_with_details(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID, type conversation_type, name TEXT, avatar_url TEXT,
  last_message_at TIMESTAMPTZ, last_message_preview TEXT,
  unread_count BIGINT, other_participants JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH user_conversations AS (
    SELECT c.id, c.type, c.name, c.avatar_url, c.last_message_at, c.last_message_preview
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = p_user_id AND cm.left_at IS NULL
  ),
  unread_counts AS (
    SELECT m.conversation_id,
      COUNT(*) FILTER (WHERE m.created_at > COALESCE(lr.created_at, '1970-01-01')) AS unread_count
    FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = p_user_id
    LEFT JOIN LATERAL (SELECT created_at FROM messages WHERE id = cm.last_read_message_id) lr ON TRUE
    WHERE m.sender_id != p_user_id AND m.is_deleted = FALSE
    GROUP BY m.conversation_id
  ),
  other_participants AS (
    SELECT cm.conversation_id,
      jsonb_agg(jsonb_build_object('id', pr.id, 'username', pr.username, 'display_name', pr.display_name, 'avatar_url', pr.avatar_url, 'is_verified', pr.is_verified)) AS participants
    FROM conversation_members cm
    JOIN profiles pr ON pr.id = cm.user_id
    WHERE cm.conversation_id IN (SELECT id FROM user_conversations)
      AND cm.user_id != p_user_id AND cm.left_at IS NULL
    GROUP BY cm.conversation_id
  )
  SELECT uc.id, uc.type, uc.name, uc.avatar_url, uc.last_message_at, uc.last_message_preview,
    COALESCE(uc2.unread_count, 0) AS unread_count, op.participants AS other_participants
  FROM user_conversations uc
  LEFT JOIN unread_counts uc2 ON uc2.conversation_id = uc.id
  LEFT JOIN other_participants op ON op.conversation_id = uc.id
  WHERE (p_cursor IS NULL OR uc.last_message_at < p_cursor)
  ORDER BY uc.last_message_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;