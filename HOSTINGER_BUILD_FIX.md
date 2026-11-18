# Hostinger / Next.js 16 deployment fix

This project uses the Next.js 16 `proxy.ts` convention. Do not keep `middleware.ts` alongside it.

## What the build scripts do

- `postinstall` removes legacy `middleware.*` files and duplicate `proxy.*` files after dependency installation.
- `prebuild` repeats the check immediately before the production build.
- `build` repeats the check, then runs `next build --webpack` with `NODE_ENV=production`.
- The cleanup checks both the project root and `src/`.

## Hostinger settings

- Node.js: 22.x
- Package manager: npm
- Build command: `npm run build`
- Output directory: `.next`
- Start command, if required: `npm run start`

Do not set `NODE_ENV` to `development`, `staging`, or another custom value in Hostinger. The production build wrapper supplies `NODE_ENV=production`.

## Important GitHub deployment step

Replace the contents of the repository with this project, including `package.json`, `scripts/`, and `proxy.ts`. Ensure the old tracked `middleware.ts` is deleted, then commit and push. A ZIP downloaded locally does not change the GitHub repository by itself.

After updating GitHub, the Hostinger build log must show `node scripts/prepare-hostinger.mjs` during `postinstall` or `prebuild`, followed by `node scripts/hostinger-build.mjs`. If it still shows only `next build --webpack`, Hostinger is building an older commit or an old `package.json`.
