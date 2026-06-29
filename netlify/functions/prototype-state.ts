import type { Config } from "@netlify/functions";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  attempts,
  courses,
  evidenceSources,
  learnerNotes,
  learners,
  provenanceTraces,
  researchSnapshots,
  tutorConversations,
} from "../../db/schema.js";

const DEMO_LEARNER_NAME = "Prototype learner";

type JsonRecord = Record<string, unknown>;

function countSources(research: JsonRecord) {
  return ["papers", "books", "references", "videos", "tools"].reduce(
    (count, key) => count + (Array.isArray(research[key]) ? (research[key] as unknown[]).length : 0),
    0,
  );
}

function flattenSources(research: JsonRecord) {
  const entries: JsonRecord[] = [
    ...((research.papers as JsonRecord[] | undefined) || []),
    ...((research.books as JsonRecord[] | undefined) || []),
    ...((research.references as JsonRecord[] | undefined) || []),
    ...((research.videos as JsonRecord[] | undefined) || []),
    ...((research.tools as JsonRecord[] | undefined) || []),
    ...(((research.materials as JsonRecord[] | undefined) || [])
      .filter(item => typeof item.text === "string" && item.text)
      .map((item, index): JsonRecord => ({
        id: `material:${index}`,
        kind: "material",
        title: item.name || `Uploaded material ${index + 1}`,
        raw: item,
      }))),
  ];

  return entries.map(item => ({
    kind: String(item.kind || "manual") as "paper" | "book" | "reference" | "video" | "tool" | "material" | "manual",
    externalId: item.id ? String(item.id) : null,
    doi: item.doi ? String(item.doi) : null,
    isbn: item.isbn ? String(item.isbn) : null,
    url: item.url ? String(item.url) : null,
    title: String(item.title || item.name || "Untitled source"),
    authors: Array.isArray(item.authors) ? item.authors : [],
    venue: item.venue || item.channel ? String(item.venue || item.channel) : null,
    year: Number.isFinite(Number(item.year)) ? Number(item.year) : null,
    citationCount: Number.isFinite(Number(item.citations)) ? Number(item.citations) : null,
    accessState: "unknown",
    qualityNote: item.qualityNote || item.quality ? String(item.qualityNote || item.quality) : null,
    raw: item,
  }));
}

async function ensureLearner() {
  const [existing] = await db.select().from(learners).where(eq(learners.displayName, DEMO_LEARNER_NAME)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(learners)
    .values({
      displayName: DEMO_LEARNER_NAME,
      consentVersion: "prototype-non-accredited",
      preferredModalities: ["watch", "read", "practice", "discuss"],
    })
    .returning();
  return created;
}

async function createSnapshot(learnerId: string, research: JsonRecord, aiSynthesisUsed = false) {
  const [snapshot] = await db
    .insert(researchSnapshots)
    .values({
      learnerId,
      topic: String(research.topic || "Untitled topic"),
      query: String(research.topic || "Untitled topic"),
      sourceMap: research,
      providerErrors: Array.isArray(research.errors) ? research.errors : [],
      sourceCount: countSources(research),
      aiSynthesisUsed,
    })
    .returning();

  const values = flattenSources(research).map(source => ({ ...source, snapshotId: snapshot.id }));
  if (values.length) await db.insert(evidenceSources).values(values);
  return snapshot;
}

async function latestState() {
  const learner = await ensureLearner();
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.learnerId, learner.id))
    .orderBy(desc(courses.updatedAt))
    .limit(1);

  if (!course) {
    return { learner, course: null, attempts: [], notes: [], tutorConversations: [] };
  }

  const [attemptRows, noteRows, tutorRows] = await Promise.all([
    db.select().from(attempts).where(eq(attempts.courseId, course.id)).orderBy(desc(attempts.createdAt)).limit(50),
    db.select().from(learnerNotes).where(eq(learnerNotes.courseId, course.id)).orderBy(desc(learnerNotes.createdAt)).limit(100),
    db
      .select()
      .from(tutorConversations)
      .where(eq(tutorConversations.courseId, course.id))
      .orderBy(desc(tutorConversations.createdAt))
      .limit(50),
  ]);

  return { learner, course, attempts: attemptRows, notes: noteRows, tutorConversations: tutorRows };
}

