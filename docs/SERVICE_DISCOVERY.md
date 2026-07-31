# Import Discovery Engine

How the onboarding wizard learns what is in a scheduling export without
importing it — and why it introduces no new parsing or matching rules.

Module: `src/lib/imports/discovery.ts`
Tests: `tests/unit/import-discovery.test.ts` (22 cases)

## What it is

`discoverFromCsv()` answers one question: **"what is in this file?"**

It returns detected trainers with appointment counts, detected services,
conservative alias clusters, source statuses, the date range covered,
observed timezones, intra-file duplicate candidates, and — when no
adapter recognises the headers — a proposed column mapping.

That report is what wizard Steps 2–4 render, so the owner reviews and
confirms lists instead of typing names the file already contains.

## What it is not

- **Not a new parser.** It calls the shipped `parseCsv`.
- **Not a new matching engine.** It calls the shipped `matchTrainer` and
  `matchService`, so a name resolves during discovery exactly as it will
  during import. Discovery cannot disagree with the importer.
- **Not a writer.** It performs no database access at all. The caller
  supplies existing trainers and services; the function returns a value.
  No batch is created, no row is staged, nothing is persisted.
- **Not an importer.** Creating trainers and services stays an explicit
  owner action through the existing server actions, and posting keeps
  its approval gate.

The engine is a *projection*: the same intelligence the import pipeline
already runs, executed earlier and in read-only mode.

## Pipeline

```
CSV text
   ↓  parseCsv                    (shipped)
headers + rows
   ↓  detectAdapter               (shipped)
adapter, or generic fallback + suggested mapping
   ↓  adapter.normalizeRow        (shipped)
NormalizedRow per row
   ↓  aggregate by normalized name
trainer / service / status tallies
   ↓  matchTrainer, matchService  (shipped)
existing-entity resolution + merge candidates
   ↓  serviceAliasGroup
alias clusters
   ↓
DiscoveryReport
```

## Suggested actions

Each detected trainer and service carries a suggested action, derived
from the match outcome — never from a guess:

| Suggested action | When | Owner sees |
| --- | --- | --- |
| `linked` | The matcher resolved it to an existing record | Already connected; no action needed |
| `merge` | Unmatched, but the matcher returned candidates | Merge into an existing record, or create new |
| `create` | Unmatched with no candidates | Create |

Weak matches never resolve silently. A shared surname produces a
*candidate*, not a link — the same rule the import pipeline enforces.

## Alias clustering is deliberately conservative

`serviceAliasGroup()` normalizes a name, removes duration tokens
(`60`, `60min`, `minutes`, `hr`) and filler words (`session`,
`appointment`), sorts what remains, and joins it. Names reducing to the
same core are offered as one alias cluster.

This groups the safe cases:

```
Personal Training
Personal Training 60          →  "personal training"
60 Min Personal Training
Personal Training 90 minutes
```

It deliberately does **not** group abbreviations:

```
PT   ↛   Personal Training
```

`PT` might mean Personal Training at one gym and Physical Therapy at
another. That is business meaning this code cannot know, so it is never
inferred. The owner merges those explicitly with the inline **Merge
alias** action — one click, no separate configuration screen, which was
the actual UX problem.

Clusters are always suggestions. Nothing merges without confirmation.

## Column mapping fallback

Setmore is the only registered adapter. `adapters/index.ts` documents
why: no Acuity sample export exists, so no Acuity schema was invented.

When `detectAdapter` finds nothing at ≥ 0.8 confidence, discovery falls
back to the shipped mapping-driven generic adapter and sets
`requiresColumnMapping: true`, along with `suggestedMappings` from
header-name heuristics (`Staff` → `trainer_name`, `Appointment Type` →
`service_name`, and so on).

Two rules keep the heuristics honest: a canonical field is proposed at
most once, and any header that matches nothing is proposed as `ignore`
rather than guessed into a field. Acuity exports travel this path, and
the UI must describe it as generic CSV mapping — not native Acuity
support.

When the caller passes a confirmed `mappings` (an owner's choice, or a
saved schema profile matched by header signature),
`requiresColumnMapping` is false and the mapping screen is skipped
entirely.

## Privacy

Discovery aggregates. Client names, emails, and phone numbers are
read during normalization but never appear in the report — it carries
counts, trainer names, service names, and statuses only. A test asserts
that client identifiers from the fixture are absent from the serialized
report.

Columns whose *names* suggest personal data are surfaced as
`sensitiveColumns` so the UI can warn before anything is stored, reusing
the shipped `detectSensitiveColumns`.

## Duplicate candidates

Discovery counts rows sharing an occurrence key (`external id + start`)
with an earlier row **in the same file**, using the shipped
`occurrenceKey`.

Cross-batch classification — exact duplicate, source update, conflict,
previously reversed — needs posted occurrences from the database and
stays where it belongs, in `classifyDuplicate` inside the import
pipeline. Discovery reports a count so the wizard can warn early; it
does not attempt the classification.

## Limits

- Bounded by `MAX_IMPORT_ROWS` (10,000), same as the importer.
- Runs in memory on the whole file. Discovery is invoked once per
  upload, not per page render.
- Aggregation is by normalized name. Two genuinely different trainers
  sharing an exact display name collapse into one entry — the same
  ambiguity the importer surfaces for review, and the reason exact
  duplicate names produce a review candidate rather than a match.
