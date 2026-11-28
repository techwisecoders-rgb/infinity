#!/usr/bin/env npx tsx
/**
 * Create test users for development
 * Usage: npx tsx scripts/create-test-users.ts
 * Requires: DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pg from 'pg';

// Load environment variables
dotenv.config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables in .env.local');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' }
});

const pgPool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const TEST_USERS = [
  {
    email: 'user@test.infinity',
    account_type: 'personal',
    display_name: 'Test User',
    username: 'testuser',
  },
  {
    email: 'work@test.infinity',
    account_type: 'creator',
    display_name: 'Test Work',
    username: 'testwork',
  },
  {
    email: 'business@test.infinity',
    account_type: 'business',
    display_name: 'Test Business',
    username: 'testbusiness',
  },
];

async function createTestUsers() {
  console.log('🚀 Creating test users...\n');

  for (const userData of TEST_USERS) {
    console.log(`\n📝 Creating ${userData.account_type} user: ${userData.email}`);

    try {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: userData.email,
        password: 'TestPass123!', // Temporary password
        email_confirm: true,
        user_metadata: {
          account_type: userData.account_type,
        },
      });

      if (authError) {
        // Check if user already exists
        if (authError.message.includes('already registered')) {
          console.log(`  ⚠ User already exists, updating...`);
          
          // Get existing user
          const { data: existingUsers } = await adminClient.auth.admin.listUsers();
          const existingUser = existingUsers.users.find(u => u.email === userData.email);
          
          if (existingUser) {
            // Update user metadata
            await adminClient.auth.admin.updateUserById(existingUser.id, {
              user_metadata: { account_type: userData.account_type },
            });
            
            // Update profile
            await adminClient.from('profiles').upsert({
              id: existingUser.id,
              username: userData.username,
              display_name: userData.display_name,
              account_type: userData.account_type,
              updated_at: new Date().toISOString(),
            });
            
            console.log(`  ✅ Updated existing user: ${userData.email}`);
            continue;
          }
        }
        console.log(`  ❌ Auth error: ${authError.message}`);
        continue;
      }

      const user = authData.user;
      console.log(`  ✅ Auth user created: ${user.id}`);

      // Create profile
      const { error: profileError } = await adminClient.from('profiles').insert({
        id: user.id,
        username: userData.username,
        display_name: userData.display_name,
        account_type: userData.account_type,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (profileError) {
        console.log(`  ⚠ Profile error: ${profileError.message}`);
      } else {
        console.log(`  ✅ Profile created`);
      }

      // Create user settings
      await adminClient.from('user_settings').insert({
        user_id: user.id,
        theme: 'system',
        language: 'en',
        email_notifications: true,
        push_notifications: true,
        show_online_status: true,
        allow_direct_messages: 'followers',
        media_autoplay: true,
        data_saver: false,
      });

      // Create privacy settings
      await adminClient.from('user_privacy_settings').insert({
        user_id: user.id,
        account_visibility: 'public',
        show_profile_to: 'everyone',
        show_posts_to: 'everyone',
        show_followers_list: true,
        show_following_list: true,
        allow_tagging: 'followers',
        allow_mentions: 'followers',
        show_read_receipts: true,
        index_profile_in_search: true,
      });

      console.log(`  ✅ Settings created`);

    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  await pgPool.end();

  console.log('\n🎉 Test users creation completed!');
  console.log('\nTest accounts:');
  console.log('  👤 User (personal):    user@test.infinity');
  console.log('  💼 Work (creator):     work@test.infinity');
  console.log('  🏢 Business (business): business@test.infinity');
  console.log('\nAll accounts have password: TestPass123!');
  console.log('\nFor password login, use the email addresses and passwords shown above on /login.');
}

createTestUsers().catch(console.error);