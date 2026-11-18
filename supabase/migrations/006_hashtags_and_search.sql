-- 006_hashtags_and_search.sql
-- Search functionality, trending hashtags, and search history

-- Search history (optional, with privacy controls)
CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result_type TEXT CHECK (result_type IN ('users', 'posts', 'hashtags', 'all')),
  result_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trending hashtags (materialized view refreshed periodically)
CREATE TABLE trending_hashtags (
  hashtag_id UUID PRIMARY KEY REFERENCES hashtags(id) ON DELETE CASCADE,
  tag CITEXT NOT NULL,
  post_count INTEGER NOT NULL,
  trend_score DOUBLE PRECISION NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Content reports
CREATE TABLE reported_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'comment', 'message', 'story', 'profile', 'poll')),
  content_id UUID NOT NULL,
  reason report_reason NOT NULL,
  description TEXT,
  status report_status NOT NULL DEFAULT 'pending',
  moderator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  moderator_action TEXT,
  moderator_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post views (for analytics and feed ranking)
CREATE TABLE post_views (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ip_hash TEXT, -- Hashed IP for anonymous view tracking
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, viewer_id, ip_hash, viewed_at)
);

-- Indexes for search
CREATE INDEX idx_search_history_user ON search_history(user_id);
CREATE INDEX idx_search_history_created ON search_history(created_at DESC);
CREATE INDEX idx_search_history_query ON search_history USING gin(query gin_trgm_ops);

-- Indexes for trending hashtags
CREATE INDEX idx_trending_hashtags_period ON trending_hashtags(period_start, period_end);
CREATE INDEX idx_trending_hashtags_score ON trending_hashtags(trend_score DESC);

-- Indexes for reports
CREATE INDEX idx_reports_reporter ON reported_content(reporter_id);
CREATE INDEX idx_reports_content ON reported_content(content_type, content_id);
CREATE INDEX idx_reports_status ON reported_content(status) WHERE status IN ('pending', 'reviewing');
CREATE INDEX idx_reports_moderator ON reported_content(moderator_id);

-- Indexes for post views
CREATE INDEX idx_post_views_post ON post_views(post_id);
CREATE INDEX idx_post_views_viewer ON post_views(viewer_id);
CREATE INDEX idx_post_views_viewed ON post_views(viewed_at DESC);