import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import type { OnChainTransaction, PulseAlert, FlowSourceProfile } from "../lib/types.js";
import { PULSE_SYSTEM } from "./prompts.js";
import { buildRawAlert } from "../analysis/classifier.js";

const logger = createLogger("agent");
const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const flowProfiles = new Map<string, FlowSourceProfile>();
const interpretedAlerts: PulseAlert[] = [];

const tools: Anthropic.Tool[] = [
  {
    name: "get_recent_movements",
    description: "Returns the list of pulse candidates detected this cycle with flow metrics",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_wallet_profile",
    description: "Returns known info about a source wallet or venue tag",
    input_schema: {
      type: "object" as const,
      properties: { address: { type: "string" } },
      required: ["address"],
    },
  },
  {
    name: "get_token_context",
    description: "Returns token context for short-horizon pulse validation",
    input_schema: {
      type: "object" as const,
      properties: { mint: { type: "string" } },
      required: ["mint"],
    },
  },
  {
    name: "submit_alert",
    description: "Submit a fully interpreted pulse alert",
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
): Promise<PulseAlert[]> {
  if (transactions.length === 0) return [];

  interpretedAlerts.length = 0;
  const rawAlerts = transactions.map((tx) => buildRawAlert(tx, labels[tx.wallet]));

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${transactions.length} Solana pulse candidates detected. Validate which ones represent actionable short-horizon order-flow and submit alerts with confidence >= 0.5.`,
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
          result = rawAlerts.map((alert) => {
            const tx = transactions.find((candidate) => candidate.signature === alert.txSignature);
            return {
              txSignature: alert.txSignature,
              wallet: alert.wallet,
              walletLabel: alert.walletLabel ?? "unknown",
              type: alert.type,
              token: alert.tokenSymbol,
              amountUsd: alert.amountUsd,
              severity: alert.severity,
              regime: alert.regime,
              pulseScore: alert.pulseScore,
              trailingPulseScore: alert.trailingPulseScore,
              topbookDepthUsd: tx?.flowMetrics.topbookDepthUsd,
              slippagePressureBps: tx?.flowMetrics.slippagePressure30s,
              timestamp: new Date(alert.timestamp).toISOString(),
            };
          });
          break;

        case "get_wallet_profile": {
          const input = block.input as { address: string };
          const profile = flowProfiles.get(input.address);
          result = profile ?? {
            address: input.address,
            label: labels[input.address] ?? "unknown",
            tags: [],
            note: "No prior venue profile captured in this session",
          };
          break;
        }

        case "get_token_context":
          result = {
            note: "Use pulse score, topbook depth, and slippage pressure as the primary signal context in this session.",
          };
          break;

        case "submit_alert": {
          const input = block.input as {
            txSignature: string;
            interpretation: string;
            actionSignal: "bullish" | "bearish" | "neutral";
            confidence: number;
          };
          const raw = rawAlerts.find((alert) => alert.txSignature === input.txSignature);
          if (raw && input.confidence >= 0.5) {
            const alert: PulseAlert = {
              ...raw,
              interpretation: input.interpretation,
              actionSignal: input.actionSignal,
              confidence: input.confidence,
            };
            interpretedAlerts.push(alert);
            logger.info(
              `[PULSE] ${alert.severity.toUpperCase()} | ${alert.tokenSymbol} $${alert.amountUsd.toLocaleString()} | pulse=${alert.pulseScore.toFixed(2)} | ${alert.actionSignal} | ${alert.interpretation}`,
            );
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