async function handlePost(body: JsonRecord) {
  const learner = await ensureLearner();

  if (body.type === "course") {
    const research = (body.research || {}) as JsonRecord;
    const coursePayload = (body.course || {}) as JsonRecord;
    const snapshot = await createSnapshot(learner.id, research, String(coursePayload.mode || "").startsWith("ai:"));
    const [course] = await db
      .insert(courses)
      .values({
        learnerId: learner.id,
        currentSnapshotId: snapshot.id,
        title: String(coursePayload.title || research.topic || "Untitled course"),
        subtitle: String(coursePayload.subtitle || "Evidence-based program"),
        weeks: Number(body.weeks || 12),
        learnerProfile: (coursePayload.learner as JsonRecord | undefined) || {},
        courseGraph: coursePayload,
      })
      .returning();

    await db.insert(provenanceTraces).values({
      snapshotId: snapshot.id,
      courseId: course.id,
      kind: "generated_statement",
      statement: `Course "${course.title}" was generated from research snapshot ${snapshot.id}.`,
      sourceIds: flattenSources(research).map(source => source.externalId || source.url || source.title).slice(0, 100),
      confidence: 70,
    });

    return { learner, course, snapshot };
  }

  if (body.type === "attempt") {
    const result = (body.result || {}) as JsonRecord;
    const [course] = await db.select().from(courses).where(eq(courses.id, String(body.courseId))).limit(1);
    const [attempt] = await db
      .insert(attempts)
      .values({
        learnerId: learner.id,
        courseId: course?.id,
        snapshotId: course?.currentSnapshotId,
        prompt: String(body.prompt || "Prototype assessment"),
        response: String(body.response || ""),
        score: Number(result.score || 0),
        dimensions: (result.dimensions as JsonRecord | undefined) || {},
        feedback: String(result.feedback || ""),
        trace: (result.trace as JsonRecord | undefined) || {},
      })
      .returning();

    if (course?.currentSnapshotId) {
      await db.insert(provenanceTraces).values({
        snapshotId: course.currentSnapshotId,
        courseId: course.id,
        attemptId: attempt.id,
        kind: "grade",
        statement: result.feedback ? String(result.feedback) : `Assessment scored ${attempt.score}.`,
        sourceIds: ((result.researchCheck as JsonRecord | undefined)?.newEvidence as JsonRecord[] | undefined || [])
          .map(source => source.id || source.doi || source.url || source.title)
          .slice(0, 20),
        confidence: Math.max(35, Math.min(90, attempt.score)),
      });
    }

    return { attempt };
  }

  if (body.type === "note") {
    const [note] = await db
      .insert(learnerNotes)
      .values({
        learnerId: learner.id,
        courseId: body.courseId ? String(body.courseId) : null,
        topic: String(body.topic || "Untitled topic"),
        note: String(body.note || ""),
      })
      .returning();
    return { note };
  }

  if (body.type === "tutor") {
    const result = (body.result || {}) as JsonRecord;
    const [course] = await db.select().from(courses).where(eq(courses.id, String(body.courseId))).limit(1);
    const [conversation] = await db
      .insert(tutorConversations)
      .values({
        learnerId: learner.id,
        courseId: course?.id,
        snapshotId: course?.currentSnapshotId,
        question: String(body.question || ""),
        answer: String(result.answer || ""),
        mode: String(result.mode || "research-brief"),
        sourceTrace: Array.isArray(result.sources) ? result.sources : [],
      })
      .returning();

    if (course?.currentSnapshotId) {
      await db.insert(provenanceTraces).values({
        snapshotId: course.currentSnapshotId,
        courseId: course.id,
        kind: "tutor_answer",
        statement: conversation.answer.slice(0, 2000),
        sourceIds: ((result.sources as JsonRecord[] | undefined) || [])
          .map(source => source.id || source.doi || source.url || source.title)
          .slice(0, 20),
        confidence: 65,
      });
    }

    return { conversation };
  }

  if (body.type === "delete-demo-state") {
    await db.delete(courses).where(eq(courses.learnerId, learner.id));
    await db.delete(researchSnapshots).where(eq(researchSnapshots.learnerId, learner.id));
    await db.delete(learnerNotes).where(and(eq(learnerNotes.learnerId, learner.id), eq(learnerNotes.topic, String(body.topic || ""))));
    return { ok: true };
  }

  throw new Error("Unsupported persistence event");
}

export default async function handler(req: Request) {
  try {
    if (req.method === "GET") return Response.json(await latestState());
    if (req.method === "POST") return Response.json(await handlePost(await req.json()));
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Persistence failed" }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/prototype-state",
};
