import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import type { OnChainTransaction, WhaleAlert, WalletProfile } from "../lib/types.js";
import { PULSE_SYSTEM } from "./prompts.js";
import { buildRawAlert } from "../analysis/classifier.js";

const logger = createLogger("agent");
const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const walletProfiles = new Map<string, WalletProfile>();
const interpretedAlerts: WhaleAlert[] = [];

const tools: Anthropic.Tool[] = [
  {
    name: "get_recent_movements",
    description: "Returns the list of large on-chain movements detected this cycle",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_wallet_profile",
    description: "Returns known info about a wallet address — label, tags, historical behavior",
    input_schema: {
      type: "object" as const,
      properties: { address: { type: "string" } },
      required: ["address"],
    },
  },
  {
    name: "get_token_context",
    description: "Returns basic context for a token — symbol, market cap, recent price action",
    input_schema: {
      type: "object" as const,
      properties: { mint: { type: "string" } },
      required: ["mint"],
    },
  },
  {
    name: "submit_alert",
    description: "Submit a fully interpreted whale alert",
    input_schema: {
      type: "object" as const,
      properties: {
        txSignature: { type: "string" },
        interpretation: { type: "string" },
        actionSignal: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        confidence: { type: "number" },
      },
      required: ["txSignature", "interpretation", "actionSignal", "confidence"],
    },
  },
];

export async function interpretMovements(
  transactions: OnChainTransaction[],
  labels: Record<string, string>,
): Promise<WhaleAlert[]> {
  if (transactions.length === 0) return [];

  interpretedAlerts.length = 0;
  const rawAlerts = transactions.map((tx) => buildRawAlert(tx, labels[tx.wallet]));

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${transactions.length} large on-chain movements detected. Analyze each one and submit interpreted alerts for movements with confidence >= 0.5. Skip noise.`,
    },
  ];

  for (let i = 0; i < 12; i++) {
    const response = await client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 2048,
      system: PULSE_SYSTEM,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      let result: unknown;

      switch (block.name) {
        case "get_recent_movements":
          result = rawAlerts.map((a) => ({
            txSignature: a.txSignature,
            wallet: a.wallet,
            walletLabel: a.walletLabel ?? "unknown",
            type: a.type,
            token: a.tokenSymbol,
            amountUsd: a.amountUsd,
            severity: a.severity,
            timestamp: new Date(a.timestamp).toISOString(),
          }));
          break;

        case "get_wallet_profile": {
          const input = block.input as { address: string };
          const profile = walletProfiles.get(input.address);
          result = profile ?? {
            address: input.address,
            label: labels[input.address] ?? "unknown",
            tags: [],
            note: "No historical profile — first time seen or unlabeled wallet",
          };
          break;
        }

        case "get_token_context": {
          result = { note: "Token price context not available in current session — reason based on movement patterns" };
          break;
        }

        case "submit_alert": {
          const input = block.input as { txSignature: string; interpretation: string; actionSignal: "bullish" | "bearish" | "neutral"; confidence: number };
          const raw = rawAlerts.find((a) => a.txSignature === input.txSignature);
          if (raw && input.confidence >= 0.5) {
            const alert: WhaleAlert = {
              ...raw,
              interpretation: input.interpretation,
              actionSignal: input.actionSignal,
              confidence: input.confidence,
            };
            interpretedAlerts.push(alert);
            logger.info(`[ALERT] ${alert.severity.toUpperCase()} | ${alert.tokenSymbol} $${alert.amountUsd.toLocaleString()} | ${alert.actionSignal} | ${alert.interpretation}`);
          }
          result = { accepted: true };
          break;
        }

        default:
          result = { error: "unknown tool" };
      }

      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return [...interpretedAlerts];
}
