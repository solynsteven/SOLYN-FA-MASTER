ALTER TABLE "field_definitions" ADD COLUMN IF NOT EXISTS "formula" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;