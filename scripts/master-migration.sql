-- 001_extensions_and_types.sql
-- Enable required PostgreSQL extensions and define custom types

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Custom enum types
CREATE TYPE account_type AS ENUM ('personal', 'creator', 'business');
CREATE TYPE verification_tier AS ENUM ('none', 'verified', 'official');
CREATE TYPE post_type AS ENUM ('text', 'image', 'video', 'audio', 'file', 'service', 'product', 'vacancy', 'job', 'poll');
CREATE TYPE post_visibility AS ENUM ('public', 'followers', 'private', 'close_friends');
CREATE TYPE media_type AS ENUM ('image', 'video', 'audio', 'file');
CREATE TYPE reaction_type AS ENUM ('like', 'love', 'haha', 'wow', 'sad', 'angry', 'fire', 'celebrate');
CREATE TYPE follow_request_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE story_visibility AS ENUM ('public', 'followers', 'close_friends');
CREATE TYPE conversation_type AS ENUM ('direct', 'group');
CREATE TYPE member_role AS ENUM ('member', 'admin', 'owner');
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'audio', 'file', 'system', 'reply');
CREATE TYPE notification_type AS ENUM (
  'follow', 'follow_request', 'follow_accepted', 'like', 'reaction',
  'comment', 'reply', 'mention', 'share', 'message',
  'story_view', 'story_reaction', 'poll_vote', 'post_shared',
  'new_follower', 'verification', 'system'
);
CREATE TYPE report_reason AS ENUM (
  'spam', 'harassment', 'hate_speech', 'violence', 'nudity',
  'misinformation', 'copyright', 'impersonation', 'self_harm', 'other'
);
CREATE TYPE report_status AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');
CREATE TYPE moderation_action_type AS ENUM (
  'warn', 'mute', 'suspend', 'ban', 'delete_content',
  'restore_content', 'lock_account', 'unlock_account', 'verify', 'unverify'
);
CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'moderator', 'support');
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE media_processing_job_type AS ENUM ('thumbnail', 'transcode', 'blurhash', 'watermark');
CREATE TYPE upload_session_status AS ENUM ('initiated', 'uploading', 'completed', 'failed', 'expired');
-- 002_profiles_and_settings.sql
-- User profiles, settings, and privacy settings

