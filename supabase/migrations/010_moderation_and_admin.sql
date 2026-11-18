-- 010_moderation_and_admin.sql
-- Moderation actions, audit logs, admin roles, platform settings

-- Moderation actions
CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type moderation_action_type NOT NULL,
  target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_content_type TEXT CHECK (target_content_type IN ('post', 'comment', 'message', 'story', 'profile', 'poll')),
  target_content_id UUID,
  reason TEXT NOT NULL,
  duration INTERVAL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin roles
CREATE TABLE admin_roles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  role admin_role NOT NULL,
  granted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Platform settings
CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for moderation
CREATE INDEX idx_moderation_actions_moderator ON moderation_actions(moderator_id);
CREATE INDEX idx_moderation_actions_target_user ON moderation_actions(target_user_id);
CREATE INDEX idx_moderation_actions_target_content ON moderation_actions(target_content_type, target_content_id);
CREATE INDEX idx_moderation_actions_expires ON moderation_actions(expires_at) WHERE expires_at IS NOT NULL;

-- Indexes for audit logs
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Indexes for admin roles
CREATE INDEX idx_admin_roles_role ON admin_roles(role);
CREATE INDEX idx_admin_roles_active ON admin_roles(is_active) WHERE is_active = TRUE;

-- Insert default platform settings
INSERT INTO platform_settings (key, value, description, is_public) VALUES
  ('max_post_length', '5000', 'Maximum characters in a post', true),
  ('max_comment_length', '2000', 'Maximum characters in a comment', true),
  ('max_media_per_post', '10', 'Maximum media items per post', true),
  ('max_file_size_mb', '100', 'Maximum file size in MB', true),
  ('allowed_image_types', '["image/jpeg", "image/png", "image/webp", "image/gif"]', 'Allowed image MIME types', true),
  ('allowed_video_types', '["video/mp4", "video/webm", "video/quicktime"]', 'Allowed video MIME types', true),
  ('allowed_audio_types', '["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg"]', 'Allowed audio MIME types', true),
  ('allowed_document_types', '["application/pdf"]', 'Allowed document MIME types', true),
  ('story_duration_hours', '24', 'Story expiration in hours', true),
  ('max_poll_options', '10', 'Maximum poll options', true),
  ('max_poll_duration_days', '30', 'Maximum poll duration in days', true),
  ('default_post_visibility', '"public"', 'Default post visibility', true),
  ('enable_registration', 'true', 'Allow new user registration', true),
  ('require_email_verification', 'true', 'Require email verification for new accounts', true);