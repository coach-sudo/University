CREATE TYPE "source_kind" AS ENUM('paper', 'book', 'reference', 'video', 'tool', 'material', 'manual');--> statement-breakpoint
CREATE TYPE "trace_kind" AS ENUM('generated_statement', 'assignment', 'grade', 'tutor_answer', 'learner_claim');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"learner_id" uuid,
	"course_id" uuid,
	"snapshot_id" uuid,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"score" integer NOT NULL,
	"dimensions" jsonb DEFAULT '{}' NOT NULL,
	"feedback" text NOT NULL,
	"rubric_version" text DEFAULT 'prototype-v1' NOT NULL,
	"trace" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"learner_id" uuid,
	"current_snapshot_id" uuid,
	"title" text NOT NULL,
	"subtitle" text DEFAULT 'Evidence-based program' NOT NULL,
	"weeks" integer DEFAULT 12 NOT NULL,
	"learner_profile" jsonb DEFAULT '{}' NOT NULL,
	"course_graph" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"snapshot_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"external_id" text,
	"doi" text,
	"isbn" text,
	"url" text,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]' NOT NULL,
	"venue" text,
	"year" integer,
	"citation_count" integer,
	"access_state" text DEFAULT 'unknown' NOT NULL,
	"quality_note" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"learner_id" uuid,
	"course_id" uuid,
	"topic" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"display_name" text DEFAULT 'Prototype learner' NOT NULL,
	"organization_id" text,
	"consent_version" text DEFAULT 'prototype' NOT NULL,
	"accommodations" jsonb DEFAULT '{}' NOT NULL,
	"interests" jsonb DEFAULT '[]' NOT NULL,
	"preferred_modalities" jsonb DEFAULT '[]' NOT NULL,
	"export_requested_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mastery_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"learner_id" uuid NOT NULL,
	"course_id" uuid,
	"concept_key" text NOT NULL,
	"concept_label" text NOT NULL,
	"mastery_score" integer DEFAULT 0 NOT NULL,
	"misconceptions" jsonb DEFAULT '[]' NOT NULL,
	"next_review_at" timestamp with time zone,
	"evidence_trace" jsonb DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provenance_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"snapshot_id" uuid NOT NULL,
	"course_id" uuid,
	"attempt_id" uuid,
	"kind" "trace_kind" NOT NULL,
	"statement" text NOT NULL,
	"source_ids" jsonb DEFAULT '[]' NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"learner_id" uuid,
	"topic" text NOT NULL,
	"query" text NOT NULL,
	"source_map" jsonb NOT NULL,
	"provider_errors" jsonb DEFAULT '[]' NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"ai_synthesis_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"learner_id" uuid,
	"course_id" uuid,
	"snapshot_id" uuid,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"mode" text NOT NULL,
	"source_trace" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attempts_course_idx" ON "attempts" ("course_id");--> statement-breakpoint
CREATE INDEX "attempts_learner_idx" ON "attempts" ("learner_id");--> statement-breakpoint
CREATE INDEX "courses_learner_idx" ON "courses" ("learner_id");--> statement-breakpoint
CREATE INDEX "courses_snapshot_idx" ON "courses" ("current_snapshot_id");--> statement-breakpoint
CREATE INDEX "evidence_sources_snapshot_idx" ON "evidence_sources" ("snapshot_id");--> statement-breakpoint
CREATE INDEX "evidence_sources_doi_idx" ON "evidence_sources" ("doi");--> statement-breakpoint
CREATE INDEX "evidence_sources_url_idx" ON "evidence_sources" ("url");--> statement-breakpoint
CREATE INDEX "learner_notes_course_idx" ON "learner_notes" ("course_id");--> statement-breakpoint
CREATE INDEX "mastery_records_learner_concept_idx" ON "mastery_records" ("learner_id","concept_key");--> statement-breakpoint
CREATE INDEX "provenance_traces_snapshot_idx" ON "provenance_traces" ("snapshot_id");--> statement-breakpoint
CREATE INDEX "provenance_traces_course_idx" ON "provenance_traces" ("course_id");--> statement-breakpoint
CREATE INDEX "research_snapshots_topic_idx" ON "research_snapshots" ("topic");--> statement-breakpoint
CREATE INDEX "research_snapshots_learner_idx" ON "research_snapshots" ("learner_id");--> statement-breakpoint
CREATE INDEX "tutor_conversations_course_idx" ON "tutor_conversations" ("course_id");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_learner_id_learners_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_snapshot_id_research_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "research_snapshots"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_learner_id_learners_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_current_snapshot_id_research_snapshots_id_fkey" FOREIGN KEY ("current_snapshot_id") REFERENCES "research_snapshots"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_snapshot_id_research_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "research_snapshots"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "learner_notes" ADD CONSTRAINT "learner_notes_learner_id_learners_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "learner_notes" ADD CONSTRAINT "learner_notes_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_learner_id_learners_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "provenance_traces" ADD CONSTRAINT "provenance_traces_snapshot_id_research_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "research_snapshots"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "provenance_traces" ADD CONSTRAINT "provenance_traces_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "provenance_traces" ADD CONSTRAINT "provenance_traces_attempt_id_attempts_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "research_snapshots" ADD CONSTRAINT "research_snapshots_learner_id_learners_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_learner_id_learners_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_snapshot_id_research_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "research_snapshots"("id") ON DELETE SET NULL;