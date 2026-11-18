# Deployment Guide — Hostinger

## Required Hostinger configuration

| Setting | Value |
|---|---|
| Application type | Next.js |
| Node.js version | **22.x** |
| Package manager | npm |
| Install command | `npm install` (Hostinger may run this automatically) |
| Build command | `npm run build` |
| Output directory | `.next` |
| Start command | `npm run start` if requested by the panel |

The project is locked to Node.js `>=22.0.0 <23` because the resolved Supabase packages declare Node.js 22 or newer. Do not deploy this dependency lock under Node.js 20.

## Important build safeguards

The package `build` script runs `scripts/hostinger-build.mjs`. This script sets `NODE_ENV=production`, removes a stale root-level `middleware.*` file if the Next.js 16 `proxy.*` file is also present, and invokes `next build --webpack`. This handles the common case where an old `middleware.ts` remains tracked in GitHub after `proxy.ts` has been added.

The correct source layout contains `proxy.ts` and must not contain a root-level `middleware.ts` alongside it. The build safeguard deletes the stale middleware copy in Hostinger's temporary build workspace; also commit the deletion to GitHub so the repository itself is clean.

## GitHub update procedure

1. Extract this ZIP.
2. Replace the contents of the existing repository working folder with the contents of the `infinity-haisuperhero` folder. Do not merely overwrite files while leaving old files behind.
3. Confirm the root contains `proxy.ts` and does not contain `middleware.ts`, `middleware.js`, `middleware.mjs` or `middleware.jsx`.
4. Stage and push the deletion and additions:

```bash
git add -A
git status
git commit -m "Fix Next.js 16 Hostinger build and proxy conflict"
git push origin main
```

5. Confirm Hostinger is deploying the new commit on `main`, not an earlier commit.

## Environment variables

Configure Supabase, R2 and optional OAuth credentials in Hostinger's environment-variable settings. Do not upload or commit `.env` files. Remove any manually configured `NODE_ENV` variable from Hostinger; the build script sets it to `production` for the build.

At minimum, configure the variables required by the features you enable:

```env
NEXT_PUBLIC_APP_URL=https://your-domain.example
NEXT_PUBLIC_API_URL=https://your-domain.example/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
R2_PUBLIC_BASE_URL=
```

Never commit actual secret values. If secrets were previously committed to a public GitHub repository, rotate them.

## Deployment verification

After deployment, check:

1. The log reports Node.js 22.x.
2. The build invokes `node scripts/hostinger-build.mjs`.
3. If the old middleware file was present, the log reports that it was removed because `proxy.ts` is present.
4. The log then reports `next build --webpack`.
5. `GET /api/health` responds according to the configured service dependencies.
6. `/sw.js` is served from `public/sw.js`.

## Troubleshooting

- **Node engine warning:** Switch Hostinger from Node 20 to Node 22.x.
- **Both middleware and proxy detected:** Ensure the build command is `npm run build` and the new `package.json` and `scripts/hostinger-build.mjs` have been pushed. The build script removes stale root-level middleware files when proxy exists.
- **Non-standard NODE_ENV warning:** Remove the Hostinger `NODE_ENV` variable. The build script forces production mode for the production build.
- **Missing environment variables:** Configure them in Hostinger; never paste secrets into source files.