-- Profiles table (linked to Supabase Auth users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username CITEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  location TEXT,
  website TEXT,
  account_type account_type NOT NULL DEFAULT 'personal',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_tier verification_tier NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User settings
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  language TEXT NOT NULL DEFAULT 'en',
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  show_online_status BOOLEAN NOT NULL DEFAULT TRUE,
  allow_direct_messages TEXT NOT NULL DEFAULT 'followers' CHECK (allow_direct_messages IN ('everyone', 'followers', 'none')),
  media_autoplay BOOLEAN NOT NULL DEFAULT TRUE,
  data_saver BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User privacy settings
CREATE TABLE user_privacy_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  account_visibility TEXT NOT NULL DEFAULT 'public' CHECK (account_visibility IN ('public', 'private')),
  show_profile_to TEXT NOT NULL DEFAULT 'everyone' CHECK (show_profile_to IN ('everyone', 'followers', 'none')),
  show_posts_to TEXT NOT NULL DEFAULT 'everyone' CHECK (show_posts_to IN ('everyone', 'followers', 'none')),
  show_followers_list BOOLEAN NOT NULL DEFAULT TRUE,
  show_following_list BOOLEAN NOT NULL DEFAULT TRUE,
  allow_tagging TEXT NOT NULL DEFAULT 'followers' CHECK (allow_tagging IN ('everyone', 'followers', 'none')),
  allow_mentions TEXT NOT NULL DEFAULT 'followers' CHECK (allow_mentions IN ('everyone', 'followers', 'none')),
  show_read_receipts BOOLEAN NOT NULL DEFAULT TRUE,
  index_profile_in_search BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;
CREATE INDEX idx_profiles_display_name ON profiles USING gin(display_name gin_trgm_ops) WHERE display_name IS NOT NULL;
CREATE INDEX idx_profiles_created_at ON profiles(created_at);
-- 003_social_relationships.sql
-- Follows, follow requests, blocks, mutes

-- Follows (user follows user)
CREATE TABLE follows (
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

-- Follow requests (for private accounts)
CREATE TABLE follow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status follow_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_follow_request CHECK (requester_id <> target_id),
  CONSTRAINT unique_pending_request UNIQUE (requester_id, target_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Blocked users
CREATE TABLE blocked_users (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

-- Muted users
CREATE TABLE muted_users (
  muter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  muted_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (muter_id, muted_id),
  CONSTRAINT no_self_mute CHECK (muter_id <> muted_id)
);

-- Indexes for social relationships
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_follow_requests_requester ON follow_requests(requester_id);
CREATE INDEX idx_follow_requests_target ON follow_requests(target_id);
CREATE INDEX idx_follow_requests_status ON follow_requests(status) WHERE status = 'pending';
CREATE INDEX idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_id);
CREATE INDEX idx_muted_users_muter ON muted_users(muter_id);
CREATE INDEX idx_muted_users_muted ON muted_users(muted_id);
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
-- 005_interactions_and_comments.sql
-- Likes, reactions, comments, shares, bookmarks, hashtags, mentions

-- Post likes
CREATE TABLE post_likes (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- Post reactions (emoji reactions)
CREATE TABLE post_reactions (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type reaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id, reaction_type)
);

-- Comments (and replies via parent_comment_id)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Comment likes
CREATE TABLE comment_likes (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

-- Comment reactions
CREATE TABLE comment_reactions (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type reaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id, reaction_type)
);

-- Post shares
CREATE TABLE post_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  share_type TEXT NOT NULL DEFAULT 'repost' CHECK (share_type IN ('repost', 'quote', 'external')),
  quote_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bookmarks
CREATE TABLE bookmarks (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- Hashtags
CREATE TABLE hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag CITEXT NOT NULL UNIQUE,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post-Hashtag junction
CREATE TABLE post_hashtags (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, hashtag_id)
);

-- Mentions (in posts and comments)
CREATE TABLE mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mention_has_post_or_comment CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  )
);

-- Indexes for interactions
CREATE INDEX idx_post_likes_user ON post_likes(user_id);
CREATE INDEX idx_post_likes_created ON post_likes(created_at DESC);
CREATE INDEX idx_post_reactions_user ON post_reactions(user_id);
CREATE INDEX idx_post_reactions_type ON post_reactions(reaction_type);

-- Indexes for comments
CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);
CREATE INDEX idx_comments_deleted ON comments(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_post_created ON comments(post_id, created_at ASC) WHERE deleted_at IS NULL;

-- Indexes for comment interactions
CREATE INDEX idx_comment_likes_user ON comment_likes(user_id);
CREATE INDEX idx_comment_reactions_user ON comment_reactions(user_id);

-- Indexes for shares
CREATE INDEX idx_post_shares_post ON post_shares(post_id);
CREATE INDEX idx_post_shares_user ON post_shares(user_id);
CREATE INDEX idx_post_shares_created ON post_shares(created_at DESC);

-- Indexes for bookmarks
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_created ON bookmarks(created_at DESC);

-- Indexes for hashtags
CREATE INDEX idx_hashtags_tag ON hashtags(tag);
CREATE INDEX idx_hashtags_post_count ON hashtags(post_count DESC);
CREATE INDEX idx_post_hashtags_hashtag ON post_hashtags(hashtag_id);

-- Indexes for mentions
CREATE INDEX idx_mentions_post ON mentions(post_id);
CREATE INDEX idx_mentions_comment ON mentions(comment_id);
CREATE INDEX idx_mentions_user ON mentions(mentioned_user_id);
CREATE INDEX idx_mentions_created ON mentions(created_at DESC);
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
-- 007_stories_and_polls.sql
-- Stories and Polls

-- Stories
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  background_color TEXT,
  visibility story_visibility NOT NULL DEFAULT 'followers',
  expires_at TIMESTAMPTZ NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Story-Media junction
CREATE TABLE story_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Story views
CREATE TABLE story_views (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

-- Story reactions
CREATE TABLE story_reactions (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type reaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id, reaction_type)
);

-- Polls (attached to posts)
CREATE TABLE polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  is_multiple_choice BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Poll options
CREATE TABLE poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Poll votes
CREATE TABLE poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_poll_vote UNIQUE (poll_id, user_id, option_id)
);

-- Indexes for stories
CREATE INDEX idx_stories_author ON stories(author_id);
CREATE INDEX idx_stories_expires ON stories(expires_at) WHERE expires_at > NOW();
CREATE INDEX idx_stories_visibility_expires ON stories(visibility, expires_at DESC) WHERE expires_at > NOW();
CREATE INDEX idx_story_media_story ON story_media(story_id);
CREATE INDEX idx_story_media_order ON story_media(story_id, display_order);
CREATE INDEX idx_story_views_story ON story_views(story_id);
CREATE INDEX idx_story_views_viewer ON story_views(viewer_id);
CREATE INDEX idx_story_reactions_user ON story_reactions(user_id);

-- Indexes for polls
CREATE INDEX idx_polls_post ON polls(post_id);
CREATE INDEX idx_polls_expires ON polls(expires_at) WHERE expires_at IS NOT NULL AND expires_at > NOW();
CREATE INDEX idx_poll_options_poll ON poll_options(poll_id);
CREATE INDEX idx_poll_options_order ON poll_options(poll_id, display_order);
CREATE INDEX idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX idx_poll_votes_user ON poll_votes(user_id);
CREATE INDEX idx_poll_votes_option ON poll_votes(option_id);
-- 008_messaging.sql
-- Conversations, messages, and realtime messaging

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type NOT NULL DEFAULT 'direct',
  name TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversation members
CREATE TABLE conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  message_type message_type NOT NULL DEFAULT 'text',
  reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Message attachments
CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Message reactions
CREATE TABLE message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type reaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, reaction_type)
);

