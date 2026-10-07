CREATE TABLE tenants (id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE staff_users (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), username text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('hr','talent_lead','ops','interviewer')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id, username), UNIQUE(tenant_id,id)
);
CREATE TABLE sessions (token_hash text PRIMARY KEY, tenant_id uuid NOT NULL, user_id uuid NOT NULL,
 csrf_token text NOT NULL, expires_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,user_id) REFERENCES staff_users(tenant_id,id));
CREATE TABLE jobs (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), revision integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE TABLE job_versions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, job_id uuid NOT NULL, version integer NOT NULL,
 title text NOT NULL, department text NOT NULL, owner text NOT NULL, location text NOT NULL,
 tasks text NOT NULL, criteria text NOT NULL, public_jd text NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','pending','open','paused','closed','archived')),
 change_reason text NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,job_id,version),
 FOREIGN KEY(tenant_id,job_id) REFERENCES jobs(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE TABLE candidates (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
 contact_cipher text, purpose text NOT NULL CHECK(purpose IN ('recruitment','talent_pool')),
 processing_basis text NOT NULL, retention_until timestamptz NOT NULL,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE INDEX candidates_search ON candidates(tenant_id,retention_until,name);
CREATE TABLE candidate_sources (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, candidate_id uuid NOT NULL,
 channel text NOT NULL, external_id text NOT NULL, authorization_ref text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,channel,external_id), UNIQUE(tenant_id,candidate_id,id),
 FOREIGN KEY(tenant_id,candidate_id) REFERENCES candidates(tenant_id,id)
);
CREATE TABLE resume_versions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, candidate_id uuid NOT NULL, source_id uuid NOT NULL,
 version integer NOT NULL, filename text NOT NULL, content_hash text NOT NULL, text_content text NOT NULL,
 completeness text NOT NULL CHECK(completeness IN ('full','summary_only')),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,candidate_id,id), UNIQUE(tenant_id,candidate_id,version), UNIQUE(tenant_id,source_id,content_hash),
 FOREIGN KEY(tenant_id,candidate_id) REFERENCES candidates(tenant_id,id),
 FOREIGN KEY(tenant_id,candidate_id,source_id) REFERENCES candidate_sources(tenant_id,candidate_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE TABLE document_chunks (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, resume_version_id uuid NOT NULL,
 line_number integer NOT NULL, text_content text NOT NULL, UNIQUE(tenant_id,resume_version_id,line_number),
 FOREIGN KEY(tenant_id,resume_version_id) REFERENCES resume_versions(tenant_id,id)
);
CREATE TABLE applications (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, candidate_id uuid NOT NULL, job_id uuid NOT NULL,
 job_version_id uuid NOT NULL, resume_version_id uuid NOT NULL, batch text NOT NULL,
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','closed')),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,candidate_id,job_id,batch),
 FOREIGN KEY(tenant_id,candidate_id) REFERENCES candidates(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,job_version_id) REFERENCES job_versions(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,candidate_id,resume_version_id) REFERENCES resume_versions(tenant_id,candidate_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid NOT NULL,
 action text NOT NULL, object_id text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES staff_users(tenant_id,id)
);
CREATE FUNCTION immutable_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_VERSION: create a new version'; END; $$;
CREATE TRIGGER immutable_job_version BEFORE UPDATE ON job_versions FOR EACH ROW EXECUTE FUNCTION immutable_version();
CREATE TRIGGER immutable_resume_version BEFORE UPDATE ON resume_versions FOR EACH ROW EXECUTE FUNCTION immutable_version();
