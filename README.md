# Materia live research prototype

Materia now runs as a local full-stack application. Opening `index.html` directly only displays the interface; live research requires the server.

## Start

From this folder:

```powershell
.\start.ps1
```

Then open <http://127.0.0.1:4173/>.

## Optional AI and video configuration

The source-driven course builder works without credentials. For model-written synthesis and official YouTube search, set keys in the same terminal before starting:

```powershell
$env:OPENAI_API_KEY = "your local key"
$env:OPENAI_MODEL = "gpt-5.4-mini"
$env:YOUTUBE_API_KEY = "your local key"
.\start.ps1
```

Do not place keys in `app.js`, `server.mjs`, or browser storage.

## What is live

- Crossref journal-record search with local relevance and noise filtering
- Wikipedia overview discovery
- Open Library book discovery
- YouTube embeds; official Data API when configured, web-result fallback otherwise
- GitHub tool discovery
- PDF and text-material extraction
- DOI/title/YouTube URL resolution when adding sources
- Source-linked course construction and data-driven citation graphics
- Server-side, evidence-aware grading with an exposed scoring trace
- Fresh scholarly research during course generation and every grading pass
- A researching tutor that checks current sources before answering
- Research Watch with manual checks and five-minute in-course polling
- Source-map diffs showing additions and removals
- Optional OpenAI Responses API course synthesis

See [AI_UNIVERSITY_BLUEPRINT.md](AI_UNIVERSITY_BLUEPRINT.md) for the production architecture and remaining work.

## Important limits

Crossref's `journal-article` metadata is not proof that a journal peer-reviewed an item. YouTube and GitHub popularity are not proof of instructional quality. The interface therefore links every result for inspection and labels manually added sources that still need verification.
