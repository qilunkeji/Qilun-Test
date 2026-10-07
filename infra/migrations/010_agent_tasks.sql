-- Additive only. No changes to business tables or historical AI runs.
CREATE TABLE agent_tasks (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
 task_type text NOT NULL, type_version text NOT NULL,
 subject_type text NOT NULL CHECK(subject_type IN ('ai_run','ping')), subject_id uuid NOT NULL,
 input_json jsonb NOT NULL CHECK(jsonb_typeof(input_json)='object'), result_summary jsonb,
 state text NOT NULL CHECK(state IN ('queued','claimed','succeeded','failed','cancelled')),
 priority integer NOT NULL DEFAULT 0, lease_token_hash text, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), max_attempts integer NOT NULL CHECK(max_attempts>0),
 error_code text, error_message text, created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz, completed_at timestamptz, last_wake_at timestamptz,
 wake_count integer NOT NULL DEFAULT 0 CHECK(wake_count>=0),
 UNIQUE(task_type,subject_id), FOREIGN KEY(tenant_id,created_by) REFERENCES staff_users(tenant_id,id)
);
CREATE INDEX agent_tasks_queue ON agent_tasks(tenant_id,state,priority DESC,created_at);
CREATE INDEX agent_tasks_type_state ON agent_tasks(task_type,state);
CREATE TABLE agent_task_receipts (
 request_id text PRIMARY KEY, tool text NOT NULL, task_id uuid REFERENCES agent_tasks(id),
 response_json jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_wake_log (
 id uuid PRIMARY KEY, reason text NOT NULL CHECK(reason IN ('created','rewake','test')),
 task_id uuid REFERENCES agent_tasks(id),
 status text NOT NULL CHECK(status IN ('sent','failed','coalesced','skipped_unconfigured')),
 http_status integer, attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE agent_audit_events (
 id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id), actor text NOT NULL DEFAULT 'agent:grok-bot',
 action text NOT NULL, object_id text, summary text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_state (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
