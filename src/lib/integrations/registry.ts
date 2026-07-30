/**
 * Provider registry — the single lookup from provider key to adapter.
 * Status here mirrors the integration_providers catalog; both are
 * migration/code-controlled, never user-editable.
 */

import type { ProviderAdapter, ProviderKey } from "./shared/contract";
import { acuityAdapter } from "./providers/acuity";
import { setmoreAdapter } from "./providers/setmore";
import { testProviderAdapter } from "./providers/test-provider";

const REGISTRY: Record<ProviderKey, ProviderAdapter> = {
  setmore_api: setmoreAdapter,
  acuity_api: acuityAdapter,
  test_provider: testProviderAdapter,
};

export function getProviderAdapter(key: string): ProviderAdapter | null {
  return (REGISTRY as Record<string, ProviderAdapter>)[key] ?? null;
}

export function listProviderAdapters(): ProviderAdapter[] {
  return Object.values(REGISTRY);
}
