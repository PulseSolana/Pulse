import { createLogger } from "../lib/logger.js";
import type { WhaleAlert, MarketIntelReport } from "../lib/types.js";

const logger = createLogger("reporter");
const allAlerts: WhaleAlert[] = [];

export function ingestAlerts(alerts: WhaleAlert[]) {
  allAlerts.push(...alerts);
  // Keep rolling 24h window
  const cutoff = Date.now() - 24 * 3600 * 1000;
  while (allAlerts.length > 0 && allAlerts[0].timestamp < cutoff) {
    allAlerts.shift();
  }
}

export function generateReport(): MarketIntelReport {
  const recent = allAlerts.slice(-50);
  const bullish = recent.filter((a) => a.actionSignal === "bullish").length;
  const bearish = recent.filter((a) => a.actionSignal === "bearish").length;

  let dominantSignal: MarketIntelReport["dominantSignal"] = "neutral";
  if (bullish > bearish * 1.5) dominantSignal = "bullish";
  else if (bearish > bullish * 1.5) dominantSignal = "bearish";
  else if (bullish > 0 && bearish > 0) dominantSignal = "mixed";

  const keyMovements = recent
    .filter((a) => a.severity === "critical" || a.severity === "high")
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, 5);

  const tokenCounts = new Map<string, number>();
  for (const a of recent) {
    tokenCounts.set(a.tokenSymbol, (tokenCounts.get(a.tokenSymbol) ?? 0) + 1);
  }
  const watchlist = [...tokenCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sym]) => sym);

  const report: MarketIntelReport = {
    generatedAt: Date.now(),
    alertsAnalyzed: recent.length,
    dominantSignal,
    keyMovements,
    summary: `${recent.length} movements analyzed. ${bullish} bullish / ${bearish} bearish signals. Dominant: ${dominantSignal.toUpperCase()}.`,
    watchlist,
  };

  logger.info(`Intel report: ${report.summary}`);
  return report;
}

export function getAlertStats() {
  return {
    total24h: allAlerts.length,
    critical: allAlerts.filter((a) => a.severity === "critical").length,
    high: allAlerts.filter((a) => a.severity === "high").length,
    bullishSignals: allAlerts.filter((a) => a.actionSignal === "bullish").length,
    bearishSignals: allAlerts.filter((a) => a.actionSignal === "bearish").length,
  };
}
