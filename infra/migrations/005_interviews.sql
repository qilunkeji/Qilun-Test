CREATE TABLE interviews (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), application_id uuid NOT NULL,
 assessment_id uuid REFERENCES assessment_invites(id) ON DELETE SET NULL,
 rubric jsonb NOT NULL, question_count integer NOT NULL CHECK(question_count IN (10,20)),
 transcript_cipher text, revision integer NOT NULL DEFAULT 0,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,application_id) REFERENCES applications(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
ALTER TABLE ai_runs ADD COLUMN interview_id uuid;
ALTER TABLE ai_runs ADD COLUMN interview_revision integer;
ALTER TABLE ai_runs ADD FOREIGN KEY(tenant_id,interview_id) REFERENCES interviews(tenant_id,id);
