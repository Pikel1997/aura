/**
 * Aura bridge client — talks to the local Python bridge running on
 * 127.0.0.1:8787. The bridge forwards UDP commands to the WiZ bulb.
 */

export const BRIDGE_URL = "http://127.0.0.1:8787";

export type BridgeStatus = {
  service: string;
  version: string;
  connected: boolean;
  ip: string | null;
};

export type DiscoveredBulb = { ip: string; mac: string };

async function req<T = any>(
  path: string,
  init?: RequestInit,
  timeoutMs = 12000
): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function ping(): Promise<BridgeStatus> {
  return req<BridgeStatus>("/health", { method: "GET" }, 2000);
}

export async function discover(): Promise<DiscoveredBulb[]> {
  const r = await req<{ bulbs: DiscoveredBulb[] }>(
    "/discover",
    { method: "GET" },
    20000
  );
  return r.bulbs;
}

export async function connectBulb(ip: string): Promise<boolean> {
  const r = await req<{ ok: boolean }>("/connect", {
    method: "POST",
    body: JSON.stringify({ ip }),
  });
  return r.ok;
}

export async function setBulbColor(
  r: number,
  g: number,
  b: number,
  bri: number
): Promise<void> {
  await req("/color", {
    method: "POST",
    body: JSON.stringify({ r, g, b, bri }),
  });
}

export async function turnBulbOff(): Promise<void> {
  await req("/off", { method: "POST" });
}

export async function getModel(): Promise<{ moduleName: string; fwVersion?: string }> {
  return req<{ moduleName: string; fwVersion?: string }>("/model", { method: "GET" }, 5000);
}
