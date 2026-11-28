-- 032_posts_media_url_and_counters.sql
-- Add direct media_url and repost_count columns to posts, plus share/repost counter trigger.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS repost_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_post_share_and_repost_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.share_type = 'repost' THEN
      UPDATE public.posts SET repost_count = repost_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE public.posts SET share_count = share_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.share_type = 'repost' THEN
      UPDATE public.posts SET repost_count = GREATEST(0, repost_count - 1) WHERE id = OLD.post_id;
    ELSE
      UPDATE public.posts SET share_count = GREATEST(0, share_count - 1) WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_post_share_count ON public.post_shares;
CREATE TRIGGER trigger_post_share_count
  AFTER INSERT OR DELETE ON public.post_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_post_share_and_repost_count();
