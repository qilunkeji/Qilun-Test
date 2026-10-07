CREATE TABLE assessment_invites (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, candidate_id uuid NOT NULL, application_id uuid,
 token_hash text NOT NULL UNIQUE, pin_hash text NOT NULL, package jsonb NOT NULL, package_hash text NOT NULL,
 purpose text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 answers jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0,
 consent_at timestamptz, submitted_at timestamptz, answer_hash text, report jsonb,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,candidate_id) REFERENCES candidates(tenant_id,id),
 FOREIGN KEY(tenant_id,application_id) REFERENCES applications(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE INDEX assessment_invites_tenant ON assessment_invites(tenant_id,created_at);
CREATE FUNCTION protect_assessment_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.tenant_id,NEW.candidate_id,NEW.application_id,NEW.token_hash,NEW.pin_hash,NEW.package,NEW.package_hash)
 IS DISTINCT FROM ROW(OLD.tenant_id,OLD.candidate_id,OLD.application_id,OLD.token_hash,OLD.pin_hash,OLD.package,OLD.package_hash)
 THEN RAISE EXCEPTION 'IMMUTABLE_ASSESSMENT_BINDING'; END IF;
 IF OLD.submitted_at IS NOT NULL AND ROW(NEW.answers,NEW.report,NEW.answer_hash,NEW.submitted_at) IS DISTINCT FROM ROW(OLD.answers,OLD.report,OLD.answer_hash,OLD.submitted_at)
 THEN RAISE EXCEPTION 'IMMUTABLE_SUBMISSION'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_assessment BEFORE UPDATE ON assessment_invites FOR EACH ROW EXECUTE FUNCTION protect_assessment_binding();
