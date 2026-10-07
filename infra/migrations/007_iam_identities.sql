-- Separate identity mapping; existing users, password hashes, scopes and business data remain intact.
CREATE TABLE iam_identities (
 issuer text NOT NULL, subject text NOT NULL,
 tenant_id uuid NOT NULL, user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(issuer,subject), UNIQUE(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES staff_users(tenant_id,id)
);
