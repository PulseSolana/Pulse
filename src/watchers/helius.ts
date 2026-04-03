import { createLogger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import type { OnChainTransaction, MovementType } from "../lib/types.js";

const logger = createLogger("helius");

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`;

interface HeliusEnhancedTx {
  signature: string;
  timestamp: number;
  slot: number;
  feePayer: string;
  type: string;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
    tokenStandard: string;
  }>;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  accountData: Array<{ account: string; nativeBalanceChange: number }>;
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
      for (const transfer of tx.tokenTransfers) {
        const amountUsd = transfer.tokenAmount; // approximate — real impl fetches price
        if (amountUsd < minUsd) continue;

        results.push({
          signature: tx.signature,
          wallet: transfer.fromUserAccount,
          type: classifyType(tx.type),
          tokenMint: transfer.mint,
          tokenSymbol: transfer.mint.slice(0, 6), // enriched separately
          amountUsd,
          timestamp: tx.timestamp * 1000,
          slot: tx.slot,
          counterparty: transfer.toUserAccount,
        });
      }

      // Native SOL transfers
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
        });
      }
    }

    return results;
  } catch (err) {
    logger.error("Failed to fetch transactions", err);
    return [];
  }
}

function classifyType(heliusType: string): MovementType {
  const t = heliusType.toUpperCase();
  if (t.includes("SWAP")) return "swap";
  if (t.includes("STAKE")) return "stake";
  if (t.includes("UNSTAKE")) return "unstake";
  return "transfer";
}

export async function getAddressLabels(addresses: string[]): Promise<Record<string, string>> {
  // Known labels — in production, cross-reference against labeling APIs
  const knownLabels: Record<string, string> = {
    "5tzFkiKscfRcs488N1ynCeg6gRGFPFqEvHLBSf2jEVHi": "Binance Hot Wallet",
    "ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ": "Alameda Research",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": "Jump Trading",
  };

  return Object.fromEntries(
    addresses
      .filter((a) => knownLabels[a])
      .map((a) => [a, knownLabels[a]]),
  );
}
