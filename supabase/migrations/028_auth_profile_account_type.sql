-- 028_auth_profile_account_type.sql
-- Preserve the selected account type when Supabase creates a profile on signup.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  selected_account_type account_type;
BEGIN
  selected_account_type := CASE
    WHEN NEW.raw_user_meta_data->>'account_type' IN ('personal', 'creator', 'business')
      THEN (NEW.raw_user_meta_data->>'account_type')::account_type
    ELSE 'personal'::account_type
  END;

  INSERT INTO profiles (id, username, display_name, account_type)
  VALUES (NEW.id, NULL, NULL, selected_account_type)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO user_privacy_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