-- Message read receipts
CREATE TABLE message_read_receipts (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- Indexes for conversations
CREATE INDEX idx_conversations_created_by ON conversations(created_by);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX idx_conversation_members_user ON conversation_members(user_id);
CREATE INDEX idx_conversation_members_unread ON conversation_members(user_id, last_read_message_id) WHERE left_at IS NULL;

-- Indexes for messages
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_messages_reply_to ON messages(reply_to_message_id);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC) WHERE is_deleted = FALSE;

-- Indexes for message attachments
CREATE INDEX idx_message_attachments_message ON message_attachments(message_id);
CREATE INDEX idx_message_attachments_media ON message_attachments(media_id);

-- Indexes for message reactions
CREATE INDEX idx_message_reactions_user ON message_reactions(user_id);

-- Indexes for read receipts
CREATE INDEX idx_message_read_receipts_user ON message_read_receipts(user_id);
CREATE INDEX idx_message_read_receipts_message ON message_read_receipts(message_id);
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
-- 012_indexes_and_functions.sql
-- Additional indexes, search functions, and utility functions

-- Full-text search vector for posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Trigger function to update search_vector
CREATE OR REPLACE FUNCTION update_post_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE((
      SELECT string_agg(h.tag, ' ')
      FROM post_hashtags ph
      JOIN hashtags h ON h.id = ph.hashtag_id
      WHERE ph.post_id = NEW.id
    ), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS trigger_update_post_search_vector ON posts;
CREATE TRIGGER trigger_update_post_search_vector
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_search_vector();

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_posts_search_vector ON posts USING gin(search_vector);

-- Full-text search for profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION update_profile_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.username, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.display_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_profile_search_vector ON profiles;
CREATE TRIGGER trigger_update_profile_search_vector
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_profile_search_vector();

CREATE INDEX IF NOT EXISTS idx_profiles_search_vector ON profiles USING gin(search_vector);
-- 013_feed_functions.sql
-- Feed and post detail functions

-- Function: Get user feed (home, following, recommended)
CREATE OR REPLACE FUNCTION get_user_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_feed_type TEXT DEFAULT 'home'
)
RETURNS TABLE (
  id UUID,
  author_id UUID,
  type post_type,
  content TEXT,
  visibility post_visibility,
  like_count INT,
  comment_count INT,
  share_count INT,
  view_count INT,
  created_at TIMESTAMPTZ,
  author_username TEXT,
  author_display_name TEXT,
  author_avatar_url TEXT,
  author_is_verified BOOLEAN,
  media JSONB,
  hashtags TEXT[],
  user_has_liked BOOLEAN,
  user_has_bookmarked BOOLEAN,
  user_reaction reaction_type
) AS $$
DECLARE
  v_following UUID[];
  v_blocked_by UUID[];
  v_blocked UUID[];
  v_muted UUID[];
BEGIN
  SELECT array_agg(following_id) INTO v_following FROM follows WHERE follower_id = p_user_id;
  SELECT array_agg(blocker_id) INTO v_blocked_by FROM blocked_users WHERE blocked_id = p_user_id;
  SELECT array_agg(blocked_id) INTO v_blocked FROM blocked_users WHERE blocker_id = p_user_id;
  SELECT array_agg(muted_id) INTO v_muted FROM muted_users WHERE muter_id = p_user_id;

  RETURN QUERY
  WITH base_posts AS (
    SELECT
      p.id, p.author_id, p.type, p.content, p.visibility,
      p.like_count, p.comment_count, p.share_count, p.view_count,
      p.created_at,
      pr.username AS author_username, pr.display_name AS author_display_name,
      pr.avatar_url AS author_avatar_url, pr.is_verified AS author_is_verified,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id, 'type', m.type, 'r2_key', m.r2_key, 'r2_bucket', m.r2_bucket,
        'width', m.width, 'height', m.height, 'duration_seconds', m.duration_seconds,
        'thumbnail_r2_key', m.thumbnail_r2_key, 'blur_hash', m.blur_hash,
        'alt_text', m.alt_text, 'filename', m.filename, 'mime_type', m.mime_type
      ) ORDER BY pm.display_order) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS media,
      COALESCE(array_agg(h.tag) FILTER (WHERE h.tag IS NOT NULL), '{}'::text[]) AS hashtags,
      EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS user_has_liked,
      EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = p_user_id) AS user_has_bookmarked,
      (SELECT pr2.reaction_type FROM post_reactions pr2 WHERE pr2.post_id = p.id AND pr2.user_id = p_user_id LIMIT 1) AS user_reaction
    FROM posts p
    JOIN profiles pr ON pr.id = p.author_id
    LEFT JOIN post_media pm ON pm.post_id = p.id
    LEFT JOIN media m ON m.id = pm.media_id
    LEFT JOIN post_hashtags ph ON ph.post_id = p.id
    LEFT JOIN hashtags h ON h.id = ph.hashtag_id
    WHERE p.deleted_at IS NULL
      AND p.published_at IS NOT NULL
      AND p.published_at <= NOW()
      AND p.author_id NOT IN (SELECT unnest(v_blocked_by))
      AND p.author_id NOT IN (SELECT unnest(v_blocked))
      AND p.author_id NOT IN (SELECT unnest(v_muted))
      AND (p.visibility = 'public' OR (p.visibility = 'followers' AND p.author_id = ANY(v_following)) OR (p.visibility = 'private' AND p.author_id = p_user_id))
    GROUP BY p.id, pr.username, pr.display_name, pr.avatar_url, pr.is_verified
  )
  SELECT * FROM base_posts
  WHERE (p_cursor IS NULL OR created_at < p_cursor)
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
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
-- 015_search_functions.sql
-- Search functions for users, posts, and trending hashtags

