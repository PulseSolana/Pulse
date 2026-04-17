import { config } from "./src/lib/config.js";
import { createLogger } from "./src/lib/logger.js";
import { fetchRecentLargeTransactions, getAddressLabels } from "./src/watchers/helius.js";
import { deduplicateAlerts } from "./src/analysis/classifier.js";
import { interpretMovements } from "./src/agent/loop.js";
import { generateReport, getAlertStats, ingestAlerts } from "./src/alerts/reporter.js";

const logger = createLogger("pulse");
const seenSignatures = new Set<string>();
let lastReportAt = 0;

async function scan() {
  const startedAt = Date.now();
  logger.info("---------------- Pulse Scan ----------------");

  try {
    const txs = await fetchRecentLargeTransactions(config.ALERT_THRESHOLD_USD);
    if (txs.length === 0) {
      logger.info("No pulse candidates found this cycle");
      return;
    }

    const walletAddresses = [...new Set(txs.map((tx) => tx.wallet))];
    const labels = await getAddressLabels(walletAddresses);

    logger.info(
      `Found ${txs.length} pulse candidates from ${walletAddresses.length} flow sources in the latest burst window`,
    );

    const alerts = await interpretMovements(txs, labels);
    const fresh = deduplicateAlerts(alerts, seenSignatures);
    ingestAlerts(fresh);

    const stats = getAlertStats();
    logger.info(
      `Alerts 24h: ${stats.total24h} | critical: ${stats.critical} | bullish: ${stats.bullishSignals} | bearish: ${stats.bearishSignals} | avg pulse: ${stats.avgPulse}`,
    );

    if (Date.now() - lastReportAt > config.REPORT_INTERVAL_MS) {
      try {
        const report = generateReport();
        logger.info("---------------- Pulse Report --------------");
        logger.info(
          `Regime: ${report.dominantRegime.toUpperCase()} | Signal: ${report.dominantSignal.toUpperCase()} | Watchlist: ${report.watchlist.join(", ")}`,
        );
        lastReportAt = Date.now();
      } catch (err) {
        logger.error("Pulse report generation failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    const durationMs = Date.now() - startedAt;
    logger.info("Pulse scan complete", { durationMs });

    if (durationMs > config.SCAN_INTERVAL_MS) {
      logger.warn("Pulse scan exceeded configured interval", {
        durationMs,
        intervalMs: config.SCAN_INTERVAL_MS,
      });
    }
  }
}

async function main() {
  logger.info("Pulse starting...");
  logger.info(
    `Threshold: $${config.ALERT_THRESHOLD_USD.toLocaleString()} | Interval: ${config.SCAN_INTERVAL_MS / 1000}s | bullish pulse >= ${config.BULLISH_PULSE_THRESHOLD}`,
  );

  let scanInFlight = false;
  let skippedScans = 0;

  const tick = async () => {
    if (scanInFlight) {
      skippedScans++;
      logger.warn("Skipping pulse scan because the previous scan is still running", {
        skippedScans,
      });
      return;
    }

    scanInFlight = true;
    try {
      await scan();
    } catch (err) {
      logger.error("Pulse scan failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      scanInFlight = false;
    }
  };

  await tick();
  setInterval(() => {
    void tick();
  }, config.SCAN_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
