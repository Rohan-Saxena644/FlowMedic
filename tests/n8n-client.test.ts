import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { N8nClient } from "../packages/ai/src/n8n-client";

describe("n8n Public API HTTP contract (test server, not an n8n instance)", () => {
  let server: Server, baseUrl: string;
  const requests: { url: string; key: string | undefined }[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push({
        url: req.url!,
        key: req.headers["x-n8n-api-key"] as string | undefined,
      });
      res.setHeader("content-type", "application/json");
      if (req.headers["x-n8n-api-key"] !== "test-private-key") {
        res.writeHead(401);
        res.end(JSON.stringify({ message: "Unauthorized" }));
        return;
      }
      if (req.url === "/api/v1/workflows?limit=1") {
        res.end(
          JSON.stringify({ data: [{ id: "workflow-1", name: "CRM sync" }] }),
        );
        return;
      }
      if (req.url === "/api/v1/executions/42?includeData=true") {
        res.end(
          JSON.stringify({
            id: "42",
            workflowId: "workflow-1",
            data: {
              authorization: "Bearer private",
              nested: { apiKey: "do-not-persist" },
            },
          }),
        );
        return;
      }
      if (req.url === "/api/v1/workflows/workflow-1") {
        res.end(JSON.stringify({ id: "workflow-1", name: "CRM sync" }));
        return;
      }
      if (req.url === "/api/v1/workflows/forbidden") {
        res.writeHead(403);
        res.end("{}");
        return;
      }
      if (req.url === "/api/v1/workflows/redirect") {
        res.writeHead(302, { location: "/must-not-fetch" });
        res.end();
        return;
      }
      if (req.url === "/api/v1/workflows/invalid") {
        res.end("{not json");
        return;
      }
      if (req.url === "/api/v1/workflows/wrong-shape") {
        res.end("[]");
        return;
      }
      if (req.url === "/api/v1/workflows/wrong-identity") {
        res.end('{"id":"different-workflow"}');
        return;
      }
      if (req.url === "/api/v1/workflows/large") {
        res.write('{"id":"large","data":"');
        res.end("x".repeat(4096) + '"}');
        return;
      }
      if (req.url === "/api/v1/workflows/slow") {
        const timer = setTimeout(() => res.end('{"id":"slow"}'), 1000);
        res.on("close", () => clearTimeout(timer));
        return;
      }
      res.writeHead(404);
      res.end("{}");
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Test server failed");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const client = () => new N8nClient({ baseUrl, apiKey: "test-private-key" });
  it("uses documented resource paths and the API-key header", async () => {
    expect((await client().checkConnection()).available).toBe(true);
    expect((await client().getExecution("42")).available).toBe(true);
    expect((await client().getWorkflow("workflow-1")).available).toBe(true);
    expect(requests).toContainEqual({
      url: "/api/v1/executions/42?includeData=true",
      key: "test-private-key",
    });
  });
  it("redacts execution credentials before returning context", async () => {
    const r = await client().getExecution("42");
    expect(JSON.stringify(r)).not.toMatch(/do-not-persist|Bearer private/);
    expect(JSON.stringify(r)).toContain("[REDACTED]");
  });
  it("reports permission failures without returning their bodies", async () => {
    expect(await client().getWorkflow("forbidden")).toMatchObject({
      available: false,
      code: "ACCESS_DENIED",
      status: 403,
    });
    expect(
      await new N8nClient({ baseUrl, apiKey: "wrong" }).checkConnection(),
    ).toMatchObject({ available: false, code: "ACCESS_DENIED", status: 401 });
  });
  it("refuses redirects without sending credentials to their destination", async () => {
    expect(await client().getWorkflow("redirect")).toMatchObject({
      available: false,
      code: "REDIRECT_REFUSED",
    });
    expect(requests.some((r) => r.url === "/must-not-fetch")).toBe(false);
  });
  it.each([
    "..",
    "../executions/42",
    "https://other.invalid",
    "a?includeData=false",
  ])("rejects path manipulation: %s", (id) =>
    expect(() => client().getWorkflow(id)).toThrow(),
  );
  it.each([
    "http://user:secret@localhost:5678",
    "http://localhost:5678?token=x",
    "http://localhost:5678/#fragment",
    "file:///etc/passwd",
  ])("rejects ambiguous trusted base configuration: %s", (url) =>
    expect(() => new N8nClient({ baseUrl: url, apiKey: "key" })).toThrow(),
  );
  it.each(["invalid", "wrong-shape"])(
    "reports invalid response: %s",
    async (id) =>
      expect(await client().getWorkflow(id)).toMatchObject({
        available: false,
        code: "INVALID_RESPONSE",
      }),
  );
  it("rejects a resource whose identity differs from the requested source", async () =>
    expect(await client().getWorkflow("wrong-identity")).toMatchObject({
      available: false,
      code: "INVALID_RESPONSE",
    }));
  it("enforces the byte limit while streaming chunked context", async () =>
    expect(
      await new N8nClient({
        baseUrl,
        apiKey: "test-private-key",
        maxResponseBytes: 128,
      }).getWorkflow("large"),
    ).toMatchObject({ available: false, code: "TOO_LARGE" }));
  it("bounds requests to an unresponsive instance", async () =>
    expect(
      await new N8nClient({
        baseUrl,
        apiKey: "test-private-key",
        timeoutMs: 50,
      }).getWorkflow("slow"),
    ).toMatchObject({ available: false, code: "TIMEOUT" }));
});
