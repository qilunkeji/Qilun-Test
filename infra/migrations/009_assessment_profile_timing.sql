-- Participant-provided profile is encrypted; display metadata never enters scoring.
ALTER TABLE assessment_invites ADD COLUMN profile_cipher text;
ALTER TABLE assessment_invites ADD COLUMN active_seconds integer CHECK(active_seconds IS NULL OR active_seconds BETWEEN 0 AND 86400);
ALTER TABLE assessment_invites ADD COLUMN timing_updated_at timestamptz;
CREATE FUNCTION preserve_submitted_profile_timing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.submitted_at IS NOT NULL AND (NEW.profile_cipher IS DISTINCT FROM OLD.profile_cipher OR NEW.active_seconds IS DISTINCT FROM OLD.active_seconds OR NEW.timing_updated_at IS DISTINCT FROM OLD.timing_updated_at) THEN
  RAISE EXCEPTION 'IMMUTABLE_SUBMISSION';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_submitted_profile_timing BEFORE UPDATE OF profile_cipher,active_seconds,timing_updated_at
 ON assessment_invites FOR EACH ROW EXECUTE FUNCTION preserve_submitted_profile_timing();
