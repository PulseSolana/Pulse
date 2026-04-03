import { config } from "../lib/config.js";
import type { OnChainTransaction, AlertSeverity, WhaleAlert } from "../lib/types.js";
import { randomUUID } from "crypto";

export function classifySeverity(amountUsd: number): AlertSeverity {
  if (amountUsd >= config.CRITICAL_ALERT_THRESHOLD_USD) return "critical";
  if (amountUsd >= config.HIGH_ALERT_THRESHOLD_USD) return "high";
  if (amountUsd >= config.ALERT_THRESHOLD_USD) return "medium";
  return "low";
}

export function buildRawAlert(
  tx: OnChainTransaction,
  walletLabel?: string,
): WhaleAlert {
  return {
    id: randomUUID(),
    severity: classifySeverity(tx.amountUsd),
    type: tx.type,
    wallet: tx.wallet,
    walletLabel,
    tokenSymbol: tx.tokenSymbol,
    amountUsd: tx.amountUsd,
    interpretation: "",        // filled by agent
    actionSignal: "neutral",   // filled by agent
    confidence: 0,             // filled by agent
    timestamp: tx.timestamp,
    txSignature: tx.signature,
  };
}

export function deduplicateAlerts(
  alerts: WhaleAlert[],
  seen: Set<string>,
): WhaleAlert[] {
  return alerts.filter((a) => {
    if (seen.has(a.txSignature)) return false;
    seen.add(a.txSignature);
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