-- Function: Search users
CREATE OR REPLACE FUNCTION search_users(
  p_query TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_viewer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, username TEXT, display_name TEXT, avatar_url TEXT,
  bio TEXT, is_verified BOOLEAN, verification_tier verification_tier,
  follower_count BIGINT, is_following BOOLEAN, is_followed_by BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id, pr.username, pr.display_name, pr.avatar_url, pr.bio,
    pr.is_verified, pr.verification_tier,
    (SELECT count(*) FROM follows f WHERE f.following_id = pr.id) AS follower_count,
    CASE WHEN p_viewer_id IS NOT NULL THEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = pr.id) ELSE FALSE END AS is_following,
    CASE WHEN p_viewer_id IS NOT NULL THEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = pr.id AND f.following_id = p_viewer_id) ELSE FALSE END AS is_followed_by
  FROM profiles pr
  WHERE pr.deleted_at IS NULL
    AND (pr.username ILIKE '%' || p_query || '%' OR pr.display_name ILIKE '%' || p_query || '%' OR pr.bio ILIKE '%' || p_query || '%')
    AND (pr.username IS NOT NULL OR pr.display_name IS NOT NULL)
    AND (p_viewer_id IS NULL OR pr.id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = p_viewer_id) OR pr.id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = p_viewer_id))
  ORDER BY CASE WHEN pr.username ILIKE p_query || '%' THEN 0 WHEN pr.username ILIKE '%' || p_query || '%' THEN 1 ELSE 2 END, follower_count DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Search posts
CREATE OR REPLACE FUNCTION search_posts(
  p_query TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_viewer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, author_id UUID, type post_type, content TEXT,
  visibility post_visibility, like_count INT, comment_count INT,
  created_at TIMESTAMPTZ, author_username TEXT, author_display_name TEXT,
  author_avatar_url TEXT, author_is_verified BOOLEAN, media JSONB, hashtags TEXT[]
) AS $$
DECLARE
  v_following UUID[]; v_blocked_by UUID[]; v_blocked UUID[]; v_muted UUID[];
BEGIN
  IF p_viewer_id IS NOT NULL THEN
    SELECT array_agg(following_id) INTO v_following FROM follows WHERE follower_id = p_viewer_id;
    SELECT array_agg(blocker_id) INTO v_blocked_by FROM blocked_users WHERE blocked_id = p_viewer_id;
    SELECT array_agg(blocked_id) INTO v_blocked FROM blocked_users WHERE blocker_id = p_viewer_id;
    SELECT array_agg(muted_id) INTO v_muted FROM muted_users WHERE muter_id = p_viewer_id;
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.author_id, p.type, p.content, p.visibility,
    p.like_count, p.comment_count, p.created_at,
    pr.username AS author_username, pr.display_name AS author_display_name,
    pr.avatar_url AS author_avatar_url, pr.is_verified AS author_is_verified,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'type', m.type, 'r2_key', m.r2_key, 'r2_bucket', m.r2_bucket,
      'width', m.width, 'height', m.height, 'duration_seconds', m.duration_seconds,
      'thumbnail_r2_key', m.thumbnail_r2_key, 'blur_hash', m.blur_hash, 'alt_text', m.alt_text
    ) ORDER BY pm.display_order) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS media,
    COALESCE(array_agg(h.tag) FILTER (WHERE h.tag IS NOT NULL), '{}'::text[]) AS hashtags
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  LEFT JOIN post_media pm ON pm.post_id = p.id
  LEFT JOIN media m ON m.id = pm.media_id
  LEFT JOIN post_hashtags ph ON ph.post_id = p.id
  LEFT JOIN hashtags h ON h.id = ph.hashtag_id
  WHERE p.deleted_at IS NULL
    AND p.published_at IS NOT NULL
    AND p.published_at <= NOW()
    AND (p.search_vector @@ plainto_tsquery('english', p_query) OR p.content ILIKE '%' || p_query || '%')
    AND (p_viewer_id IS NULL OR p.author_id NOT IN (SELECT unnest(v_blocked_by)))
    AND (p_viewer_id IS NULL OR p.author_id NOT IN (SELECT unnest(v_blocked)))
    AND (p_viewer_id IS NULL OR p.author_id NOT IN (SELECT unnest(v_muted)))
    AND (p.visibility = 'public' OR (p.visibility = 'followers' AND p_viewer_id IS NOT NULL AND p.author_id = ANY(v_following)) OR (p.visibility = 'private' AND p.author_id = p_viewer_id))
  GROUP BY p.id, pr.username, pr.display_name, pr.avatar_url, pr.is_verified
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get trending hashtags
CREATE OR REPLACE FUNCTION get_trending_hashtags(
  p_limit INT DEFAULT 20,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (tag TEXT, post_count INT, trend_score DOUBLE PRECISION) AS $$
BEGIN
  RETURN QUERY
  SELECT h.tag, h.post_count,
    CASE WHEN p_since IS NOT NULL THEN h.post_count::DOUBLE PRECISION / GREATEST(EXTRACT(EPOCH FROM (NOW() - p_since)) / 3600, 1) ELSE h.post_count::DOUBLE PRECISION END AS trend_score
  FROM hashtags h
  WHERE h.post_count > 0 AND (p_since IS NULL OR h.updated_at >= p_since)
  ORDER BY trend_score DESC, h.post_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
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
-- 017_rls_enable.sql
-- Enable Row Level Security on all tables

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE muted_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reported_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin/moderator
CREATE OR REPLACE FUNCTION is_admin_or_moderator(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_role admin_role;
BEGIN
  SELECT role INTO v_role FROM admin_roles WHERE user_id = p_user_id AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW());
  RETURN v_role IN ('super_admin', 'admin', 'moderator');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 018_rls_core.sql
-- Core RLS policies: profiles, settings, follows, blocks, mutes

-- ============================================
-- PROFILES
-- ============================================
-- Public profiles readable by everyone (respecting privacy settings)
CREATE POLICY "profiles_public_read" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR
    account_visibility = 'public' OR
    (account_visibility = 'private' AND EXISTS(
      SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = profiles.id
    ))
  );

