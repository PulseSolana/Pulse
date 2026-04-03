import { config } from "./src/lib/config.js";
import { createLogger } from "./src/lib/logger.js";
import { fetchRecentLargeTransactions, getAddressLabels } from "./src/watchers/helius.js";
import { deduplicateAlerts } from "./src/analysis/classifier.js";
import { interpretMovements } from "./src/agent/loop.js";
import { ingestAlerts, generateReport, getAlertStats } from "./src/alerts/reporter.js";

const logger = createLogger("pulse");
const seenSignatures = new Set<string>();
let lastReportAt = 0;

async function scan() {
  logger.info("─── Scan ──────────────────────────────────────────");

  const txs = await fetchRecentLargeTransactions(config.ALERT_THRESHOLD_USD);
  if (txs.length === 0) {
    logger.info("No large transactions found this cycle");
    return;
  }

  const walletAddresses = [...new Set(txs.map((t) => t.wallet))];
  const labels = await getAddressLabels(walletAddresses);

  logger.info(`Found ${txs.length} large transactions from ${walletAddresses.length} wallets`);

  const alerts = await interpretMovements(txs, labels);
  const fresh = deduplicateAlerts(alerts, seenSignatures);

  ingestAlerts(fresh);

  const stats = getAlertStats();
  logger.info(
    `Alerts 24h: ${stats.total24h} | critical: ${stats.critical} | bullish: ${stats.bullishSignals} | bearish: ${stats.bearishSignals}`,
  );

  if (Date.now() - lastReportAt > config.REPORT_INTERVAL_MS) {
    const report = generateReport();
    logger.info(`── Intel Report ──────────────────────────────────`);
    logger.info(`Signal: ${report.dominantSignal.toUpperCase()} | Watchlist: ${report.watchlist.join(", ")}`);
    lastReportAt = Date.now();
  }
}

async function main() {
  logger.info("Pulse starting...");
  logger.info(`Alert threshold: $${config.ALERT_THRESHOLD_USD.toLocaleString()} | Interval: ${config.SCAN_INTERVAL_MS / 1000}s`);

  await scan();
  setInterval(scan, config.SCAN_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
