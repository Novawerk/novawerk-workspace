-- NB-ADR-0014, the welcome email: only accounts made from now on get one. Every account that
-- exists already counts as welcomed.
UPDATE "members" SET "welcome_sent_at" = "created_at" WHERE "welcome_sent_at" IS NULL;