-- Users can update their own profile (except protected fields)
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any profile
CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE USING (is_admin_or_moderator(auth.uid()));

-- ============================================
-- USER SETTINGS & PRIVACY
-- ============================================
CREATE POLICY "user_settings_self" ON user_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_privacy_settings_self" ON user_privacy_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- FOLLOWS
-- ============================================
CREATE POLICY "follows_read" ON follows
  FOR SELECT USING (
    follower_id = auth.uid() OR following_id = auth.uid() OR
    EXISTS(SELECT 1 FROM profiles WHERE id = follows.following_id AND account_visibility = 'public')
  );

CREATE POLICY "follows_create" ON follows
  FOR INSERT WITH CHECK (follower_id = auth.uid());

CREATE POLICY "follows_delete" ON follows
  FOR DELETE USING (follower_id = auth.uid());

-- ============================================
-- FOLLOW REQUESTS
-- ============================================
CREATE POLICY "follow_requests_requester" ON follow_requests
  FOR SELECT USING (requester_id = auth.uid());

CREATE POLICY "follow_requests_target" ON follow_requests
  FOR SELECT USING (target_id = auth.uid());

CREATE POLICY "follow_requests_create" ON follow_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "follow_requests_update_target" ON follow_requests
  FOR UPDATE USING (target_id = auth.uid());

-- ============================================
-- BLOCKED/MUTED USERS
-- ============================================
CREATE POLICY "blocked_users_self" ON blocked_users
  FOR ALL USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "muted_users_self" ON muted_users
  FOR ALL USING (muter_id = auth.uid()) WITH CHECK (muter_id = auth.uid());
-- 019_rls_posts_media.sql
-- RLS policies for posts, media, and interactions

-- ============================================
-- POSTS
-- ============================================
-- Read: respect visibility and privacy
CREATE POLICY "posts_read" ON posts
  FOR SELECT USING (
    deleted_at IS NULL AND published_at IS NOT NULL AND published_at <= NOW() AND (
      visibility = 'public' OR
      (visibility = 'followers' AND EXISTS(
        SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = posts.author_id
      )) OR
      (visibility = 'private' AND author_id = auth.uid()) OR
      author_id = auth.uid()
    ) AND author_id NOT IN (
      SELECT blocked_id FROM blocked_users WHERE blocker_id = auth.uid()
    ) AND author_id NOT IN (
      SELECT blocker_id FROM blocked_users WHERE blocked_id = auth.uid()
    )
  );

-- Create: authenticated users
CREATE POLICY "posts_create" ON posts
  FOR INSERT WITH CHECK (author_id = auth.uid());

-- Update: own posts only
CREATE POLICY "posts_update" ON posts
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

-- Delete: own posts only
CREATE POLICY "posts_delete" ON posts
  FOR DELETE USING (author_id = auth.uid());

-- Admin can delete any post
CREATE POLICY "posts_admin_delete" ON posts
  FOR DELETE USING (is_admin_or_moderator(auth.uid()));

-- ============================================
-- MEDIA
-- ============================================
CREATE POLICY "media_read_owner" ON media
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "media_read_public" ON media
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM post_media pm
      JOIN posts p ON p.id = pm.post_id
      WHERE pm.media_id = media.id
        AND p.deleted_at IS NULL
        AND p.published_at IS NOT NULL
        AND p.published_at <= NOW()
        AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid())
    )
  );

CREATE POLICY "media_create" ON media
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "media_update" ON media
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "media_delete" ON media
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================
-- POST_MEDIA
-- ============================================
CREATE POLICY "post_media_read" ON post_media
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "post_media_write" ON post_media
  FOR ALL USING (
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.author_id = auth.uid())
  ) WITH CHECK (
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.author_id = auth.uid())
  );

