import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccessTokenCache,
  exchangeRefreshToken,
  getAccessToken,
  isTokenUsable,
  toSetmoreDateParam,
} from "@/lib/sources/setmore/api-client";
import { IntegrationFailure } from "@/lib/integrations/shared/failures";

/**
 * The exact payload from Setmore's published quickstart. If our parsing
 * drifts from this shape, authentication breaks in a way no other test
 * would catch.
 */
const DOCUMENTED_TOKEN_RESPONSE = {
  response: true,
  data: {
    token: {
      access_token: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      token_type: "BEARER",
      expires_in: 604799,
      user_id: "XXXXXXXXXX-XXXXXXXXXX-XXXXXXXXXX",
    },
  },
};

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

function stubFetch(body: unknown, init?: { status?: number }) {
  return vi.fn(async () => jsonResponse(body, init)) as unknown as typeof fetch;
}

beforeEach(() => {
  clearAccessTokenCache();
});

describe("token exchange against the documented contract", () => {
  it("parses the published response shape", async () => {
    const fetchImpl = stubFetch(DOCUMENTED_TOKEN_RESPONSE);
    const token = await exchangeRefreshToken("refresh-abc", { fetchImpl });
    expect(token.accessToken).toBe("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    expect(isTokenUsable(token)).toBe(true);
  });

  it("calls the documented endpoint with the refresh token url-encoded", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(DOCUMENTED_TOKEN_RESPONSE));
    await exchangeRefreshToken("a/b+c d", { fetchImpl: fetchImpl as unknown as typeof fetch });
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toBe(
      "https://developer.setmore.com/api/v1/o/oauth2/token?refreshToken=a%2Fb%2Bc%20d"
    );
  });

  it("expires slightly early so a token never lapses mid-page", async () => {
    const token = await exchangeRefreshToken("r", { fetchImpl: stubFetch(DOCUMENTED_TOKEN_RESPONSE) });
    const lifetimeSeconds = (token.expiresAtMs - Date.now()) / 1000;
    expect(lifetimeSeconds).toBeGreaterThan(604_000);
    expect(lifetimeSeconds).toBeLessThan(604_799);
  });

  it("falls back to a conservative hour when expires_in is absent or absurd", async () => {
    for (const expiresIn of [undefined, 0, -5, 99_999_999]) {
      const body = { data: { token: { access_token: "t", expires_in: expiresIn } } };
      const token = await exchangeRefreshToken("r", { fetchImpl: stubFetch(body) });
      const lifetime = (token.expiresAtMs - Date.now()) / 1000;
      expect(lifetime).toBeGreaterThan(3_000);
      expect(lifetime).toBeLessThanOrEqual(3_600);
    }
  });

  it("rejects an empty credential without making a request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      exchangeRefreshToken("  ", { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow(IntegrationFailure);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a well-formed response that carries no access token", async () => {
    const body = { response: true, data: { token: { token_type: "BEARER" } } };
    await expect(exchangeRefreshToken("r", { fetchImpl: stubFetch(body) })).rejects.toThrow(
      /did not contain an access token/
    );
  });

  it("maps HTTP failures onto the platform's stable failure codes", async () => {
    const cases: [number, string][] = [
      [401, "authentication_failed"],
      [403, "authorization_failed"],
      [429, "rate_limited"],
      [503, "provider_unavailable"],
      [418, "invalid_response"],
    ];
    for (const [status, code] of cases) {
      const fetchImpl = stubFetch({ error: "nope" }, { status });
      await expect(exchangeRefreshToken("r", { fetchImpl })).rejects.toMatchObject({ code });
    }
  });

  it("never echoes the credential in a failure message", async () => {
    const fetchImpl = stubFetch({ error: "bad" }, { status: 401 });
    await expect(
      exchangeRefreshToken("super-secret-refresh-token", { fetchImpl })
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("super-secret-refresh-token"),
      }) as Error
    );
  });
});

describe("access-token caching", () => {
  it("exchanges once and reuses the token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(DOCUMENTED_TOKEN_RESPONSE));
    const impl = fetchImpl as unknown as typeof fetch;
    const first = await getAccessToken("refresh-abc", { fetchImpl: impl });
    const second = await getAccessToken("refresh-abc", { fetchImpl: impl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.accessToken).toBe(first.accessToken);
  });

  it("re-exchanges once the cached token has expired", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: { token: { access_token: "short", expires_in: 30 } } })
    );
    const impl = fetchImpl as unknown as typeof fetch;
    // expires_in 30 minus the 60s safety margin is already in the past.
    await getAccessToken("r", { fetchImpl: impl });
    await getAccessToken("r", { fetchImpl: impl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not share a token between different credentials", async () => {
    let counter = 0;
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: { token: { access_token: `tok-${++counter}`, expires_in: 604799 } } })
    );
    const impl = fetchImpl as unknown as typeof fetch;
    const a = await getAccessToken("refresh-A", { fetchImpl: impl });
    const b = await getAccessToken("refresh-B", { fetchImpl: impl });
    expect(a.accessToken).not.toBe(b.accessToken);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("clears on demand, so a rotated credential cannot be served from cache", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(DOCUMENTED_TOKEN_RESPONSE));
    const impl = fetchImpl as unknown as typeof fetch;
    await getAccessToken("r", { fetchImpl: impl });
    clearAccessTokenCache();
    await getAccessToken("r", { fetchImpl: impl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("stays bounded when many credentials are used", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(DOCUMENTED_TOKEN_RESPONSE));
    const impl = fetchImpl as unknown as typeof fetch;
    for (let i = 0; i < 40; i++) {
      await getAccessToken(`refresh-${i}`, { fetchImpl: impl });
    }
    // The earliest entry was evicted, so re-requesting it exchanges again.
    await getAccessToken("refresh-0", { fetchImpl: impl });
    expect(fetchImpl).toHaveBeenCalledTimes(41);
  });
});

describe("date parameter format", () => {
  it("converts ISO dates to Setmore's dd-MM-yyyy window format", () => {
    expect(toSetmoreDateParam("2025-12-01")).toBe("01-12-2025");
    expect(toSetmoreDateParam("2026-08-15")).toBe("15-08-2026");
  });

  it("refuses anything that is not an ISO date", () => {
    expect(() => toSetmoreDateParam("01-12-2025")).toThrow(IntegrationFailure);
    expect(() => toSetmoreDateParam("2025-12-1")).toThrow(IntegrationFailure);
  });
});
