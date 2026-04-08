import { config } from "../lib/config.js";
import type { OnChainTransaction, AlertSeverity, PulseAlert, PulseRegime, FlowMetrics } from "../lib/types.js";
import { randomUUID } from "crypto";

function normalize(value: number, scale: number): number {
  return Math.max(-2, Math.min(2, value / scale));
}

export function calculatePulseScore(metrics: FlowMetrics): number {
  const score =
    normalize(metrics.tradeImbalance30s, 0.45) * config.TRADE_IMBALANCE_WEIGHT +
    normalize(metrics.uniqueBuyersAccel2m, 0.35) * config.UNIQUE_BUYERS_ACCEL_WEIGHT +
    normalize(metrics.liquidityDelta1m, 0.4) * config.LIQUIDITY_DELTA_WEIGHT +
    normalize(metrics.walletEntropy5m - 0.5, 0.25) * config.WALLET_ENTROPY_WEIGHT -
    normalize(metrics.slippagePressure30s, config.MAX_SLIPPAGE_PRESSURE_BPS) * config.SLIPPAGE_PRESSURE_WEIGHT;

  return Number(score.toFixed(3));
}

export function detectRegime(
  pulseScore: number,
  trailingPulseScore: number,
  previousRegime: PulseRegime = "neutral",
): PulseRegime {
  if (pulseScore >= config.BULLISH_PULSE_THRESHOLD && trailingPulseScore >= 0.4) {
    return "bullish";
  }

  if (previousRegime === "bullish" && pulseScore >= config.NEUTRAL_PULSE_THRESHOLD) {
    return "bullish";
  }

  if (pulseScore < 0 || trailingPulseScore < 0) {
    return "cooldown";
  }

  return "neutral";
}

export function classifySeverity(amountUsd: number, pulseScore = 0): AlertSeverity {
  if (amountUsd >= config.CRITICAL_ALERT_THRESHOLD_USD) return "critical";
  if (amountUsd >= config.HIGH_ALERT_THRESHOLD_USD || pulseScore >= 1.35) return "high";
  if (amountUsd >= config.ALERT_THRESHOLD_USD) return "medium";
  return "low";
}

export function buildRawAlert(
  tx: OnChainTransaction,
  walletLabel?: string,
  previousRegime: PulseRegime = "neutral",
): PulseAlert {
  const pulseScore = calculatePulseScore(tx.flowMetrics);
  const trailingPulseScore = Number(
    (tx.flowMetrics.tradeImbalance30s * 0.65 + tx.flowMetrics.uniqueBuyersAccel2m * 0.35).toFixed(3),
  );

  return {
    id: randomUUID(),
    severity: classifySeverity(tx.amountUsd, pulseScore),
    regime: detectRegime(pulseScore, trailingPulseScore, previousRegime),
    type: tx.type,
    wallet: tx.wallet,
    walletLabel,
    tokenSymbol: tx.tokenSymbol,
    amountUsd: tx.amountUsd,
    pulseScore,
    trailingPulseScore,
    interpretation: "",
    actionSignal: "neutral",
    confidence: 0,
    timestamp: tx.timestamp,
    txSignature: tx.signature,
  };
}

export function deduplicateAlerts(
  alerts: PulseAlert[],
  seen: Set<string>,
): PulseAlert[] {
  return alerts.filter((alert) => {
    if (seen.has(alert.txSignature)) return false;
    seen.add(alert.txSignature);
    return true;
  });
}

export function groupByWallet(txs: OnChainTransaction[]): Map<string, OnChainTransaction[]> {
  const map = new Map<string, OnChainTransaction[]>();
  for (const tx of txs) {
    const existing = map.get(tx.wallet) ?? [];
    existing.push(tx);
    map.set(tx.wallet, existing);
  }
  return map;
}
