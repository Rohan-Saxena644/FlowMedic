import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
  sleep,
} from "@temporalio/workflow";
import type * as activities from "./activities.js";
export const decisionSignal = defineSignal<[]>("decision");
const a = proxyActivities<typeof activities>({
  startToCloseTimeout: "6 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "5 seconds",
    maximumInterval: "30 seconds",
  },
});
const recovery = proxyActivities<
  Pick<typeof activities, "executeApprovedRecovery">
>({ startToCloseTimeout: "30 seconds", retry: { maximumAttempts: 1 } });
export async function investigationWorkflow(id: string) {
  let notified = false;
  setHandler(decisionSignal, () => {
    notified = true;
  });
  try {
    await a.loadIncidentContext(id);
    await a.classifyIncident(id);
    await a.runAIAgentInvestigation(id);
    const proposal = await a.prepareRecoveryProposal(id);
    await condition(() => notified);
    const decision = await a.readDecision(id);
    if (decision === "approve") {
      await sleep(proposal.delaySeconds * 1000);
      await recovery.executeApprovedRecovery(id);
    } else await a.recordDecision(id, decision);
  } catch (error) {
    await a.recordFailure(id);
    throw error;
  }
}
