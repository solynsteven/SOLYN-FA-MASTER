CREATE TABLE "vdr_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"file_id" uuid,
	"folder_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vdr_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"name" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"content_type" text,
	"storage" text NOT NULL,
	"storage_key" text NOT NULL,
	"task_code" text,
	"dd_code" text,
	"description" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "vdr_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"is_phase" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"password_hash" text,
	"password_version" integer DEFAULT 1 NOT NULL,
	"open_mode" text DEFAULT 'closed' NOT NULL,
	"open_task_code" text,
	"open_trigger" text DEFAULT 'started' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "vdr_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject" text NOT NULL,
	"level" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "vdr_group" text;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "organization" text;--> statement-breakpoint
ALTER TABLE "vdr_events" ADD CONSTRAINT "vdr_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_events" ADD CONSTRAINT "vdr_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_files" ADD CONSTRAINT "vdr_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_files" ADD CONSTRAINT "vdr_files_folder_id_vdr_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."vdr_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_files" ADD CONSTRAINT "vdr_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_files" ADD CONSTRAINT "vdr_files_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_folders" ADD CONSTRAINT "vdr_folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_folders" ADD CONSTRAINT "vdr_folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_folders" ADD CONSTRAINT "vdr_folders_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_permissions" ADD CONSTRAINT "vdr_permissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_permissions" ADD CONSTRAINT "vdr_permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ve_project_time_idx" ON "vdr_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "ve_file_idx" ON "vdr_events" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "ve_folder_idx" ON "vdr_events" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "vfile_project_idx" ON "vdr_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "vfile_folder_idx" ON "vdr_files" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "vf_project_idx" ON "vdr_folders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "vf_parent_idx" ON "vdr_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vp_unique" ON "vdr_permissions" USING btree ("target_type","target_id","subject_type","subject");--> statement-breakpoint
CREATE INDEX "vp_project_idx" ON "vdr_permissions" USING btree ("project_id");