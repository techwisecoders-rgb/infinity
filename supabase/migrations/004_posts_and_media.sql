-- 004_posts_and_media.sql
-- Posts, media, and post-media relationships

-- Posts table
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type post_type NOT NULL DEFAULT 'text',
  content TEXT,
  visibility post_visibility NOT NULL DEFAULT 'public',
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  parent_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  root_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  share_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Media table (metadata for files stored in Cloudflare R2)
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type media_type NOT NULL,
  r2_key TEXT NOT NULL,
  r2_bucket TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_seconds DOUBLE PRECISION,
  thumbnail_r2_key TEXT,
  blur_hash TEXT,
  alt_text TEXT,
  is_processed BOOLEAN NOT NULL DEFAULT FALSE,
  processing_status processing_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post-Media junction table (many-to-many)
CREATE TABLE post_media (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, media_id)
);

-- Indexes for posts
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_type ON posts(type);
CREATE INDEX idx_posts_visibility ON posts(visibility);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_published_at ON posts(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX idx_posts_scheduled_at ON posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_posts_parent ON posts(parent_post_id);
CREATE INDEX idx_posts_root ON posts(root_post_id);
CREATE INDEX idx_posts_deleted_at ON posts(deleted_at) WHERE deleted_at IS NULL;
-- Composite index for feed queries
CREATE INDEX idx_posts_feed ON posts(author_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_visibility_created ON posts(visibility, created_at DESC) WHERE deleted_at IS NULL;

-- Indexes for media
CREATE INDEX idx_media_owner ON media(owner_id);
CREATE INDEX idx_media_type ON media(type);
CREATE INDEX idx_media_processing ON media(processing_status) WHERE processing_status != 'completed';
CREATE INDEX idx_media_r2_key ON media(r2_bucket, r2_key);

-- Indexes for post_media
CREATE INDEX idx_post_media_media ON post_media(media_id);
CREATE INDEX idx_post_media_order ON post_media(post_id, display_order);