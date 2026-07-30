# Provider Adapter Contract

`src/lib/integrations/shared/contract.ts` defines the ONLY surface
between the application and external scheduling systems. Provider
payload shapes never leak past `normalizeSourceRecord`.

## Interface

```
ProviderAdapter {
  key, displayName, adapterVersion
  status: 'available' | 'blocked'; blockedReasons; setupChecklist
  getCapabilities(): ProviderCapabilities      // explicit, verified
  validateConnection(ctx) / healthCheck(ctx)
  fetchAppointments?(ctx): ProviderPage        // optional per capability
  fetchChangedAppointments?(ctx, since)        // optional (modified-since)
  normalizeSourceRecord(record, ctx): NormalizeResult  // → Phase 3 shape
  evidenceColumns / toEvidenceRow(record)      // deterministic CSV
  importAdapter: SourceAdapter                 // Phase 3 staging adapter
  verifyWebhook?(...) / parseWebhook?(...)     // optional per capability
}
```

Principles:

- **Capabilities are explicit.** Adapters declare what the OFFICIAL
  documentation verifies (page sizes, pagination style, webhooks,
  modified-since). The sync engine refuses operations outside the
  declared matrix. Nothing is assumed from memory.
- **No adapter must implement everything.** Optional methods are absent
  when unsupported; the engine treats absence as incapability.
- **Blocked adapters fail closed.** `setmore_api` and `acuity_api`
  throw `ProviderBlockedError` from every data-facing method, return
  `provider_blocked` validation outcomes, and publish their exact
  missing inputs as `setupChecklist`. Their verified-but-unusable
  capability matrices are still recorded honestly.
- **Normalization targets the EXISTING staging model.** The output of
  `normalizeSourceRecord`/`importAdapter.normalizeRow` is the Phase 3
  `NormalizedRow` — the same matching, aliasing, review, and duplicate
  machinery applies to API data and CSV uploads identically.
- **Evidence is deterministic.** `evidenceColumns`+`toEvidenceRow`
  serialize records into a canonical CSV (sorted by external id in the
  engine) whose hash identifies the batch exactly like a manual upload.
- **Secrets are opaque.** Adapters receive `ctx.secret` resolved
  server-side and must never log or echo it.

## Versioning

`adapterVersion` is stamped on providers (catalog + batch metadata).
Incompatible upstream changes require a NEW adapter version reviewed
against verified payloads; schema drift blocks posting until then
(shared/drift.ts + engine fail-closed path).

## Adding a provider

1. Verify the official documentation (auth, endpoints, pagination,
   webhooks, limits, tiers) and record a `*_API_FINDINGS.md` with the
   inspection date.
2. Obtain credentials + representative data; capture real payloads for
   the tricky cases (status semantics, recurrence, cancellation).
3. Implement the adapter against VERIFIED shapes with synthetic
   fixtures matching documented responses; declare only proven
   capabilities.
4. Register it (registry + `integration_providers` migration row).
5. Extend unit + live coverage; real-provider verification is reported
   separately from framework verification.