-- ============================================
-- LIKES & REACTIONS
-- ============================================
CREATE POLICY "post_likes_read" ON post_likes
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_likes.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "post_likes_write" ON post_likes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "post_reactions_read" ON post_reactions
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM posts p WHERE p.id = post_reactions.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "post_reactions_write" ON post_reactions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- 020_rls_comments_hashtags.sql
-- RLS policies for comments, hashtags, mentions, stories, polls

-- ============================================
-- COMMENTS
-- ============================================
CREATE POLICY "comments_read" ON comments
  FOR SELECT USING (
    deleted_at IS NULL AND (
      EXISTS(SELECT 1 FROM posts p WHERE p.id = comments.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
    )
  );

CREATE POLICY "comments_create" ON comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid() AND
    EXISTS(SELECT 1 FROM posts p WHERE p.id = comments.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "comments_update" ON comments
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

CREATE POLICY "comments_delete" ON comments
  FOR DELETE USING (author_id = auth.uid());

-- ============================================
-- COMMENT LIKES/REACTIONS
-- ============================================
CREATE POLICY "comment_likes_read" ON comment_likes
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = comment_likes.comment_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "comment_likes_write" ON comment_likes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "comment_reactions_read" ON comment_reactions
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = comment_reactions.comment_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "comment_reactions_write" ON comment_reactions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- SHARES & BOOKMARKS
-- ============================================
CREATE POLICY "post_shares_read" ON post_shares
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM posts p WHERE p.id = post_shares.post_id AND p.deleted_at IS NULL AND p.visibility = 'public'));

CREATE POLICY "post_shares_write" ON post_shares
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "bookmarks_self" ON bookmarks
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- HASHTAGS
-- ============================================
CREATE POLICY "hashtags_read" ON hashtags FOR SELECT USING (true);
CREATE POLICY "hashtags_write" ON hashtags FOR ALL USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "post_hashtags_read" ON post_hashtags FOR SELECT USING (
  EXISTS(SELECT 1 FROM posts p WHERE p.id = post_hashtags.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
);
CREATE POLICY "post_hashtags_write" ON post_hashtags FOR ALL USING (
  EXISTS(SELECT 1 FROM posts p WHERE p.id = post_hashtags.post_id AND p.author_id = auth.uid())
) WITH CHECK (
  EXISTS(SELECT 1 FROM posts p WHERE p.id = post_hashtags.post_id AND p.author_id = auth.uid())
);

-- ============================================
-- MENTIONS
-- ============================================
CREATE POLICY "mentions_read" ON mentions
  FOR SELECT USING (
    mentioned_user_id = auth.uid() OR
    (post_id IS NOT NULL AND EXISTS(SELECT 1 FROM posts p WHERE p.id = mentions.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))) OR
    (comment_id IS NOT NULL AND EXISTS(SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = mentions.comment_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid())))
  );

CREATE POLICY "mentions_write" ON mentions
  FOR INSERT WITH CHECK (true); -- Created by triggers
-- 021_rls_stories_polls.sql
-- RLS policies for stories, polls

-- ============================================
-- STORIES
-- ============================================
CREATE POLICY "stories_read" ON stories
  FOR SELECT USING (
    expires_at > NOW() AND (
      visibility = 'public' OR
      (visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = stories.author_id)) OR
      author_id = auth.uid()
    ) AND author_id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = auth.uid())
  );

CREATE POLICY "stories_create" ON stories
  FOR INSERT WITH CHECK (author_id = auth.uid());

CREATE POLICY "stories_update" ON stories
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

CREATE POLICY "stories_delete" ON stories
  FOR DELETE USING (author_id = auth.uid());

CREATE POLICY "story_media_read" ON story_media
  FOR SELECT USING (EXISTS(SELECT 1 FROM stories s WHERE s.id = story_media.story_id AND s.expires_at > NOW() AND (s.visibility = 'public' OR (s.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = s.author_id)) OR s.author_id = auth.uid())));

CREATE POLICY "story_media_write" ON story_media
  FOR ALL USING (EXISTS(SELECT 1 FROM stories s WHERE s.id = story_media.story_id AND s.author_id = auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM stories s WHERE s.id = story_media.story_id AND s.author_id = auth.uid()));

CREATE POLICY "story_views_read" ON story_views
  FOR SELECT USING (viewer_id = auth.uid() OR EXISTS(SELECT 1 FROM stories s WHERE s.id = story_views.story_id AND s.author_id = auth.uid()));

CREATE POLICY "story_views_write" ON story_views
  FOR INSERT WITH CHECK (viewer_id = auth.uid());

CREATE POLICY "story_reactions_read" ON story_reactions
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM stories s WHERE s.id = story_reactions.story_id AND s.author_id = auth.uid()));

CREATE POLICY "story_reactions_write" ON story_reactions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- POLLS
-- ============================================
CREATE POLICY "polls_read" ON polls
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM posts p WHERE p.id = polls.post_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()))
  );

CREATE POLICY "polls_write" ON polls
  FOR ALL USING (EXISTS(SELECT 1 FROM posts p WHERE p.id = polls.post_id AND p.author_id = auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM posts p WHERE p.id = polls.post_id AND p.author_id = auth.uid()));

