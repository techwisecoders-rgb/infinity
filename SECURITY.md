# Security Documentation

## Authentication
- Supabase Auth (OAuth 2.0/OIDC)
- JWT sessions with auto-refresh
- bcrypt password hashing
- Email verification required
- Rate limited auth endpoints

## Authorization (RLS)
All tables have RLS with policies:
- **Own data**: `USING (user_id = auth.uid())`
- **Visibility**: Public/followers/private with block/mute checks
- **Admin**: `USING (is_admin_or_moderator(auth.uid()))`

## Data Protection
- TLS 1.3 in transit
- AES-256 at rest (Supabase managed)
- Secrets only in env vars
- PII: Email in Auth only, IP hashed in audit logs

## API Security
- Zod validation on all inputs
- Parameterized queries (no SQL injection)
- React auto-escaping (XSS prevention)
- Rate limits: Auth 10/min, Feed 60/min, Upload 20/min, Search 30/min
- CORS restricted to app domain

## Media Security (R2)
- Private buckets by default
- Presigned URLs (1hr expiry) for upload
- Signed URLs for private content
- MIME + magic bytes validation
- Size limits: 10MB images, 100MB video

## Security Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
CSP: Restrictive policy for scripts/styles/fonts/images/connect
```

## Audit Logging
All sensitive ops logged to `audit_logs`:
- Auth events, admin actions, content moderation, settings changes

## Vulnerability Prevention
- **IDOR**: UUIDs + RLS scoping
- **CSRF**: SameSite=Lax + Origin validation
- **XSS**: React escaping + CSP
- **SQL Injection**: Parameterized queries only

## Compliance
- **GDPR**: Access/Deletion/Portability via API
- **CCPA**: Opt-out via privacy settings, no data sales

## Deployment Checklist
- [ ] Env vars in production
- [ ] Service role key server-only
- [ ] RLS on all tables
- [ ] Admin roles via SQL only
- [ ] R2 CORS for production domain
- [ ] CSP tested
- [ ] Rate limiting active
- [ ] Audit logging verified
- [ ] Backup encryption
- [ ] Monitoring alerts
- [ ] Dependency scanning in CI