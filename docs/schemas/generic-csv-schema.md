# Generic Manual CSV — Schema Contract

**Adapter:** `manual_csv` · **Adapter version:** `generic-v1` · **Status:** SUPPORTED (mapping-driven)

## Purpose

Imports any well-formed CSV whose columns an authorized user maps into
canonical fields through the column-mapping UI. Used for hand-built sheets
and for sources without a dedicated adapter (currently Acuity).

## File requirements

- RFC 4180 CSV; UTF-8 (BOM tolerated); `,` delimiter (`;` and tab
  auto-detected); one header row; ≤ 10,000 data rows; ≤ 10 MB.
- Header names are free-form; mapping is by user assignment, not by name.

## Canonical mapping targets

| Canonical field | Type | Required |
| --- | --- | --- |
| `appointment_date` | date (`YYYY-MM-DD`, `D MMM YYYY`, `M/D/YYYY`) | yes* |
| `start_time` | time (`HH:mm`, `h:mm AM/PM`) | yes* |
| `end_time` | time | one of end_time / duration |
| `time_range` | `h:mm AM - h:mm PM` range (alternative to the three above) | — |
| `start_at` | full timestamp (alternative) | — |
| `duration_minutes` | integer minutes | one of end_time / duration |
| `trainer_name` | text | yes |
| `trainer_email` | email | no |
| `client_name` | text | no (warning if absent) |
| `client_email` | email | no |
| `client_phone` | text | no |
| `service_name` | text | yes |
| `status` | text (mapped via status mappings) | no (`unknown` if absent) |
| `listed_price` | money (`80.75`, `$1,234.50`) | no |
| `amount_paid` | money | no |
| `external_appointment_id` | text | no |
| `external_client_id` | text | no |
| `notes` | text | no |
| `location` | text | no |
| *(ignore)* | column excluded from normalization | — |

\* date+time may be satisfied by `time_range` or `start_at` instead.

## Saved mappings

- Stored in `import_schema_profiles`: organization-scoped, source-scoped,
  versioned, audited, keyed by a **header signature** (sha256 of the
  normalized header list). A profile is only auto-suggested for files with
  the exact same signature — materially different schemas are never
  trusted automatically.

## Explicitly not supported

- Excel files (`.xlsx`) — export as CSV first.
- Multi-row headers, pivoted layouts, or files without a header row.
- Formula evaluation: cells beginning with `= + - @` are stored as inert
  text and prefixed on any future export (formula-injection protection).
