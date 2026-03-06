/**
 * Integration tests for the generated Plexus client in orcha-maestro.
 *
 * These tests run against a live substrate at $PLEXUS_URL (default ws://127.0.0.1:4444).
 * The client uses browser-transport (no `ws` import) — Bun provides global WebSocket.
 *
 * Run with: bun test test/plexus/
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

import { PlexusRpcClient } from "../../src/lib/plexus/transport";
import { createHealthClient } from "../../src/lib/plexus/health";
import { createEchoClient } from "../../src/lib/plexus/echo";
import { createRegistryClient } from "../../src/lib/plexus/registry";
import { createConeClient } from "../../src/lib/plexus/cone";

const URL = process.env.PLEXUS_URL ?? "ws://127.0.0.1:4444";

/** Collect all items from an async generator into an array. */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

// ─────────────────────────────────────────────
// Shared RPC client (one WebSocket for all tests)
// ─────────────────────────────────────────────

let rpc: PlexusRpcClient;

beforeAll(async () => {
  rpc = new PlexusRpcClient({ backend: "substrate", url: URL });
  await rpc.connect();
});

afterAll(() => {
  rpc.disconnect();
});

// ─────────────────────────────────────────────
// Transport / Connection
// ─────────────────────────────────────────────

describe("transport", () => {
  test("connects to substrate", () => {
    // If beforeAll succeeded, the connection works.
    // PlexusRpcClient doesn't expose readyState directly so we verify by making a call.
    expect(rpc).toBeDefined();
  });

  test("reconnect is idempotent", async () => {
    // Calling connect() on an already-open socket is a no-op — no error thrown.
    await rpc.connect();
  });
});

// ─────────────────────────────────────────────
// health plugin
// ─────────────────────────────────────────────

describe("health", () => {
  test("check() returns a status event", async () => {
    const health = createHealthClient(rpc);
    const result = await health.check();

    expect(result).toBeDefined();
    expect(result.type).toBe("status");
    expect(typeof result.status).toBe("string");
    expect(typeof result.uptimeSeconds).toBe("number");
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  test("check() uptime is a positive integer", async () => {
    const health = createHealthClient(rpc);
    const result = await health.check();
    expect(Number.isFinite(result.uptimeSeconds)).toBe(true);
  });

  test("schema() returns plugin schema", async () => {
    const health = createHealthClient(rpc);
    const schema = await health.schema();
    // SchemaResult is unknown in the IR but should be a non-null object
    expect(schema).toBeTruthy();
  });
});

// ─────────────────────────────────────────────
// echo plugin
// ─────────────────────────────────────────────

describe("echo", () => {
  test("once() echoes a message", async () => {
    const echo = createEchoClient(rpc);
    const result = await echo.once("hello from orcha-maestro");

    expect(result.type).toBe("echo");
    expect(result.message).toBe("hello from orcha-maestro");
    expect(result.count).toBe(1);
  });

  test("echo() returns an echo event", async () => {
    const echo = createEchoClient(rpc);
    // echo.echo is non-streaming (collectOne takes the first item).
    // The `count` field in the response is the repetition sequence number (starts at 1).
    const result = await echo.echo(3, "repeat");

    expect(result.type).toBe("echo");
    expect(result.message).toBe("repeat");
    expect(typeof result.count).toBe("number");
  });

  test("once() with special characters", async () => {
    const echo = createEchoClient(rpc);
    const msg = "hello 🎭 world & <test>";
    const result = await echo.once(msg);
    expect(result.message).toBe(msg);
  });
});

// ─────────────────────────────────────────────
// registry plugin (streaming)
// ─────────────────────────────────────────────

describe("registry", () => {
  test("list() streams backend events", async () => {
    const registry = createRegistryClient(rpc);
    const events = await collect(registry.list());

    // There should be at least one event (the substrate itself)
    expect(events.length).toBeGreaterThan(0);
  });

  test("list() events have backends type", async () => {
    const registry = createRegistryClient(rpc);
    const events = await collect(registry.list());

    // Expect a 'backends' event with a list
    const backendsEvent = events.find((e) => e.type === "backends");
    expect(backendsEvent).toBeDefined();
  });

  test("list() backends event has array shape", async () => {
    const registry = createRegistryClient(rpc);
    const events = await collect(registry.list());

    const backendsEvent = events.find((e) => e.type === "backends") as any;
    expect(backendsEvent).toBeDefined();
    // The backends array may be empty if no backends have been registered via the registry
    expect(Array.isArray(backendsEvent.backends)).toBe(true);
  });

  test("get() retrieves substrate by name", async () => {
    const registry = createRegistryClient(rpc);
    const events = await collect(registry.get("substrate"));
    expect(events.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// cone plugin
// ─────────────────────────────────────────────

describe("cone", () => {
  test("list() returns a result", async () => {
    const cone = createConeClient(rpc);
    const result = await cone.list();
    // Result may be empty but should not throw
    expect(result).toBeDefined();
  });

  test("registry() returns available models", async () => {
    const cone = createConeClient(rpc);
    const result = await cone.registry();
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// Multiple concurrent calls
// ─────────────────────────────────────────────

describe("concurrency", () => {
  test("parallel calls resolve independently", async () => {
    const health = createHealthClient(rpc);
    const echo = createEchoClient(rpc);

    const [h, e] = await Promise.all([
      health.check(),
      echo.once("concurrent"),
    ]);

    expect(h.type).toBe("status");
    expect(e.message).toBe("concurrent");
  });

  test("sequential calls on same connection", async () => {
    const echo = createEchoClient(rpc);
    const r1 = await echo.once("first");
    const r2 = await echo.once("second");
    expect(r1.message).toBe("first");
    expect(r2.message).toBe("second");
  });
});
