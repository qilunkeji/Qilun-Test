-- Resume location is display-only metadata, never a scoring input.
ALTER TABLE assessment_invites ADD COLUMN ui_progress jsonb;
ALTER TABLE assessment_invites ADD CONSTRAINT assessment_ui_progress_object
 CHECK (ui_progress IS NULL OR jsonb_typeof(ui_progress)='object');
CREATE FUNCTION preserve_submitted_ui_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.submitted_at IS NOT NULL AND NEW.ui_progress IS DISTINCT FROM OLD.ui_progress THEN
  RAISE EXCEPTION 'IMMUTABLE_SUBMISSION';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_submitted_ui_progress BEFORE UPDATE OF ui_progress
 ON assessment_invites FOR EACH ROW EXECUTE FUNCTION preserve_submitted_ui_progress();
