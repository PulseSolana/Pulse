import { z } from "zod";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  HELIUS_API_KEY: z.string().min(1),
  SOLANA_RPC_URL: z.string().url(),
  JUPITER_PRICE_API: z.string().url().default("https://api.jup.ag/price/v2"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-5-20251001"),
  SCAN_INTERVAL_MS: z.coerce.number().default(30_000),
  ALERT_THRESHOLD_USD: z.coerce.number().default(75_000),
  HIGH_ALERT_THRESHOLD_USD: z.coerce.number().default(500_000),
  CRITICAL_ALERT_THRESHOLD_USD: z.coerce.number().default(1_500_000),
  TRADE_IMBALANCE_WEIGHT: z.coerce.number().default(0.3),
  UNIQUE_BUYERS_ACCEL_WEIGHT: z.coerce.number().default(0.25),
  LIQUIDITY_DELTA_WEIGHT: z.coerce.number().default(0.2),
  WALLET_ENTROPY_WEIGHT: z.coerce.number().default(0.15),
  SLIPPAGE_PRESSURE_WEIGHT: z.coerce.number().default(0.1),
  BULLISH_PULSE_THRESHOLD: z.coerce.number().default(1.25),
  NEUTRAL_PULSE_THRESHOLD: z.coerce.number().default(0.6),
  MIN_TOPBOOK_DEPTH_USD: z.coerce.number().default(25_000),
  MAX_SLIPPAGE_PRESSURE_BPS: z.coerce.number().default(32),
  REENTRY_BASE_DELAY_MS: z.coerce.number().default(120_000),
  VOLATILITY_BASELINE_BPS: z.coerce.number().default(180),
  MAX_ALERTS_PER_CYCLE: z.coerce.number().default(20),
  REPORT_INTERVAL_MS: z.coerce.number().default(1_800_000),
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
