ALTER TABLE "field_definitions" ADD COLUMN "formula" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;