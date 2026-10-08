ALTER TABLE resume_screen_batches ADD COLUMN round integer NOT NULL DEFAULT 1 CHECK(round IN (1,2));
ALTER TABLE resume_screen_batches ADD COLUMN second_round_at timestamptz;
ALTER TABLE resume_screen_batches ADD COLUMN second_round_by uuid;
ALTER TABLE resume_screen_reviews ADD COLUMN round integer NOT NULL DEFAULT 1 CHECK(round IN (1,2));
