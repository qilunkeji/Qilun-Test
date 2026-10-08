CREATE TABLE talent_project_groups (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE UNIQUE INDEX talent_project_group_names ON talent_project_groups(tenant_id,lower(name));
ALTER TABLE candidates ADD COLUMN project_group_id uuid;
ALTER TABLE candidates ADD CONSTRAINT candidate_project_group_fk FOREIGN KEY(tenant_id,project_group_id) REFERENCES talent_project_groups(tenant_id,id);
ALTER TABLE assessment_invites ALTER COLUMN candidate_id DROP NOT NULL;
ALTER TABLE assessment_invites ADD COLUMN project_group_id uuid;
ALTER TABLE assessment_invites ADD COLUMN profile_required boolean NOT NULL DEFAULT false;
ALTER TABLE assessment_invites ADD COLUMN independent_retention_until timestamptz;
UPDATE assessment_invites SET independent_retention_until=created_at+interval '365 days';
ALTER TABLE assessment_invites ADD COLUMN participant_kind text NOT NULL DEFAULT 'internal' CHECK(participant_kind IN ('internal','external'));
ALTER TABLE assessment_invites ADD CONSTRAINT invite_project_group_fk FOREIGN KEY(tenant_id,project_group_id) REFERENCES talent_project_groups(tenant_id,id);
CREATE UNIQUE INDEX assessment_invites_tenant_id_unique ON assessment_invites(tenant_id,id);
-- Late association does not rewrite the immutable original invitation or report.
CREATE TABLE assessment_archive_bindings (
 invite_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, candidate_id uuid NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,invite_id) REFERENCES assessment_invites(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,candidate_id) REFERENCES candidates(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE INDEX candidates_project_groups ON candidates(tenant_id,project_group_id);
CREATE INDEX assessment_project_groups ON assessment_invites(tenant_id,project_group_id,created_at);
