#!/usr/bin/env node
/**
 * Apply all project Supabase migrations in lexical/numeric order.
 *
 * Features:
 * - Uses DATABASE_URL only (the service-role key is not needed for DDL).
 * - Records applied migrations in public.infinity_schema_migrations.
 * - Adopts already-complete migrations from projects that were migrated manually
 *   before this ledger existed, using catalog checks for their SQL objects.
 * - Stops on the first error and rolls back the failing migration.
 * - Uses a transaction-scoped advisory lock to prevent concurrent runners.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

function loadEnvironmentFile(filename) {
  if (!existsSync(filename)) return;
  const contents = readFileSync(filename, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    process.env[match[1]] = value;
  }
}

function loadEnvironment() {
  loadEnvironmentFile('.env.local');
  loadEnvironmentFile('.env');
}

loadEnvironment();

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const LOCK_KEY = 73190429;

function cleanIdentifier(value) {
  return value.replaceAll('"', '').trim();
}

function extractSignatures(sql, filename) {
  const source = sql.replace(/^\s*--.*$/gm, '');
  const signatures = [];
  const add = (kind, name, extra = {}) => signatures.push({ kind, name: cleanIdentifier(name), ...extra });

  // CREATE EXTENSION is IF NOT EXISTS in this project and is safe to replay.
  // It is intentionally excluded from migration completeness checks because
  // Supabase may preinstall some extensions in a new project.
  for (const m of source.matchAll(/\bCREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?([\w]+)["']?/gi)) add('type', m[1]);
  for (const m of source.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(["']?[\w]+["']?)/gi)) add('table', m[1]);
  for (const m of source.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(["']?[\w]+["']?)/gi)) add('index', m[1]);
  for (const m of source.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(public|auth)\.)?(["']?[\w]+["']?)\s*\(/gi)) {
    add('function', m[2], { schema: m[1] || 'public' });
  }
  for (const m of source.matchAll(/\bCREATE\s+POLICY\s+["']([^"']+)["']\s+ON\s+(?:(public|auth)\.)?(["']?[\w]+["']?)/gi)) {
    add('policy', m[1], { schema: m[2] || 'public', table: cleanIdentifier(m[3]) });
  }
  for (const m of source.matchAll(/\bCREATE\s+TRIGGER\s+(["']?[\w]+["']?)[\s\S]*?\bON\s+(?:(public|auth)\.)?(["']?[\w]+["']?)/gi)) {
    add('trigger', m[1], { schema: m[2] || 'public', table: cleanIdentifier(m[3]) });
  }
  for (const m of source.matchAll(/\bALTER\s+TABLE\s+(?:(public|auth)\.)?(["']?[\w]+["']?)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(["']?[\w]+["']?)/gi)) {
    add('column', m[3], { schema: m[1] || 'public', table: cleanIdentifier(m[2]) });
  }
  for (const m of source.matchAll(/\bALTER\s+TABLE\s+(?:(public|auth)\.)?(["']?[\w]+["']?)\s+ADD\s+CONSTRAINT\s+(["']?[\w]+["']?)/gi)) {
    add('constraint', m[3], { schema: m[1] || 'public', table: cleanIdentifier(m[2]) });
  }
  for (const m of source.matchAll(/\bALTER\s+TABLE\s+(?:(public|auth)\.)?(["']?[\w]+["']?)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)) {
    add('rls', m[2], { schema: m[1] || 'public' });
  }

  // The auth migrations replace a function/trigger that already exists from 027.
  // Use the function-body marker alone so 027/028 objects do not look like a
  // partially-applied migration when only the newest definition is missing.
  if (filename.startsWith('028_')) {
    return [{ kind: 'functionContains', name: 'handle_new_user', schema: 'public', marker: 'selected_account_type' }];
  }
  if (filename.startsWith('029_')) {
    return [{ kind: 'functionContains', name: 'handle_new_user', schema: 'public', marker: 'Could not initialize profile for auth user' }];
  }

  // Migration 010 also seeds the platform settings, not just the table/indexes.
  if (filename.startsWith('010_')) add('platformSettingsSeed', 'platform_settings');

  // The signature parser must never silently approve a migration with no checks.
  if (signatures.length === 0) {
    throw new Error(`No migration signature could be extracted from ${filename}; refusing to run an untracked migration.`);
  }
  return signatures;
}

async function signatureExists(client, signature) {
  switch (signature.kind) {
    case 'extension': {
      const r = await client.query('SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) AS present', [signature.name]);
      return r.rows[0].present;
    }
    case 'type': {
      const r = await client.query("SELECT to_regtype('public.' || $1) IS NOT NULL AS present", [signature.name]);
      return r.rows[0].present;
    }
    case 'table':
    case 'index': {
      const r = await client.query("SELECT to_regclass('public.' || $1) IS NOT NULL AS present", [signature.name]);
      return r.rows[0].present;
    }
    case 'function': {
      const r = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = $1 AND p.proname = $2
         ) AS present`,
        [signature.schema, signature.name],
      );
      return r.rows[0].present;
    }
    case 'functionContains': {
      const r = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = $1 AND p.proname = $2 AND position(lower($3) in lower(p.prosrc)) > 0
         ) AS present`,
        [signature.schema, signature.name, signature.marker],
      );
      return r.rows[0].present;
    }
    case 'policy': {
      const r = await client.query(
        'SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = $1 AND tablename = $2 AND policyname = $3) AS present',
        [signature.schema, signature.table, signature.name],
      );
      return r.rows[0].present;
    }
    case 'trigger': {
      const r = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE NOT t.tgisinternal AND n.nspname = $1 AND c.relname = $2 AND t.tgname = $3
         ) AS present`,
        [signature.schema, signature.table, signature.name],
      );
      return r.rows[0].present;
    }
    case 'column': {
      const r = await client.query(
        'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS present',
        [signature.schema, signature.table, signature.name],
      );
      return r.rows[0].present;
    }
    case 'constraint': {
      const r = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2 AND con.conname = $3
         ) AS present`,
        [signature.schema, signature.table, signature.name],
      );
      return r.rows[0].present;
    }
    case 'rls': {
      const r = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2 AND c.relrowsecurity
         ) AS present`,
        [signature.schema, signature.name],
      );
      return r.rows[0].present;
    }
    case 'platformSettingsSeed': {
      const keys = ['max_post_length', 'max_comment_length', 'max_media_per_post', 'max_file_size_mb', 'allowed_image_types', 'allowed_video_types', 'allowed_audio_types', 'allowed_document_types', 'story_duration_hours', 'max_poll_options', 'max_poll_duration_days', 'default_post_visibility', 'enable_registration', 'require_email_verification'];
      const r = await client.query('SELECT COUNT(*) = $1 AS present FROM public.platform_settings WHERE key = ANY($2::text[])', [keys.length, keys]);
      return r.rows[0].present;
    }
    default:
      throw new Error(`Unsupported migration signature type: ${signature.kind}`);
  }
}

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  if (files.length === 0) throw new Error(`No SQL migrations found in ${MIGRATIONS_DIR}`);

  if (process.argv.includes('--dry-run')) {
    console.log(`Validated ${files.length} migration files:`);
    for (const filename of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
      const signatures = extractSignatures(sql, filename);
      const summary = signatures.reduce((acc, item) => { acc[item.kind] = (acc[item.kind] || 0) + 1; return acc; }, {});
      console.log(`  ${filename}: ${signatures.length} schema checks (${Object.entries(summary).map(([key, value]) => `${key}=${value}`).join(', ')})`);
    }
    console.log('Dry run only: no database connection or changes were made.');
    return;
  }

  if (!DATABASE_URL) throw new Error('DATABASE_URL is missing. Add the Supabase PostgreSQL connection string to .env.local.');

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    application_name: 'infinity-haisuperhero-migrations',
  });

  let applied = 0;
  let adopted = 0;
  let skipped = 0;

  try {
    const info = await pool.query('SELECT current_database() AS database, current_user AS db_user, current_setting(\'server_version\') AS server_version');
    console.log(`Connected to PostgreSQL database "${info.rows[0].database}" (${info.rows[0].server_version}).`);
    console.log(`Found ${files.length} migration files (001–${files[files.length - 1].slice(0, 3)}).`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.infinity_schema_migrations (
        version TEXT PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_method TEXT NOT NULL CHECK (applied_method IN ('applied', 'adopted')),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const filename of files) {
      const path = join(MIGRATIONS_DIR, filename);
      const sql = readFileSync(path, 'utf8');
      const version = filename.match(/^\d+/)?.[0];
      if (!version) throw new Error(`Invalid migration filename: ${filename}`);
      const digest = checksum(sql);
      const signatures = extractSignatures(sql, filename);
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);

        const ledger = await client.query(
          'SELECT checksum, filename FROM public.infinity_schema_migrations WHERE version = $1',
          [version],
        );

        if (ledger.rowCount) {
          if (ledger.rows[0].checksum !== digest || ledger.rows[0].filename !== filename) {
            throw new Error(`Migration ${filename} differs from the version already recorded in infinity_schema_migrations. Do not edit an applied migration; create a new numbered migration instead.`);
          }
          await client.query('COMMIT');
          skipped++;
          console.log(`SKIP ${filename} (already recorded)`);
          continue;
        }

        const states = await Promise.all(signatures.map(async (signature) => ({ signature, present: await signatureExists(client, signature) })));
        const presentCount = states.filter((state) => state.present).length;

        if (presentCount === signatures.length) {
          await client.query(
            `INSERT INTO public.infinity_schema_migrations (version, filename, checksum, applied_method)
             VALUES ($1, $2, $3, 'adopted')`,
            [version, filename, digest],
          );
          await client.query('COMMIT');
          adopted++;
          console.log(`ADOPT ${filename} (all schema objects already exist)`);
          continue;
        }

        if (presentCount > 0) {
          const missing = states.filter((state) => !state.present).map((state) => `${state.signature.kind}:${state.signature.name}`);
          const present = states.filter((state) => state.present).map((state) => `${state.signature.kind}:${state.signature.name}`);
          throw new Error(
            `Migration ${filename} appears partially applied (${presentCount}/${signatures.length} schema checks exist). ` +
            `No SQL was run for this migration. Present: ${present.slice(0, 8).join(', ')}. ` +
            `Missing: ${missing.slice(0, 8).join(', ')}. Inspect this migration before retrying.`,
          );
        }

        console.log(`RUN  ${filename}`);
        await client.query(sql);

        const after = await Promise.all(signatures.map(async (signature) => ({ signature, present: await signatureExists(client, signature) })));
        const missingAfter = after.filter((state) => !state.present);
        if (missingAfter.length) {
          throw new Error(`Migration ${filename} ran but post-checks failed: ${missingAfter.map((state) => `${state.signature.kind}:${state.signature.name}`).slice(0, 10).join(', ')}`);
        }

        await client.query(
          `INSERT INTO public.infinity_schema_migrations (version, filename, checksum, applied_method)
           VALUES ($1, $2, $3, 'applied')`,
          [version, filename, digest],
        );
        await client.query('COMMIT');
        applied++;
        console.log(`DONE ${filename}`);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* the connection may already be in an error state */ }
        throw new Error(`${filename} failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        client.release();
      }
    }

    console.log('\nMigration run finished successfully.');
    console.log(`Applied now: ${applied} | Adopted existing: ${adopted} | Already recorded: ${skipped} | Total: ${files.length}`);
    console.log('Signup trigger version:');
    const triggerCheck = await pool.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'auth' AND c.relname = 'users'
            AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal
        ) AS trigger_present,
        EXISTS (
          SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
            AND position('Could not initialize profile for auth user' in p.prosrc) > 0
        ) AS function_fixed
    `);
    if (!triggerCheck.rows[0]?.trigger_present || !triggerCheck.rows[0]?.function_fixed) {
      throw new Error('Final auth check failed: migration 029 must install public.handle_new_user() and auth.users.on_auth_user_created.');
    }
    console.log('  OK: migration 029 signup trigger and function are installed.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\nMIGRATION STOPPED. No later migrations were attempted.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
