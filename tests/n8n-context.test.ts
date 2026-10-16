import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
const { settings } = vi.hoisted(() => ({
  settings: {
    N8N_BASE_URL: "http://127.0.0.1",
    N8N_API_KEY: "test-key",
    N8N_INTEGRATION_ID: "linked-integration",
  },
}));
vi.mock("../packages/shared/src/config.js", () => ({ config: settings }));
import {
  checkN8nConnection,
  getLiveExecutionContext,
} from "../packages/ai/src/n8n";
describe("n8n context assembly (HTTP test server)", () => {
  let server: Server;
  let requestCount = 0;
  beforeAll(async () => {
    server = createServer((req, res) => {
      requestCount++;
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/v1/workflows?limit=1") {
        res.end('{"data":[{"id":"allowed"}]}');
        return;
      }
      if (req.url === "/api/v1/executions/42?includeData=true") {
        res.end('{"id":"42","data":{"result":"failure evidence"}}');
        return;
      }
      if (req.url === "/api/v1/workflows/allowed") {
        res.end('{"id":"allowed","name":"CRM sync"}');
        return;
      }
      res.writeHead(403);
      res.end('{"message":"permission denied"}');
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Test server failed");
    settings.N8N_BASE_URL = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  it("keeps readable execution evidence when workflow permissions are missing", async () =>
    expect(
      await getLiveExecutionContext("linked-integration", "42", "forbidden"),
    ).toMatchObject({
      available: true,
      execution: { available: true },
      workflow: { available: false, code: "ACCESS_DENIED" },
    }));
  it("keeps readable workflow metadata when no execution ID was supplied", async () =>
    expect(
      await getLiveExecutionContext("linked-integration", null, "allowed"),
    ).toMatchObject({
      available: true,
      execution: { available: false, code: "MISSING_SOURCE_ID" },
      workflow: { available: true },
    }));
  it("reports unavailable context when neither resource can be read", async () =>
    expect(
      await getLiveExecutionContext("linked-integration", "43", "forbidden"),
    ).toMatchObject({
      available: false,
      execution: { available: false },
      workflow: { available: false },
    }));
  it("never queries the configured instance for an unlinked integration", async () => {
    const before = requestCount;
    expect(
      await getLiveExecutionContext("unlinked", "42", "allowed"),
    ).toMatchObject({ available: false });
    expect(await checkN8nConnection("unlinked")).toMatchObject({
      configured: false,
      readable: false,
      code: "NOT_CONFIGURED",
    });
    expect(requestCount).toBe(before);
  });
  it("reports invalid server configuration without fetching", async () => {
    const previous = settings.N8N_BASE_URL;
    const before = requestCount;
    settings.N8N_BASE_URL = "http://localhost:5678?apiKey=must-not-be-used";
    try {
      expect(await checkN8nConnection("linked-integration")).toMatchObject({
        configured: true,
        readable: false,
        code: "INVALID_CONFIGURATION",
      });
      expect(requestCount).toBe(before);
    } finally {
      settings.N8N_BASE_URL = previous;
    }
  });
  it("checks read access without claiming live retry capability", async () =>
    expect(await checkN8nConnection("linked-integration")).toMatchObject({
      configured: true,
      readable: true,
      code: "CONNECTED",
      liveRetryEnabled: false,
    }));
  it("keeps workflow evidence when the source execution ID is invalid", async () =>
    expect(
      await getLiveExecutionContext("linked-integration", "../42", "allowed"),
    ).toMatchObject({
      available: true,
      execution: { available: false, code: "INVALID_SOURCE_ID" },
      workflow: { available: true },
    }));
});
