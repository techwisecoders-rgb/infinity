-- 029_auth_signup_trigger_fix.sql
-- Keep the Supabase Auth insert trigger minimal. A failure while inserting optional
-- settings/privacy rows must not roll back creation of auth.users.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_account_type public.account_type := 'personal'::public.account_type;
BEGIN
  BEGIN
    selected_account_type := COALESCE(
      (NEW.raw_user_meta_data ->> 'account_type')::public.account_type,
      'personal'::public.account_type
    );
  EXCEPTION
    WHEN invalid_text_representation THEN
      selected_account_type := 'personal'::public.account_type;
  END;

  BEGIN
    INSERT INTO public.profiles (id, account_type)
    VALUES (NEW.id, selected_account_type)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not initialize profile for auth user %: %', NEW.id, SQLERRM;
  END;

  -- These are supplementary records. The password registration endpoint also
  -- upserts them after Auth succeeds; failures here must not block signup.
  BEGIN
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not initialize user_settings for auth user %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.user_privacy_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not initialize user_privacy_settings for auth user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
