import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testAuth() {
  console.log('Testing Supabase Auth...');
  
  // Test creating a user
  const { data, error } = await admin.auth.admin.createUser({
    email: 'testuser@example.com',
    password: 'TestPass123!',
    email_confirm: true,
  });
  
  console.log('Create user result:', data, error);
  
  // Test signInWithOtp
  const { data: otpData, error: otpError } = await admin.auth.signInWithOtp({
    email: 'testuser2@example.com',
    options: { shouldCreateUser: true }
  });
  
  console.log('OTP result:', otpData, otpError);
}

testAuth().catch(console.error);