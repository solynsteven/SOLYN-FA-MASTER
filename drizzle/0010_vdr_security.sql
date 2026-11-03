CREATE TABLE "user_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"user_agent" text,
	"first_ip" text,
	"last_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text,
	"ip" text,
	"user_agent" text,
	"mfa" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "vdr_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"page" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vdr_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'custom' NOT NULL,
	"default_level" text DEFAULT 'L0' NOT NULL,
	"default_caps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vdr_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"group_code" text,
	"organization" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"access_expires_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"share_file_id" uuid,
	"share_caps" jsonb,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "vdr_irm_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"key_enc" text,
	"password_enc" text,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prints_used" integer DEFAULT 0 NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"last_opened_at" timestamp with time zone,
	"last_ip" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vdr_nda_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"signed_name" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vdr_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"nda_required" boolean DEFAULT false NOT NULL,
	"nda_title" text,
	"nda_template" text,
	"nda_version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "access_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vdr_files" ADD COLUMN "security" jsonb;--> statement-breakpoint
ALTER TABLE "vdr_folders" ADD COLUMN "security" jsonb;--> statement-breakpoint
ALTER TABLE "vdr_permissions" ADD COLUMN "caps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vdr_permissions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_otps" ADD CONSTRAINT "user_otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_annotations" ADD CONSTRAINT "vdr_annotations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_annotations" ADD CONSTRAINT "vdr_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_groups" ADD CONSTRAINT "vdr_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_invitations" ADD CONSTRAINT "vdr_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_invitations" ADD CONSTRAINT "vdr_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_irm_issues" ADD CONSTRAINT "vdr_irm_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_irm_issues" ADD CONSTRAINT "vdr_irm_issues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_nda_signatures" ADD CONSTRAINT "vdr_nda_signatures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_nda_signatures" ADD CONSTRAINT "vdr_nda_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_settings" ADD CONSTRAINT "vdr_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vdr_settings" ADD CONSTRAINT "vdr_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ud_user_device" ON "user_devices" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "uotp_user_idx" ON "user_otps" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "us_user_idx" ON "user_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "vann_file_idx" ON "vdr_annotations" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vg_project_code" ON "vdr_groups" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "vinv_project_idx" ON "vdr_invitations" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vinv_token_uq" ON "vdr_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "virm_project_idx" ON "vdr_irm_issues" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "virm_user_idx" ON "vdr_irm_issues" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vnda_project_user_idx" ON "vdr_nda_signatures" USING btree ("project_id","user_id");--> statement-breakpoint
-- 旧 4 级权限换算为 8 级预设：✕→L0 不可见；V→L2 在线预览；P→L4 可打印；O→L5 可下载
UPDATE "vdr_permissions" SET "caps" = CASE "level"
    WHEN 'V' THEN '["view","preview"]'::jsonb
    WHEN 'P' THEN '["view","preview","annotate","print"]'::jsonb
    WHEN 'O' THEN '["view","preview","annotate","print","download","copy"]'::jsonb
    ELSE '[]'::jsonb END,
  "level" = CASE "level" WHEN 'V' THEN 'L2' WHEN 'P' THEN 'L4' WHEN 'O' THEN 'L5' WHEN 'X' THEN 'L0' ELSE "level" END
WHERE "level" IN ('X','V','P','O');
--> statement-breakpoint
-- 为已有项目建立内置权限组
INSERT INTO "vdr_groups" ("project_id", "code", "name", "description", "kind", "default_level", "default_caps", "sort_order")
SELECT p."id", g.code, g.name, g.description, g.kind, g.lv, g.caps::jsonb, g.ord
FROM "projects" p
CROSS JOIN (VALUES
  ('ADM',   '内部管理层',     '卖方 FA / 项目管理团队',     'internal', 'L5', '["view","preview","annotate","print","download","copy"]', 10),
  ('SEL',   '卖方及其顾问',   '卖方公司及卖方顾问',         'seller',   'L0', '[]', 20),
  ('BID1',  '竞标买方组 1',   '一次入札候选买方',           'buyer',    'L0', '[]', 30),
  ('BID2',  '竞标买方组 2',   '二次入札候选买方',           'buyer',    'L0', '[]', 40),
  ('EXC',   '独家谈判对象',   '进入独家谈判的买方',         'buyer',    'L0', '[]', 50),
  ('DD',    '买方尽调顾问',   '买方委托的尽调机构',         'advisor',  'L0', '[]', 60),
  ('LEGAL', '法律顾问组',     '律师事务所',                 'advisor',  'L0', '[]', 70),
  ('FIN',   '财务组',         '会计师 / 税理士 / 财务顾问', 'advisor',  'L0', '[]', 80)
) AS g(code, name, description, kind, lv, caps, ord)
ON CONFLICT ("project_id", "code") DO NOTHING;
