# Materia: production blueprint for a non-accredited AI university

## The product threshold

A university is not a pile of generated courses. It is a durable learning system that maintains an evidence base, builds coherent programs, observes learner performance, gives defensible feedback, and revises both the curriculum and its model of the learner over time.

Materia's governing loop should be:

`research snapshot → claim graph → curriculum → learning activity → assessment → evidence refresh → feedback → curriculum revision`

Every generated statement, assignment, grade, and tutor answer should retain a trace back to the research snapshot that produced it.

## What the current build now proves

- Research occurs before initial course design.
- Research is refreshed during course generation.
- A live course can compare its prior and current source maps on demand and every five minutes while open.
- Grading performs a fresh scholarly search based on the submitted response and exposes newly relevant papers.
- Tutor questions trigger fresh research and return source links.
- Uploaded PDF and text materials enter the evidence map as learner-provided claims, not presumed facts.
- Sources, DOI records, videos, tools, citation counts, and provider failures remain visible.
- AI synthesis is optional and clearly distinguished from deterministic source-driven behavior.

This is a working vertical slice, not yet a production university.

## Production architecture still required

### 1. Durable identity and learner model

- Accounts, authentication, organizations, roles, consent, export, and deletion.
- Persistent mastery graph by concept—not only course-level percentages.
- Attempt history, misconceptions, interests, accommodations, pacing, and preferred modalities.
- Spaced-retrieval and prerequisite scheduling across courses.
- Portable portfolio containing artifacts, rubrics, feedback, and source provenance.

### 2. Research and provenance infrastructure

- Durable database for normalized works, authors, venues, claims, citations, and snapshots.
- DOI, ISBN, ORCID, URL, and media-ID deduplication.
- Retraction, correction, version, conflict-of-interest, and journal-policy monitoring.
- Full-text licensing and access-state tracking; do not imply access to paywalled text.
- Claim-level evidence graph with support, contradiction, uncertainty, and date ranges.
- Scheduled refresh jobs and event-driven curriculum-impact analysis.
- Human-review queue for low-confidence, contested, medical, legal, or safety-critical material.

### 3. Agent orchestration

Use separate, auditable roles rather than one prompt:

- Research agent: searches, normalizes, ranks, and identifies gaps.
- Epistemic auditor: checks claim support, disagreement, uncertainty, and source quality.
- Curriculum architect: constructs prerequisites, outcomes, scope, and sequence.
- Lesson designer: selects modalities and activities for each learning objective.
- Assessment designer: creates authentic tasks, rubrics, and calibration examples.
- Tutor: answers from the approved evidence graph and learner model.
- Grader: scores against a versioned rubric and cites evidence for feedback.
- Curriculum maintainer: determines which lessons and assessments change after research updates.

Each agent needs structured outputs, evaluation tests, budgets, timeouts, retry policy, and a full trace.

### 4. Real course engine

- Programs, courses, modules, lessons, prerequisites, electives, and capstones as stored entities.
- Objective-to-activity-to-assessment alignment checks.
- Adaptive branching based on demonstrated mastery.
- Genuine simulations, notebooks, sandboxes, flashcards, seminars, labs, and project workflows.
- Calendar, workload forecasting, reminders, cohort pacing, and instructor-style interventions.
- Course-version migration that preserves completed work.

### 5. Multimedia pipeline

- Official YouTube/Vimeo discovery, embedding rights, captions, transcripts, and accessibility checks.
- Transcript-to-concept alignment rather than topic-only video matching.
- Licensed image and diagram sources with attribution.
- Data-driven charts and simulations generated from verified datasets.
- Optional model-generated diagrams and illustrations with factual and visual QA.
- Alt text, keyboard access, captions, audio descriptions, reduced motion, and responsive layouts.

### 6. Assessment that can be trusted

- Versioned rubrics with criterion-level evidence.
- Calibrated exemplar sets and inter-rater agreement tests.
- Oral defense, project artifacts, process logs, code execution, and source checking where appropriate.
- Multiple attempts with measured improvement and targeted revision plans.
- Appeals and feedback challenges with an independent re-grade path.
- Detection of unsupported claims, fabricated citations, rubric gaming, and prompt injection in submissions.
- Human escalation for consequential or ambiguous grades.

### 7. Community and human support

- Peer review, discussion moderation, study groups, office hours, and project critique.
- Expert or faculty review marketplace for capstones and disputed assessments.
- Safety routing for crisis, medical, legal, financial, and harmful-content topics.
- Clear language that the platform is educational and non-accredited.

### 8. Platform operations

- PostgreSQL plus object storage; vector and graph indexes only where they materially help.
- Background job queue for research, generation, media processing, and monitoring.
- Provider abstraction for models, search indexes, video services, and storage.
- Secrets management, encryption, audit logs, rate limits, abuse controls, and backups.
- Observability for cost, latency, provider failure, stale research, hallucination, grading drift, and learner outcomes.
- Automated eval suites before prompt, model, rubric, or retrieval changes ship.

### 9. Rights, privacy, and governance

- Copyright and licensing policy for readings, media, uploads, model-generated assets, and exports.
- FERPA-like privacy posture even if not legally required; age-appropriate consent where relevant.
- Clear data-retention and model-provider disclosure.
- Bias audits across topics, languages, cultures, and learner backgrounds.
- Accessibility target of WCAG 2.2 AA or better.

## Recommended build order

1. Add PostgreSQL, object storage, accounts, and persistent learner/course/research entities.
2. Replace request-time research with queued research jobs and versioned snapshots.
3. Add the claim graph and curriculum-impact engine.
4. Connect the Responses API with structured schemas and separate research, curriculum, tutor, and grader prompts.
5. Persist mastery, attempts, evidence traces, tutor conversations, and revision history.
6. Add official YouTube search, transcript ingestion, licensing checks, and media-to-objective matching.
7. Build authentic assessment runners: documents, code, oral responses, simulations, and project portfolios.
8. Add human escalation, appeals, expert review, safety routing, and moderation.
9. Create automated academic-quality, grading-calibration, accessibility, privacy, and cost evals.
10. Run a limited pilot in two very different domains before broad release.

## Minimum configuration for the present prototype

- `OPENAI_API_KEY`: activates model-written course synthesis and source-grounded tutor responses.
- `OPENAI_MODEL`: defaults to `gpt-5.4-mini` in this build.
- `YOUTUBE_API_KEY`: replaces YouTube web-result discovery with the official Data API.

Keys must remain server-side. The application must never store them in browser storage or source-controlled files.

