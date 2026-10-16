import { config } from "../../../packages/shared/src/config.js";
for (const scenario of ["rate-limit", "schema-mismatch", "ambiguous-timeout"]) {
  const r = await fetch(
    `http://localhost:${config.PORT}/api/v1/demo/scenarios/${scenario}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.OPERATOR_TOKEN}` },
    },
  );
  if (!r.ok) throw Error(`Seed failed: ${r.status}`);
  console.log(scenario, await r.json());
}
