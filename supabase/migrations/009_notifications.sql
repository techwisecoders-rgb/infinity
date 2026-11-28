-- 009_notifications.sql
-- Notifications and push subscriptions

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  reference_id UUID,
  reference_type TEXT CHECK (reference_type IN ('post', 'comment', 'user', 'story', 'poll', 'conversation', 'message')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  follow_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  follow_request_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  like_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reaction_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  comment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reply_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mention_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  share_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  message_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  story_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  poll_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  system_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_follow BOOLEAN NOT NULL DEFAULT FALSE,
  email_like BOOLEAN NOT NULL DEFAULT FALSE,
  email_comment BOOLEAN NOT NULL DEFAULT FALSE,
  email_mention BOOLEAN NOT NULL DEFAULT FALSE,
  email_message BOOLEAN NOT NULL DEFAULT FALSE,
  email_system BOOLEAN NOT NULL DEFAULT TRUE,
  push_follow BOOLEAN NOT NULL DEFAULT TRUE,
  push_like BOOLEAN NOT NULL DEFAULT TRUE,
  push_comment BOOLEAN NOT NULL DEFAULT TRUE,
  push_mention BOOLEAN NOT NULL DEFAULT TRUE,
  push_message BOOLEAN NOT NULL DEFAULT TRUE,
  push_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Push subscriptions (Web Push API)
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_reference ON notifications(reference_type, reference_id);
CREATE INDEX idx_notifications_type ON notifications(type);

-- Indexes for push subscriptions
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);