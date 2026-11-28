import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env' });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testCreateUser() {
  const testEmail = 'testuser@gmail.com';
  
  console.log('Testing signUp instead of signInWithOtp...');
  const { data: signUpData, error: signUpError } = await admin.auth.signUp({
    email: testEmail,
    password: 'TestPass123!',
    options: {
      data: { account_type: 'personal' },
      emailRedirectTo: 'http://localhost:3000/auth/callback',
    },
  });
  console.log('signUp result:', signUpData, signUpError);
  
  // Try signInWithPassword
  console.log('\nTesting signInWithPassword...');
  const { data: signInData, error: signInError } = await admin.auth.signInWithPassword({
    email: testEmail,
    password: 'TestPass123!',
  });
  console.log('signInWithPassword result:', signInData, signInError);
  
  await pgPool.end();
}

testCreateUser().catch(console.error);