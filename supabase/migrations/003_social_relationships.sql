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