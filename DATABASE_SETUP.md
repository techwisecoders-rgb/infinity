# Database Setup Guide

## Prerequisites
1. **Supabase Account** - https://supabase.com
2. **Cloudflare R2 Account** - https://dash.cloudflare.com

## Step 1: Create Supabase Project
1. Go to https://supabase.com/dashboard
2. Click "New Project", name it "infinity-social"
3. Set secure password, select region
4. Wait ~2 minutes

## Step 2: Get Supabase Credentials
From Settings → API:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- service_role key → `SUPABASE_SERVICE_ROLE_KEY` (secret!)

From Settings → Database:
- Connection string → `DATABASE_URL` (use Transaction pooler)

## Step 3: Configure Cloudflare R2
1. Create bucket `infinity-media`
2. Create API token with R2 Edit permissions
3. Note: Account ID, Access Key, Secret Key, Endpoint

## Step 4: R2 CORS Policy
```json
[{"AllowedOrigins":["http://localhost:3000","https://yourdomain.com"],"AllowedMethods":["GET","PUT","POST","HEAD","DELETE"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
```

## Step 5: Run Migrations (in order)
Use Supabase SQL Editor or CLI:
```bash
supabase link --project-ref YOUR_REF
supabase db push
```

Migration order (001-027):
1. 001_extensions_and_types.sql
2. 002_profiles_and_settings.sql
3. 003_social_relationships.sql
4. 004_posts_and_media.sql
5. 005_interactions_and_comments.sql
6. 006_hashtags_and_search.sql
7. 007_stories_and_polls.sql
8. 008_messaging.sql
9. 009_notifications.sql
10. 010_moderation_and_admin.sql
11. 011_storage_metadata.sql
12. 012_indexes_and_functions.sql
13. 013_feed_functions.sql
14. 014_post_detail_function.sql
15. 015_search_functions.sql
16. 016_conversations_function.sql
17. 017_rls_enable.sql
18. 018_rls_core.sql
19. 019_rls_posts_media.sql
20. 020_rls_comments_hashtags.sql
21. 021_rls_stories_polls.sql
22. 022_rls_messaging.sql
23. 023_rls_notifications_admin.sql
24. 024_triggers_updated_at.sql
25. 025_counter_triggers.sql
26. 026_more_counter_triggers.sql
27. 027_system_triggers.sql

## Step 6: Environment Variables
```bash
cp .env.example .env.local
```
Fill all required values.

## Step 7: Configure Supabase Auth
Settings → Authentication:
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`
- Enable Email Confirmations (recommended)
- Google OAuth (optional): Add credentials

## Step 8: Verify
```bash
npm run dev
```
Check http://localhost:3000/api/health

## Step 9: Create Admin User
After registering, run in SQL Editor:
```sql
INSERT INTO admin_roles (user_id, role, granted_by)
VALUES ('YOUR_USER_ID', 'super_admin', 'YOUR_USER_ID');
```

## Troubleshooting
- Migration fails: Check order, previous completion
- RLS blocks: Verify policies, auth.uid()
- R2 upload fails: Check CORS, credentials
- Auth issues: Verify redirect URLs, Site URL