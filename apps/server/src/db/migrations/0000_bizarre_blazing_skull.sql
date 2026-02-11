CREATE TYPE "public"."checkpoint_type" AS ENUM('auto_periodic', 'manual', 'crash_recovery');--> statement-breakpoint
CREATE TYPE "public"."engineer_role" AS ENUM('admin', 'engineer', 'readonly');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'disconnected');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engineer_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"engineer_id" uuid NOT NULL,
	"checkpoint_type" "checkpoint_type" NOT NULL,
	"state_hash" text,
	"active_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"notes" text,
	"is_latest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"feature_id" uuid,
	"engineer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"decision" text NOT NULL,
	"rationale" text,
	"alternatives" text,
	"supersedes" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engineers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "engineer_role" DEFAULT 'engineer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"spec" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"lane" text DEFAULT 'next' NOT NULL,
	"priority" integer NOT NULL,
	"touches" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"engineer_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"engineer_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"repo_url" text,
	"repo_path" text,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"engineer_id" uuid NOT NULL,
	"feature_id" uuid,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_supersedes_decisions_id_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_created_by_engineers_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."engineers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_claimed_by_engineers_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."engineers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_engineer_idx" ON "api_keys" USING btree ("engineer_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "checkpoints_session_idx" ON "checkpoints" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "checkpoints_engineer_idx" ON "checkpoints" USING btree ("engineer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_latest_unique_idx" ON "checkpoints" USING btree ("engineer_id","feature_id") WHERE is_latest = true;--> statement-breakpoint
CREATE INDEX "decisions_project_idx" ON "decisions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "decisions_feature_idx" ON "decisions" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "decisions_created_idx" ON "decisions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "engineers_email_idx" ON "engineers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "features_project_slug_idx" ON "features" USING btree ("project_id","slug");--> statement-breakpoint
CREATE INDEX "features_project_idx" ON "features" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "features_status_idx" ON "features" USING btree ("status");--> statement-breakpoint
CREATE INDEX "features_lane_idx" ON "features" USING btree ("lane");--> statement-breakpoint
CREATE INDEX "learnings_feature_idx" ON "learnings" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "learnings_created_idx" ON "learnings" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_pk" ON "project_members" USING btree ("project_id","engineer_id");--> statement-breakpoint
CREATE INDEX "project_members_engineer_idx" ON "project_members" USING btree ("engineer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_idx" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "sessions_project_idx" ON "sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sessions_engineer_idx" ON "sessions" USING btree ("engineer_id");--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_active_unique_idx" ON "sessions" USING btree ("project_id","engineer_id") WHERE status = 'active';