CREATE POLICY "poll_options_read" ON poll_options
  FOR SELECT USING (EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_options.poll_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid())));

CREATE POLICY "poll_options_write" ON poll_options
  FOR ALL USING (EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_options.poll_id AND p.author_id = auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_options.poll_id AND p.author_id = auth.uid()));

CREATE POLICY "poll_votes_read" ON poll_votes
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_votes.poll_id AND p.author_id = auth.uid()));

CREATE POLICY "poll_votes_write" ON poll_votes
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS(SELECT 1 FROM polls po JOIN posts p ON p.id = po.post_id WHERE po.id = poll_votes.poll_id AND p.deleted_at IS NULL AND (p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id)) OR p.author_id = auth.uid()) AND (po.expires_at IS NULL OR po.expires_at > NOW()))
  );
-- 022_rls_messaging.sql
-- RLS policies for messaging

-- ============================================
-- MESSAGING
-- ============================================
CREATE POLICY "conversations_read" ON conversations
  FOR SELECT USING (EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "conversations_create" ON conversations
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "conversations_update" ON conversations
  FOR UPDATE USING (EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid() AND cm.role IN ('admin', 'owner') AND cm.left_at IS NULL)) WITH CHECK (EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid() AND cm.role IN ('admin', 'owner') AND cm.left_at IS NULL));

CREATE POLICY "conversation_members_read" ON conversation_members
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = conversation_members.conversation_id AND cm2.user_id = auth.uid() AND cm2.left_at IS NULL));

CREATE POLICY "conversation_members_write" ON conversation_members
  FOR ALL USING (EXISTS(SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = conversation_members.conversation_id AND cm2.user_id = auth.uid() AND cm2.role IN ('admin', 'owner') AND cm2.left_at IS NULL)) WITH CHECK (EXISTS(SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = conversation_members.conversation_id AND cm2.user_id = auth.uid() AND cm2.role IN ('admin', 'owner') AND cm2.left_at IS NULL));

-- Self-manage membership
CREATE POLICY "conversation_members_self_leave" ON conversation_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "messages_read" ON messages
  FOR SELECT USING (EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "messages_create" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL)
  );

CREATE POLICY "messages_update" ON messages
  FOR UPDATE USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages_delete" ON messages
  FOR DELETE USING (sender_id = auth.uid());

