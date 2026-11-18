-- 027_system_triggers.sql
-- System triggers: conversation last message, storage usage, profile init

-- Conversation last message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_deleted = FALSE THEN
    UPDATE conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = CASE
          WHEN NEW.message_type = 'text' THEN NEW.content
          WHEN NEW.message_type = 'image' THEN '📷 Image'
          WHEN NEW.message_type = 'video' THEN '🎥 Video'
          WHEN NEW.message_type = 'audio' THEN '🎵 Audio'
          WHEN NEW.message_type = 'file' THEN '📎 File'
          ELSE 'Message'
        END
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_conversation_last_message ON messages;
CREATE TRIGGER trigger_conversation_last_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Media storage usage
CREATE OR REPLACE FUNCTION update_storage_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO storage_usage (user_id, total_bytes, media_count)
    VALUES (NEW.owner_id, NEW.size_bytes, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      total_bytes = storage_usage.total_bytes + NEW.size_bytes,
      media_count = storage_usage.media_count + 1,
      updated_at = NOW();
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE storage_usage
    SET total_bytes = total_bytes - OLD.size_bytes,
        media_count = media_count - 1,
        updated_at = NOW()
    WHERE user_id = OLD.owner_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_storage_usage ON media;
CREATE TRIGGER trigger_storage_usage
  AFTER INSERT OR DELETE ON media
  FOR EACH ROW EXECUTE FUNCTION update_storage_usage();

-- Profile initialization on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name, account_type)
  VALUES (NEW.id, NULL, NULL, 'personal')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO user_privacy_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Username availability check
CREATE OR REPLACE FUNCTION check_username_availability(p_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS(SELECT 1 FROM profiles WHERE username = p_username);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Extract hashtags from text
CREATE OR REPLACE FUNCTION extract_hashtags(p_text TEXT)
RETURNS TEXT[] AS $$
DECLARE
  v_tags TEXT[];
  v_tag TEXT;
  v_pos INT;
  v_len INT;
BEGIN
  v_tags := ARRAY[]::TEXT[];
  v_pos := 1;
  v_len := LENGTH(p_text);

  WHILE v_pos <= v_len LOOP
    v_pos := POSITION('#' IN SUBSTRING(p_text FROM v_pos));
    IF v_pos = 0 THEN EXIT; END IF;
    v_pos := v_pos + v_pos - 1;

    v_tag := SUBSTRING(p_text FROM v_pos FOR 100);
    v_tag := REGEXP_REPLACE(v_tag, '[^#\w\u0080-\uFFFF]+.*$', '');
    v_tag := LOWER(TRIM(v_tag, '#'));

    IF LENGTH(v_tag) > 1 AND LENGTH(v_tag) <= 100 THEN
      v_tags := v_tags || v_tag;
    END IF;

    v_pos := v_pos + LENGTH(v_tag) + 1;
  END LOOP;

  RETURN array_distinct(v_tags);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Extract mentions from text
CREATE OR REPLACE FUNCTION extract_mentions(p_text TEXT)
RETURNS TEXT[] AS $$
DECLARE
  v_mentions TEXT[];
  v_mention TEXT;
  v_pos INT;
  v_len INT;
BEGIN
  v_mentions := ARRAY[]::TEXT[];
  v_pos := 1;
  v_len := LENGTH(p_text);

  WHILE v_pos <= v_len LOOP
    v_pos := POSITION('@' IN SUBSTRING(p_text FROM v_pos));
    IF v_pos = 0 THEN EXIT; END IF;
    v_pos := v_pos + v_pos - 1;

    v_mention := SUBSTRING(p_text FROM v_pos FOR 100);
    v_mention := REGEXP_REPLACE(v_mention, '[^@\w\.]+.*$', '');
    v_mention := LOWER(TRIM(v_mention, '@'));

    IF LENGTH(v_mention) > 0 AND LENGTH(v_mention) <= 50 THEN
      v_mentions := v_mentions || v_mention;
    END IF;

    v_pos := v_pos + LENGTH(v_mention) + 1;
  END LOOP;

  RETURN array_distinct(v_mentions);
END;
$$ LANGUAGE plpgsql IMMUTABLE;