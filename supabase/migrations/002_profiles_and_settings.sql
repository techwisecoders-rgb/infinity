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