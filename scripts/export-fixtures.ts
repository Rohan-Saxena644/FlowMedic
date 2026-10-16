import { mkdir, writeFile } from "node:fs/promises";
import { fixture } from "../apps/api/src/fixtures.js";
await mkdir("examples/fixtures", { recursive: true });
for (const scenario of ["rate-limit", "schema-mismatch", "ambiguous-timeout"]) {
  const event = fixture(scenario);
  event.eventId = `example-${scenario}`;
  event.timestamp = "2026-10-17T12:00:00.000Z";
  event.execution.id = `example-${scenario}`;
  await writeFile(
    `examples/fixtures/${scenario}.json`,
    JSON.stringify(event, null, 2) + "\n",
  );
}
