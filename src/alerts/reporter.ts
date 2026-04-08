import { createLogger } from "../lib/logger.js";
import type { PulseAlert, PulseReport } from "../lib/types.js";

const logger = createLogger("reporter");
const allAlerts: PulseAlert[] = [];

export function ingestAlerts(alerts: PulseAlert[]) {
  allAlerts.push(...alerts);
  const cutoff = Date.now() - 24 * 3600 * 1000;
  while (allAlerts.length > 0 && allAlerts[0].timestamp < cutoff) {
    allAlerts.shift();
  }
}

export function generateReport(): PulseReport {
  const recent = allAlerts.slice(-50);
  const bullish = recent.filter((alert) => alert.actionSignal === "bullish").length;
  const bearish = recent.filter((alert) => alert.actionSignal === "bearish").length;
  const avgPulse = recent.length > 0 ? recent.reduce((sum, alert) => sum + alert.pulseScore, 0) / recent.length : 0;
  const dominantRegime = avgPulse >= 0.8 ? "bullish" : avgPulse < 0 ? "cooldown" : "neutral";

  let dominantSignal: PulseReport["dominantSignal"] = "neutral";
  if (bullish > bearish * 1.5) dominantSignal = "bullish";
  else if (bearish > bullish * 1.5) dominantSignal = "bearish";
  else if (bullish > 0 && bearish > 0) dominantSignal = "mixed";

  const keyMovements = recent
    .filter((alert) => alert.severity === "critical" || alert.severity === "high")
    .sort((a, b) => b.pulseScore - a.pulseScore || b.amountUsd - a.amountUsd)
    .slice(0, 5);

  const tokenCounts = new Map<string, number>();
  for (const alert of recent) {
    tokenCounts.set(alert.tokenSymbol, (tokenCounts.get(alert.tokenSymbol) ?? 0) + 1);
  }

  const watchlist = [...tokenCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symbol]) => symbol);

  const report: PulseReport = {
    generatedAt: Date.now(),
    alertsAnalyzed: recent.length,
    dominantRegime,
    dominantSignal,
    keyMovements,
    summary: `${recent.length} pulse candidates analyzed. avg pulse ${avgPulse.toFixed(2)} | ${bullish} bullish / ${bearish} bearish | regime ${dominantRegime.toUpperCase()}.`,
    watchlist,
  };

  logger.info(`Pulse report: ${report.summary}`);
  return report;
}

export function getAlertStats() {
  return {
    total24h: allAlerts.length,
    critical: allAlerts.filter((alert) => alert.severity === "critical").length,
    high: allAlerts.filter((alert) => alert.severity === "high").length,
    bullishSignals: allAlerts.filter((alert) => alert.actionSignal === "bullish").length,
    bearishSignals: allAlerts.filter((alert) => alert.actionSignal === "bearish").length,
    avgPulse: allAlerts.length > 0 ? Number((allAlerts.reduce((sum, alert) => sum + alert.pulseScore, 0) / allAlerts.length).toFixed(2)) : 0,
  };
}
