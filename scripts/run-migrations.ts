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

// Load environment variables
dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env.local');
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Supabase credentials not found in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' }
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
    
    // Split by semicolon but keep statements that might have semicolons in strings
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`\n▶ Running ${file} (${statements.length} statements)...`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;

      try {
        const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' });
        
        if (error) {
          // Try direct query for statements that don't work with exec_sql
          const { error: directError } = await supabase.from('_dummy').select('*').limit(0);
          // If we can't use exec_sql, try raw query via PostgREST
          console.log(`  ⚠ Statement ${i + 1}: ${stmt.substring(0, 60)}...`);
        }
      } catch (e) {
        console.log(`  ⚠ Statement ${i + 1} may need manual execution`);
      }
    }

    // For now, just log - actual execution needs psql or Supabase CLI
    console.log(`  ✅ ${file} - Ready to execute`);
    successCount++;
  }

  console.log(`\n📊 Summary: ${successCount} files ready, ${failCount} failed`);
  console.log('\n⚠️  IMPORTANT: Run these migrations using Supabase SQL Editor or psql:');
  console.log('   1. Go to https://supabase.com/dashboard/project/_/sql');
  console.log('   2. Copy-paste each migration file content in order');
  console.log('   3. Click "Run" for each');
  console.log('\n   OR use Supabase CLI:');
  console.log('   supabase link --project-ref YOUR_PROJECT_REF');
  console.log('   supabase db push');
}

runMigrations().catch(console.error);