CREATE POLICY "message_attachments_read" ON message_attachments
  FOR SELECT USING (EXISTS(SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_attachments.message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "message_attachments_write" ON message_attachments
  FOR ALL USING (EXISTS(SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_attachments.message_id AND m.sender_id = auth.uid() AND cm.left_at IS NULL)) WITH CHECK (EXISTS(SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_attachments.message_id AND m.sender_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "message_reactions_read" ON message_reactions
  FOR SELECT USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL));

CREATE POLICY "message_reactions_write" ON message_reactions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "message_read_receipts_read" ON message_read_receipts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "message_read_receipts_write" ON message_read_receipts
  FOR INSERT WITH CHECK (user_id = auth.uid());
-- 023_rls_notifications_admin.sql
-- RLS policies for notifications, admin, media processing, search

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE POLICY "notifications_self" ON notifications
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences_self" ON notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_self" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- REPORTS & MODERATION
-- ============================================
CREATE POLICY "reports_create" ON reported_content
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "reports_read_reporter" ON reported_content
  FOR SELECT USING (reporter_id = auth.uid());

CREATE POLICY "reports_read_moderator" ON reported_content
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "reports_update_moderator" ON reported_content
  FOR UPDATE USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "moderation_actions_read_moderator" ON moderation_actions
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "moderation_actions_write_moderator" ON moderation_actions
  FOR INSERT WITH CHECK (is_admin_or_moderator(auth.uid()) AND moderator_id = auth.uid());

-- ============================================
-- ADMIN & AUDIT
-- ============================================
CREATE POLICY "audit_logs_read_admin" ON audit_logs
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "admin_roles_read_admin" ON admin_roles
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "admin_roles_write_superadmin" ON admin_roles
  FOR ALL USING (
    EXISTS(SELECT 1 FROM admin_roles WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = TRUE)
  ) WITH CHECK (
    EXISTS(SELECT 1 FROM admin_roles WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = TRUE)
  );

CREATE POLICY "platform_settings_read_public" ON platform_settings
  FOR SELECT USING (is_public = true);

CREATE POLICY "platform_settings_read_admin" ON platform_settings
  FOR SELECT USING (is_admin_or_moderator(auth.uid()));

CREATE POLICY "platform_settings_write_admin" ON platform_settings
  FOR ALL USING (is_admin_or_moderator(auth.uid()) AND updated_by = auth.uid()) WITH CHECK (is_admin_or_moderator(auth.uid()) AND updated_by = auth.uid());

-- ============================================
-- MEDIA PROCESSING & STORAGE
-- ============================================
CREATE POLICY "media_processing_read_owner" ON media_processing_jobs
  FOR SELECT USING (EXISTS(SELECT 1 FROM media WHERE id = media_processing_jobs.media_id AND owner_id = auth.uid()));

CREATE POLICY "media_processing_write_system" ON media_processing_jobs
  FOR ALL USING (false); -- Only system/service role can write

CREATE POLICY "upload_sessions_self" ON media_upload_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "storage_usage_self" ON storage_usage
  FOR SELECT USING (user_id = auth.uid());

-- ============================================
-- SEARCH & TRENDING
-- ============================================
CREATE POLICY "search_history_self" ON search_history
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "trending_hashtags_read" ON trending_hashtags
  FOR SELECT USING (true);

CREATE POLICY "post_views_read" ON post_views
  FOR SELECT USING (viewer_id = auth.uid() OR EXISTS(SELECT 1 FROM posts p WHERE p.id = post_views.post_id AND p.author_id = auth.uid()));
-- 024_triggers_updated_at.sql
-- Triggers for updated_at timestamps

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_privacy_settings_updated_at ON user_privacy_settings;
CREATE TRIGGER update_user_privacy_settings_updated_at
  BEFORE UPDATE ON user_privacy_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_follow_requests_updated_at ON follow_requests;
CREATE TRIGGER update_follow_requests_updated_at
  BEFORE UPDATE ON follow_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_media_updated_at ON media;
CREATE TRIGGER update_media_updated_at
  BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hashtags_updated_at ON hashtags;
CREATE TRIGGER update_hashtags_updated_at
  BEFORE UPDATE ON hashtags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stories_updated_at ON stories;
CREATE TRIGGER update_stories_updated_at
  BEFORE UPDATE ON stories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_polls_updated_at ON polls;
CREATE TRIGGER update_polls_updated_at
  BEFORE UPDATE ON polls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversation_members_updated_at ON conversation_members;
CREATE TRIGGER update_conversation_members_updated_at
  BEFORE UPDATE ON conversation_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reported_content_updated_at ON reported_content;
CREATE TRIGGER update_reported_content_updated_at
  BEFORE UPDATE ON reported_content FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_settings_updated_at ON platform_settings;
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON platform_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_media_processing_jobs_updated_at ON media_processing_jobs;
CREATE TRIGGER update_media_processing_jobs_updated_at
  BEFORE UPDATE ON media_processing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_media_upload_sessions_updated_at ON media_upload_sessions;
CREATE TRIGGER update_media_upload_sessions_updated_at
  BEFORE UPDATE ON media_upload_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_storage_usage_updated_at ON storage_usage;
CREATE TRIGGER update_storage_usage_updated_at
  BEFORE UPDATE ON storage_usage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- 025_counter_triggers.sql
-- Counter triggers for likes, comments, hashtags, etc.

-- Post like count
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = like_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_post_like_count ON post_likes;
CREATE TRIGGER trigger_post_like_count
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_like_count();

-- Post comment count
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_post_comment_count ON comments;
CREATE TRIGGER trigger_post_comment_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- Comment like count
CREATE OR REPLACE FUNCTION update_comment_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET like_count = like_count - 1 WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_comment_like_count ON comment_likes;
CREATE TRIGGER trigger_comment_like_count
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION update_comment_like_count();
-- 026_more_counter_triggers.sql
-- More counter triggers

-- Comment reply count
CREATE OR REPLACE FUNCTION update_comment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_comment_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count - 1 WHERE id = OLD.parent_comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_comment_reply_count ON comments;
CREATE TRIGGER trigger_comment_reply_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_reply_count();

-- Hashtag post count
CREATE OR REPLACE FUNCTION update_hashtag_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE hashtags SET post_count = post_count + 1 WHERE id = NEW.hashtag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE hashtags SET post_count = post_count - 1 WHERE id = OLD.hashtag_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hashtag_post_count ON post_hashtags;
CREATE TRIGGER trigger_hashtag_post_count
  AFTER INSERT OR DELETE ON post_hashtags
  FOR EACH ROW EXECUTE FUNCTION update_hashtag_post_count();

-- Story view count
CREATE OR REPLACE FUNCTION update_story_view_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE stories SET view_count = view_count + 1 WHERE id = NEW.story_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_story_view_count ON story_views;
CREATE TRIGGER trigger_story_view_count
  AFTER INSERT ON story_views
  FOR EACH ROW EXECUTE FUNCTION update_story_view_count();

-- Story reply count
CREATE OR REPLACE FUNCTION update_story_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE stories SET reply_count = reply_count + 1 WHERE id = NEW.story_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE stories SET reply_count = reply_count - 1 WHERE id = OLD.story_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_story_reply_count ON story_reactions;
CREATE TRIGGER trigger_story_reply_count
  AFTER INSERT OR DELETE ON story_reactions
  FOR EACH ROW EXECUTE FUNCTION update_story_reply_count();

-- Poll vote count
CREATE OR REPLACE FUNCTION update_poll_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
    UPDATE polls SET vote_count = vote_count + 1 WHERE id = NEW.poll_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE poll_options SET vote_count = vote_count - 1 WHERE id = OLD.option_id;
    UPDATE polls SET vote_count = vote_count - 1 WHERE id = OLD.poll_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_poll_vote_count ON poll_votes;
CREATE TRIGGER trigger_poll_vote_count
  AFTER INSERT OR DELETE ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION update_poll_vote_count();
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
