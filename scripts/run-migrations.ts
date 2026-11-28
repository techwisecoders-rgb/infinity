#!/usr/bin/env npx tsx
/**
 * Run all Supabase migrations in order
 * Usage: npx tsx scripts/run-migrations.ts
 * Requires: DATABASE_URL in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found. Check .env.local (or .env).');
  console.error('   Please copy .env.example to .env.local and fill in your Supabase credentials');
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Supabase credentials not found. Check .env.local (or .env).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' }
});

// Create a direct PostgreSQL client for running migrations
const pgPool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');

  // Get all migration files in order
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files:\n`);
  files.forEach(f => console.log(`  📄 ${f}`));
  console.log('');

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(filePath, 'utf-8');

    console.log(`\n▶ Running ${file}...`);

    try {
      // Execute the entire migration file as a single transaction
      await pgPool.query(sql);
      console.log(`  ✅ ${file} - Completed successfully`);
      successCount++;
    } catch (error: any) {
      console.log(`  ❌ ${file} - Failed: ${error.message}`);
      failCount++;
      
      // Continue with next migration
      console.log(`  ⚠ Continuing with next migration...`);
    }
  }

  await pgPool.end();

  console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);
  
  if (failCount > 0) {
    console.log('\n⚠️  Some migrations failed. Check the errors above.');
    console.log('   You may need to run failed migrations manually via Supabase SQL Editor.');
    process.exit(1);
  } else {
    console.log('\n🎉 All migrations completed successfully!');
    console.log('\nNext steps:');
    console.log('   1. Start the dev server: npm run dev');
    console.log('   2. Check health endpoint: http://localhost:3000/api/health');
    console.log('   3. Test password registration and login from /login.');
  }
}

runMigrations().catch(console.error);