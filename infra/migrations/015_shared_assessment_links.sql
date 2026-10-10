-- Public links identify an entry, never a participant. Historical snapshots
-- and PIN hashes remain intact; only newly enrolled participants are PIN-free.
ALTER TABLE assessment_invites ADD COLUMN pin_required boolean NOT NULL DEFAULT true;
ALTER TABLE assessment_public_entries ADD COLUMN legacy_invite_id uuid UNIQUE;

-- Keep already-sent single-person URLs usable as registration entrances.
-- Do not attach their existing mixed/historical answers to any new participant.
INSERT INTO assessment_public_entries
 (id,tenant_id,created_by,title,purpose,project_group_id,token_hash,pin_hash,package,package_hash,expires_at,created_at,revoked_at,legacy_invite_id)
 SELECT i.id,i.tenant_id,i.created_by,left(coalesce(i.package->>'title','齐论性格与发展测评'),80),i.purpose,i.project_group_id,
 i.token_hash,i.pin_hash,i.package,i.package_hash,i.expires_at,i.created_at,i.revoked_at,i.id
 FROM assessment_invites i WHERE i.public_entry_id IS NULL;
