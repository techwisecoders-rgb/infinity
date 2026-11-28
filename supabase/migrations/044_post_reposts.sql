ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reposted_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_reposted_post_id ON public.posts(reposted_post_id);
