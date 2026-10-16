import { z } from "zod";
export const config = z
  .object({
    DATABASE_URL: z.string().url(),
    OPERATOR_TOKEN: z.string().min(32),
    PORT: z.coerce.number().default(4000),
    TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
    TEMPORAL_NAMESPACE: z.string().default("default"),
    TEMPORAL_TASK_QUEUE: z.string().default("flowmedic-investigations"),
    MODEL_BASE_URL: z.string().url().default("http://localhost:11434/v1"),
    MODEL_ID: z.string().default("gemma3:4b"),
    MODEL_API_KEY: z.string().default("ollama"),
    APP_ORIGIN: z.string().url().default("http://localhost:3000"),
    N8N_BASE_URL: z.string().url().optional(),
    N8N_API_KEY: z.string().optional(),
    N8N_INTEGRATION_ID: z.uuid().optional(),
  })
  .parse(process.env);
