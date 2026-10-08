CREATE TABLE assessment_public_entries (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), created_by uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 80), purpose text NOT NULL,
 project_group_id uuid, token_hash text NOT NULL UNIQUE, pin_hash text NOT NULL,
 package jsonb NOT NULL, package_hash text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id),
 FOREIGN KEY(tenant_id,project_group_id) REFERENCES talent_project_groups(tenant_id,id)
);
ALTER TABLE assessment_invites ADD COLUMN public_entry_id uuid;
ALTER TABLE assessment_invites ADD CONSTRAINT invite_public_entry_fk FOREIGN KEY(tenant_id,public_entry_id) REFERENCES assessment_public_entries(tenant_id,id);
CREATE INDEX assessment_public_entry_participants ON assessment_invites(tenant_id,public_entry_id);
