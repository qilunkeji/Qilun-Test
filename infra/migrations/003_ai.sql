CREATE TABLE ai_configs (
 tenant_id uuid NOT NULL REFERENCES tenants(id), feature text NOT NULL, provider text NOT NULL, model text NOT NULL,
 key_cipher text, prompt text NOT NULL, budget numeric NOT NULL, input_price numeric NOT NULL, output_price numeric NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,feature)
);
CREATE TABLE ai_runs (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid NOT NULL,
 feature text NOT NULL, config_feature text NOT NULL, config_snapshot jsonb NOT NULL,
 status text NOT NULL, input_cipher text NOT NULL, input_hash text NOT NULL, result jsonb, error_code text,
 reserved_cost numeric NOT NULL, cost numeric, usage jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 retention_until timestamptz NOT NULL DEFAULT now()+interval '30 days',
 FOREIGN KEY(tenant_id,actor_id) REFERENCES staff_users(tenant_id,id)
);
