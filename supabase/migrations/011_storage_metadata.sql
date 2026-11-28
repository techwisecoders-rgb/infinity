-- 011_storage_metadata.sql
-- Media processing jobs, upload sessions, storage usage

-- Media processing jobs (async thumbnail generation, transcoding, etc.)
CREATE TABLE media_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  job_type media_processing_job_type NOT NULL,
  status processing_status NOT NULL DEFAULT 'pending',
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Media upload sessions (for multipart/resumable uploads)
CREATE TABLE media_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  total_chunks INTEGER NOT NULL DEFAULT 1,
  uploaded_chunks INTEGER NOT NULL DEFAULT 0,
  r2_upload_id TEXT,
  status upload_session_status NOT NULL DEFAULT 'initiated',
  media_id UUID REFERENCES media(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Storage usage per user
CREATE TABLE storage_usage (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  post_media_count INTEGER NOT NULL DEFAULT 0,
  message_media_count INTEGER NOT NULL DEFAULT 0,
  story_media_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for media processing
CREATE INDEX idx_media_processing_media ON media_processing_jobs(media_id);
CREATE INDEX idx_media_processing_status ON media_processing_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_media_processing_type ON media_processing_jobs(job_type);

-- Indexes for upload sessions
CREATE INDEX idx_upload_sessions_user ON media_upload_sessions(user_id);
CREATE INDEX idx_upload_sessions_status ON media_upload_sessions(status) WHERE status IN ('initiated', 'uploading');
CREATE INDEX idx_upload_sessions_expires ON media_upload_sessions(expires_at) WHERE status IN ('initiated', 'uploading');
CREATE INDEX idx_upload_sessions_r2_upload_id ON media_upload_sessions(r2_upload_id) WHERE r2_upload_id IS NOT NULL;