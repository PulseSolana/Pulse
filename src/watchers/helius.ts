import { createLogger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import type { OnChainTransaction, MovementType, FlowMetrics } from "../lib/types.js";

const logger = createLogger("helius");

interface HeliusEnhancedTx {
  signature: string;
  timestamp: number;
  slot: number;
  type: string;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
  }>;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
}

function classifyType(heliusType: string): MovementType {
  const type = heliusType.toUpperCase();
  if (type.includes("SWAP")) return "swap";
  if (type.includes("STAKE")) return "stake";
  if (type.includes("UNSTAKE")) return "unstake";
  return "transfer";
}

function buildFlowMetrics(amountUsd: number, type: MovementType): FlowMetrics {
  const baseImbalance = Math.max(-1, Math.min(1, (amountUsd - config.ALERT_THRESHOLD_USD) / 450000));
  const directionalImbalance = type === "unstake" ? -baseImbalance : baseImbalance;

  return {
    tradeImbalance30s: Number(directionalImbalance.toFixed(3)),
    uniqueBuyersAccel2m: Number(Math.max(0, Math.min(1.8, amountUsd / 300000)).toFixed(3)),
    liquidityDelta1m: Number(Math.max(-1, Math.min(1, (config.ALERT_THRESHOLD_USD - amountUsd) / 350000)).toFixed(3)),
    walletEntropy5m: Number((type === "swap" ? 0.78 : type === "stake" ? 0.44 : 0.62).toFixed(3)),
    slippagePressure30s: Number(Math.max(4, Math.min(60, amountUsd / 25000)).toFixed(2)),
    topbookDepthUsd: Number(Math.max(config.MIN_TOPBOOK_DEPTH_USD, amountUsd * 0.55).toFixed(0)),
  };
}

export async function fetchRecentLargeTransactions(
  minUsd: number,
  solPriceUsd = 150,
  limit = 100,
): Promise<OnChainTransaction[]> {
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/transactions?api-key=${config.HELIUS_API_KEY}&limit=${limit}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: { types: ["TRANSFER", "SWAP", "STAKE_SOL", "UNSTAKE_SOL"] } }),
      },
    );

    if (!res.ok) throw new Error(`Helius API ${res.status}`);
    const txs: HeliusEnhancedTx[] = await res.json();
    const results: OnChainTransaction[] = [];

    for (const tx of txs) {
      const movementType = classifyType(tx.type);

      for (const transfer of tx.tokenTransfers) {
        const amountUsd = transfer.tokenAmount;
        if (amountUsd < minUsd) continue;

        results.push({
          signature: tx.signature,
          wallet: transfer.fromUserAccount,
          type: movementType,
          tokenMint: transfer.mint,
          tokenSymbol: transfer.mint.slice(0, 6),
          amountUsd,
          timestamp: tx.timestamp * 1000,
          slot: tx.slot,
          counterparty: transfer.toUserAccount,
          flowMetrics: buildFlowMetrics(amountUsd, movementType),
        });
      }

      for (const native of tx.nativeTransfers) {
        const amountUsd = (native.amount / 1e9) * solPriceUsd;
        if (amountUsd < minUsd) continue;

        results.push({
          signature: tx.signature,
          wallet: native.fromUserAccount,
          type: "transfer",
          tokenMint: "So11111111111111111111111111111111111111112",
          tokenSymbol: "SOL",
          amountUsd,
          timestamp: tx.timestamp * 1000,
          slot: tx.slot,
          counterparty: native.toUserAccount,
          flowMetrics: buildFlowMetrics(amountUsd, "transfer"),
        });
      }
    }

    return results;
  } catch (err) {
    logger.error("Failed to fetch transactions", err);
    return [];
  }
}

export async function getAddressLabels(addresses: string[]): Promise<Record<string, string>> {
  const knownLabels: Record<string, string> = {
    "5tzFkiKscfRcs488N1ynCeg6gRGFPFqEvHLBSf2jEVHi": "Binance Hot Wallet",
    ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ: "Alameda Research",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": "Jump Trading",
  };

  return Object.fromEntries(addresses.filter((address) => knownLabels[address]).map((address) => [address, knownLabels[address]]));
}
