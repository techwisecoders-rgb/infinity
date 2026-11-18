# API Documentation

## Base URL
- Development: `http://localhost:3000/api`
- Production: `https://yourdomain.com/api`

## Authentication
All authenticated endpoints require a valid Supabase session cookie. The middleware automatically handles session refresh.

## Response Format

### Success
```json
{
  "success": true,
  "data": {},
  "message": "Operation completed"
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## Error Codes
- `UNAUTHORIZED` (401) - No valid session
- `FORBIDDEN` (403) - Access denied
- `NOT_FOUND` (404) - Resource not found
- `VALIDATION_ERROR` (400) - Invalid input
- `CONFLICT` (409) - Duplicate resource
- `DATABASE_ERROR` (500) - Server error

## Endpoints

### Health
- `GET /api/health` - System health check

### Authentication
- `GET /api/auth/me` - Current user + profile

### Users
- `GET /api/users/me/profile` - Get own profile
- `PUT /api/users/me/profile` - Update profile
- `POST /api/users/{id}/follow` - Follow user
- `DELETE /api/users/{id}/follow` - Unfollow user

### Posts
- `GET /api/posts/feed` - Home feed (paginated)
- `GET /api/posts?id={id}` - Get single post
- `POST /api/posts` - Create post
- `POST /api/posts/{id}/like` - Like post
- `DELETE /api/posts/{id}/like` - Unlike post
- `GET /api/posts/{id}/comments` - Get comments
- `POST /api/posts/{id}/comments` - Create comment

### Media
- `POST /api/media/upload-url` - Get presigned upload URL
- `POST /api/media/verify` - Verify upload completion

### Notifications
- `GET /api/notifications` - List notifications
- `POST /api/notifications` - Mark as read

### Search
- `GET /api/search?q={query}&type={type}` - Search users/posts/hashtags
- `GET /api/trending/hashtags` - Trending hashtags

### Conversations
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Create conversation

## Pagination
Cursor-based pagination using `cursor` parameter (timestamp) and `limit`.

Example:
```
GET /api/posts/feed?limit=20&cursor=2024-01-15T10:30:00Z
```

Response includes:
```json
{
  "pagination": {
    "next_cursor": "2024-01-15T09:00:00Z",
    "has_more": true
  }
}
```

## Post Creation
```json
POST /api/posts
{
  "type": "image|video|text|audio|file|service|product|vacancy|job|poll",
  "content": "Post text...",
  "visibility": "public|followers|private|close_friends",
  "location": "Optional location name",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "media_ids": ["uuid1", "uuid2"],
  "scheduled_at": "2024-01-20T10:00:00Z"
}
```

## Media Upload Flow
1. `POST /api/media/upload-url` with `{filename, mime_type, size_bytes}`
2. Upload file to returned `upload_url` using PUT
3. `POST /api/media/verify` with `{upload_id, r2_key, r2_bucket}`

## Rate Limits
- Auth endpoints: 10 req/min
- Feed endpoints: 60 req/min
- Media upload: 20 req/min
- Search: 30 req/min

## Webhooks
Configure in Supabase Dashboard for:
- User signup → Create profile
- User delete → Cleanup data