export const MAINNET_COST_LIMITS = {
  writeLength: 15_000_000,
  writeCount: 15_000,
  readLength: 100_000_000,
  readCount: 15_000,
  runtime: 5_000_000_000,
};

export function costLimitsUsed(cost: typeof MAINNET_COST_LIMITS) {
  return {
    writeLength: cost.writeLength / MAINNET_COST_LIMITS.writeLength,
    writeCount: cost.writeCount / MAINNET_COST_LIMITS.writeCount,
    readLength: cost.readLength / MAINNET_COST_LIMITS.readLength,
    readCount: cost.readCount / MAINNET_COST_LIMITS.readCount,
    runtime: cost.runtime / MAINNET_COST_LIMITS.runtime,
  };
}
