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