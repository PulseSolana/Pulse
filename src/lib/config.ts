import { z } from "zod";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  HELIUS_API_KEY: z.string().min(1),
  SOLANA_RPC_URL: z.string().url(),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-5-20251001"),
  SCAN_INTERVAL_MS: z.coerce.number().default(60000),       // 1 min
  ALERT_THRESHOLD_USD: z.coerce.number().default(100000),   // $100k minimum
  HIGH_ALERT_THRESHOLD_USD: z.coerce.number().default(1000000), // $1M = high severity
  CRITICAL_ALERT_THRESHOLD_USD: z.coerce.number().default(5000000), // $5M = critical
  WALLETS_TO_WATCH: z.string().default(""),                 // comma-separated, empty = detect automatically
  MAX_ALERTS_PER_CYCLE: z.coerce.number().default(20),
  REPORT_INTERVAL_MS: z.coerce.number().default(3600000),   // hourly intel report
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid config: ${missing}`);
  }
  return result.data;
}

export const config = loadConfig();
