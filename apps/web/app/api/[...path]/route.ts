import { NextRequest } from "next/server";
// Server-side credential bridge. The operator token never enters browser JavaScript.
// Same-origin checks protect mutation endpoints in this single-operator localhost MVP.
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!["GET", "POST"].includes(request.method))
    return Response.json(
      { error: { message: "Method not allowed" } },
      { status: 405 },
    );
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const allowed = new Set([expected]);
  const configured = new URL(expected);
  if (["localhost", "127.0.0.1"].includes(configured.hostname)) {
    for (const host of ["localhost", "127.0.0.1"]) {
      const alias = new URL(expected);
      alias.hostname = host;
      allowed.add(alias.origin);
    }
  }
  if (!allowed.has(request.nextUrl.origin))
    return Response.json(
      { error: { message: "Invalid request host" } },
      { status: 403 },
    );
  if (request.method === "POST" && (!origin || !allowed.has(origin)))
    return Response.json(
      { error: { message: "Invalid request origin" } },
      { status: 403 },
    );
  const token = process.env.OPERATOR_TOKEN;
  if (!token)
    return Response.json(
      {
        error: {
          message: "OPERATOR_TOKEN is not configured on the web server",
        },
      },
      { status: 503 },
    );
  try {
    const response = await fetch(
      `${process.env.API_URL ?? "http://localhost:4000"}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: request.method === "POST" ? await request.text() : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      {
        error: {
          message:
            "The API is unavailable. Start the backend and check service health.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
