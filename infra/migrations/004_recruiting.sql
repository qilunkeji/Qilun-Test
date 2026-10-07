CREATE TABLE recruiting_materials (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
 title text NOT NULL, category text NOT NULL, source_name text NOT NULL,
 content_cipher text NOT NULL, content_hash text NOT NULL, char_count integer NOT NULL,
 actor_id uuid NOT NULL, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES staff_users(tenant_id,id)
);
CREATE INDEX recruiting_materials_tenant ON recruiting_materials(tenant_id,created_at DESC);
