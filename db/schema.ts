import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const sourceKind = pgEnum("source_kind", [
  "paper",
  "book",
  "reference",
  "video",
  "tool",
  "material",
  "manual",
]);

export const traceKind = pgEnum("trace_kind", [
  "generated_statement",
  "assignment",
  "grade",
  "tutor_answer",
  "learner_claim",
]);

export const learners = pgTable("learners", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull().default("Prototype learner"),
  organizationId: text("organization_id"),
  consentVersion: text("consent_version").notNull().default("prototype"),
  accommodations: jsonb("accommodations").notNull().default(sql`'{}'::jsonb`),
  interests: jsonb("interests").notNull().default(sql`'[]'::jsonb`),
  preferredModalities: jsonb("preferred_modalities").notNull().default(sql`'[]'::jsonb`),
  exportRequestedAt: timestamp("export_requested_at", { withTimezone: true }),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const researchSnapshots = pgTable(
  "research_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id").references(() => learners.id, { onDelete: "set null" }),
    topic: text("topic").notNull(),
    query: text("query").notNull(),
    sourceMap: jsonb("source_map").notNull(),
    providerErrors: jsonb("provider_errors").notNull().default(sql`'[]'::jsonb`),
    sourceCount: integer("source_count").notNull().default(0),
    aiSynthesisUsed: boolean("ai_synthesis_used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    topicIdx: index("research_snapshots_topic_idx").on(table.topic),
    learnerIdx: index("research_snapshots_learner_idx").on(table.learnerId),
  }),
);

export const evidenceSources = pgTable(
  "evidence_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id").notNull().references(() => researchSnapshots.id, { onDelete: "cascade" }),
    kind: sourceKind("kind").notNull(),
    externalId: text("external_id"),
    doi: text("doi"),
    isbn: text("isbn"),
    url: text("url"),
    title: text("title").notNull(),
    authors: jsonb("authors").notNull().default(sql`'[]'::jsonb`),
    venue: text("venue"),
    year: integer("year"),
    citationCount: integer("citation_count"),
    accessState: text("access_state").notNull().default("unknown"),
    qualityNote: text("quality_note"),
    raw: jsonb("raw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    snapshotIdx: index("evidence_sources_snapshot_idx").on(table.snapshotId),
    doiIdx: index("evidence_sources_doi_idx").on(table.doi),
    urlIdx: index("evidence_sources_url_idx").on(table.url),
  }),
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id").references(() => learners.id, { onDelete: "set null" }),
    currentSnapshotId: uuid("current_snapshot_id").references(() => researchSnapshots.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default("Evidence-based program"),
    weeks: integer("weeks").notNull().default(12),
    learnerProfile: jsonb("learner_profile").notNull().default(sql`'{}'::jsonb`),
    courseGraph: jsonb("course_graph").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    learnerIdx: index("courses_learner_idx").on(table.learnerId),
    snapshotIdx: index("courses_snapshot_idx").on(table.currentSnapshotId),
  }),
);

export const masteryRecords = pgTable(
  "mastery_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    conceptKey: text("concept_key").notNull(),
    conceptLabel: text("concept_label").notNull(),
    masteryScore: integer("mastery_score").notNull().default(0),
    misconceptions: jsonb("misconceptions").notNull().default(sql`'[]'::jsonb`),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    evidenceTrace: jsonb("evidence_trace").notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    learnerConceptIdx: index("mastery_records_learner_concept_idx").on(table.learnerId, table.conceptKey),
  }),
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id").references(() => learners.id, { onDelete: "set null" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id").references(() => researchSnapshots.id, { onDelete: "set null" }),
    prompt: text("prompt").notNull(),
    response: text("response").notNull(),
    score: integer("score").notNull(),
    dimensions: jsonb("dimensions").notNull().default(sql`'{}'::jsonb`),
    feedback: text("feedback").notNull(),
    rubricVersion: text("rubric_version").notNull().default("prototype-v1"),
    trace: jsonb("trace").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    courseIdx: index("attempts_course_idx").on(table.courseId),
    learnerIdx: index("attempts_learner_idx").on(table.learnerId),
  }),
);

export const learnerNotes = pgTable(
  "learner_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id").references(() => learners.id, { onDelete: "set null" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    courseIdx: index("learner_notes_course_idx").on(table.courseId),
  }),
);

export const tutorConversations = pgTable(
  "tutor_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id").references(() => learners.id, { onDelete: "set null" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id").references(() => researchSnapshots.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    mode: text("mode").notNull(),
    sourceTrace: jsonb("source_trace").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    courseIdx: index("tutor_conversations_course_idx").on(table.courseId),
  }),
);

export const provenanceTraces = pgTable(
  "provenance_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id").notNull().references(() => researchSnapshots.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").references(() => attempts.id, { onDelete: "cascade" }),
    kind: traceKind("kind").notNull(),
    statement: text("statement").notNull(),
    sourceIds: jsonb("source_ids").notNull().default(sql`'[]'::jsonb`),
    confidence: integer("confidence").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    snapshotIdx: index("provenance_traces_snapshot_idx").on(table.snapshotId),
    courseIdx: index("provenance_traces_course_idx").on(table.courseId),
  }),
);
