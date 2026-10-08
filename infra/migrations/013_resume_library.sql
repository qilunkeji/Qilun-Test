-- Additive; existing immutable versions and business records are unchanged.
CREATE TABLE resume_extension_grants (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE, extension_id text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,user_id) REFERENCES staff_users(tenant_id,id)
);
CREATE TABLE resume_screen_batches (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), job_version_id uuid NOT NULL,
 requirements text NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,job_version_id) REFERENCES job_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE TABLE resume_screen_items (
 id uuid PRIMARY KEY REFERENCES ai_runs(id), tenant_id uuid NOT NULL, batch_id uuid NOT NULL,
 resume_version_id uuid NOT NULL, review text, review_note text NOT NULL DEFAULT '',
 reviewed_by uuid, reviewed_at timestamptz, revision integer NOT NULL DEFAULT 0,
 FOREIGN KEY(tenant_id,batch_id) REFERENCES resume_screen_batches(tenant_id,id),
 FOREIGN KEY(tenant_id,resume_version_id) REFERENCES resume_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewed_by) REFERENCES staff_users(tenant_id,id),
 UNIQUE(batch_id,resume_version_id), CHECK(review IS NULL OR review IN ('contact','clarify','hold'))
);
CREATE TABLE resume_screen_reviews (
 id uuid PRIMARY KEY, item_id uuid NOT NULL REFERENCES resume_screen_items(id),
 tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid NOT NULL, review text NOT NULL,
 note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES staff_users(tenant_id,id)
);
