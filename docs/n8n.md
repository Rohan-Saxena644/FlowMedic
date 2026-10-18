# Connect and verify n8n

FlowMedic accepts Error Trigger deliveries independently from optional n8n Public API context reads. These use different credentials: an integration bearer secret secures incoming events; the n8n API key grants the server permission to read evidence.

## Local Docker setup and Windows port reservations

Windows can reserve port 5678 even when no process is listening. Check `netsh interface ipv4 show excludedportrange protocol=tcp` after Docker reports a forbidden socket bind. Use an available host port while leaving n8n's internal port at 5678:

```powershell
docker volume create flowmedic_n8n
docker run -d --name flowmedic-n8n -p 127.0.0.1:15678:5678 -e GENERIC_TIMEZONE=Asia/Kolkata -e TZ=Asia/Kolkata -e N8N_EDITOR_BASE_URL=http://localhost:15678 -e N8N_WEBHOOK_URL=http://localhost:15678/ -v flowmedic_n8n:/home/node/.n8n n8nio/n8n:2.43.7
```

This command assumes the container name is unused. If an earlier failed run left a container in **Created** state, confirm its mounted data volume before removing that never-started container and reusing the same volume. Do not delete the volume. For a previously working instance, preserve its existing configuration instead of replacing it with this fresh setup.

Open `http://localhost:15678`, complete the owner account setup, and create an API key as described below. Set FlowMedic's `N8N_BASE_URL=http://localhost:15678`. Production webhook URLs should also use host port 15678; copy the URL displayed by n8n. See n8n's [editor URL setting](https://docs.n8n.io/hosting/configuration/environment-variables/deployment/) and [webhook URL configuration](https://docs.n8n.io/hosting/configuration/configuration-examples/webhook-url/).

On October 18 this environment reserved 5603–5702. The container was successfully started on 15678 using the preserved `flowmedic_n8n` volume; n8n reported version 2.43.7, health passed and the editor returned HTTP 200. Account setup, API authentication and Error Workflow delivery were still pending at that point. Startup alone does not verify the integration.

## Send a real Error Workflow event

1. Run n8n locally or use an instance that can reach FlowMedic's ingestion endpoint. FlowMedic defaults to `127.0.0.1:4000`; a separate Docker container may need an explicit reachable host address. Do not expose the trusted single-operator web app publicly to solve connectivity.
2. In FlowMedic **Integrations**, create a live integration. Copy its bearer secret immediately; only its hash persists.
3. Import `examples/n8n/error-reporter.json` into n8n. Set the HTTP Request URL to your reachable FlowMedic endpoint (`http://localhost:4000/api/v1/events/n8n` for n8n running on the same host). Assign an HTTP Header Auth credential named `Authorization` with value `Bearer <integration secret>`. Save the workflow.
4. Import `examples/n8n/failure-source.json`. In its workflow settings, select the saved reporter as its Error Workflow. Publish/activate this source workflow.
5. POST an empty JSON object to the source workflow's **production** webhook URL. On a local instance the path is normally `http://localhost:5678/webhook/flowmedic-transport-verification`; use the production URL shown by your instance. Do not use the manual execution button or the test webhook URL for this check.
6. The source deliberately fails in Stop And Error. Its reporter should deliver an event and a **live** incident should appear in FlowMedic. The production webhook may acknowledge receipt before the later node fails; the response alone is not proof of ingestion. Confirm the persisted workflow name, execution ID and deliberate error message in FlowMedic.

This tests real n8n Error Workflow transport with an intentional test failure. It does not simulate a real CRM outage, execute a live recovery, or establish diagnosis accuracy. The example has been prepared from documented node contracts but has not yet been imported into an actual n8n instance in this environment.

The reporter containing Error Trigger does not need to be published. Error Trigger runs for automatic failed executions, not manual tests. See the official [Error Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/) and [Stop And Error](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.stopanderror/) documentation.

## Enable optional evidence reads

Create an n8n Public API key under **Settings → n8n API**. Use the least permissions your instance supports: workflow list/read and execution read. Scope restrictions depend on the n8n edition; non-Enterprise API keys may grant broad account access even though FlowMedic's client only issues GET requests. See [n8n API authentication and scopes](https://docs.n8n.io/api/authentication/).

Set these server-side variables in `.env`:

```dotenv
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=<your n8n API key>
N8N_INTEGRATION_ID=<the live integration UUID from FlowMedic>
```

`N8N_BASE_URL` is the instance URL, including a deployment prefix if needed, **without `/api/v1`**. Queries, fragments and embedded URL credentials are refused. Configure the final URL directly; redirects are never followed with an API key. The integration ID restricts this one configured instance to one integration. Never place the key in browser code or paste it into an event payload.

Restart the API and worker. Use **Check connection** in Integrations or run:

```sh
pnpm n8n:check
# Optional per-resource check against IDs from a real failed execution:
pnpm n8n:check <integration-uuid> <execution-id> <workflow-id>
```

The first check calls `GET /api/v1/workflows?limit=1`. It proves only workflow-list access. Per-resource checks additionally call `GET /api/v1/executions/{id}?includeData=true` and `GET /api/v1/workflows/{id}`. They report availability without printing execution payloads or the API key. A readable workflow list does not prove access to every execution or any retry permission.

The client verifies resource identities, bounds response bytes while streaming, validates response shapes and redacts common secrets before returning evidence. Each read has a timeout. A failed workflow read does not discard readable execution evidence, and a missing execution ID does not discard workflow metadata. The agent receives explicit missing-context results.

## Diagnostic results

| Code                            | Meaning                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `CONNECTED`                     | Workflow-list read succeeded; live retry remains disabled                   |
| `NOT_CONFIGURED`                | The three server variables are incomplete or this integration is not linked |
| `INVALID_CONFIGURATION`         | The base URL contains unsupported credentials, query, fragment or protocol  |
| `ACCESS_DENIED`                 | API key or resource permissions were refused                                |
| `REDIRECT_REFUSED`              | Configure the final instance URL instead of a redirect                      |
| `TOO_LARGE`                     | Evidence exceeded the 2 MB byte limit; inspect that context in n8n          |
| `INVALID_RESPONSE`              | JSON, response shape or resource identity was invalid                       |
| `TIMEOUT` / `CONNECTION_FAILED` | The instance could not be read within the timeout                           |

Live recovery is still unavailable. All live incidents require manual recovery in n8n. HTTP contract tests use a labelled local test server and are not a substitute for the real-instance steps above.
