import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { description?: string; homepage?: string; keywords?: string[] };

describe("Solana launch presentation", () => {
  it("restores Pulse's native Solana product and Pump.fun launch positioning", () => {
    expect(readme).toContain("order-flow pulse engine for Solana");
    expect(readme).toContain("[Website](https://pulseflowx.com/)");
    expect(readme).toContain("Solana token launching through [Pump.fun]");
    expect(readme).toContain("https://github.com/PulseRobinhood/Pulse");
    expect(packageJson.description).toContain("Solana order-flow pulse engine");
    expect(packageJson.homepage).toBe("https://pulseflowx.com/");
    expect(packageJson.keywords).toContain("solana");
    expect(packageJson.keywords).not.toContain("robinhood");
    expect(readme).not.toMatch(/\bRobinhood\b|pons\.family|vercel\.app/i);
  });
});
