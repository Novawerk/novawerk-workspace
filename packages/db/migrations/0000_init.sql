CREATE TYPE "public"."application_status" AS ENUM('new', 'reviewing', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('contract', 'nda', 'invoice', 'receipt', 'image', 'other');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'approved', 'sent', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."partner_stage" AS ENUM('intro', 'follow-up', 'grant-ask', 'renewal', 'closed');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'planning', 'building', 'launched', 'archived');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('new', 'discussing', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "document_kind" NOT NULL,
	"title" text NOT NULL,
	"r2_key" text NOT NULL,
	"owner" text,
	"counterparty" text,
	"signed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "finance_ledger" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "finance_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_date" date NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"category" text,
	"description" text,
	"owner" text,
	"partner_id" text,
	"receipt_document_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"city" text,
	"functions" text[] DEFAULT '{}' NOT NULL,
	"background" text NOT NULL,
	"motivation" text NOT NULL,
	"availability" text NOT NULL,
	"links" text,
	"consent_at" timestamp with time zone NOT NULL,
	"ai_summary" text,
	"status" "application_status" DEFAULT 'new' NOT NULL,
	"reviewer_id" text,
	"member_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"can_admin" boolean DEFAULT false NOT NULL,
	"joined_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "newsletter_subscribers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"drafted_by" text NOT NULL,
	"related_table" text,
	"related_id" text,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stage" "partner_stage" DEFAULT 'intro' NOT NULL,
	"primary_contact" text,
	"primary_email" text,
	"owner" text,
	"last_touch_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "project_members_project_id_member_id_pk" PRIMARY KEY("project_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "project_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"project_name" text NOT NULL,
	"product" text NOT NULL,
	"user_journey" text NOT NULL,
	"references_and_innovation" text NOT NULL,
	"team" text NOT NULL,
	"timeline" text NOT NULL,
	"links" text,
	"consent_at" timestamp with time zone NOT NULL,
	"ai_summary" text,
	"status" "submission_status" DEFAULT 'new' NOT NULL,
	"reviewer_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"tagline" text,
	"description" text DEFAULT '' NOT NULL,
	"body" text,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"year" integer,
	"link" text,
	"cover_url" text,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"submission_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_members_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_ledger" ADD CONSTRAINT "finance_ledger_owner_members_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_ledger" ADD CONSTRAINT "finance_ledger_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_ledger" ADD CONSTRAINT "finance_ledger_receipt_document_id_documents_id_fk" FOREIGN KEY ("receipt_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_applications" ADD CONSTRAINT "member_applications_reviewer_id_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_applications" ADD CONSTRAINT "member_applications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_approved_by_members_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_owner_members_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_reviewer_id_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_submission_id_project_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."project_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "finance_ledger_entry_date_idx" ON "finance_ledger" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "finance_ledger_partner_idx" ON "finance_ledger" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "member_applications_status_idx" ON "member_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbox_status_idx" ON "outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "partners_owner_idx" ON "partners" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "project_submissions_status_idx" ON "project_submissions" USING btree ("status");