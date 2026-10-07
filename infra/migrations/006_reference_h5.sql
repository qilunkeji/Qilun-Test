-- Additive only: preserve all existing self-review invites and immutable snapshots.
ALTER TABLE assessment_invites ADD COLUMN value_draft jsonb;
CREATE FUNCTION protect_assessment_values() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.submitted_at IS NOT NULL AND NEW.value_draft IS DISTINCT FROM OLD.value_draft
 THEN RAISE EXCEPTION 'IMMUTABLE_SUBMISSION'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_assessment_value_draft BEFORE UPDATE ON assessment_invites
 FOR EACH ROW EXECUTE FUNCTION protect_assessment_values();
