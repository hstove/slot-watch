import { MAINNET_BURN_ADDRESS, TESTNET_BURN_ADDRESS } from "@clarigen/core";

export const networkName = process.env.STACKS_NETWORK || "testnet";

export const burnAddress =
	networkName === "mainnet" ? MAINNET_BURN_ADDRESS : TESTNET_BURN_ADDRESS;

export const networkKeyToMainnet: Record<string, boolean> = {
	testnet: false,
	"naka-testnet": false,
};

export function isMainnet(networkKey: string) {
	return networkKeyToMainnet[networkKey] ?? true;
}

export function getBurnAddress(networkKey: string) {
	return isMainnet(networkKey) ? MAINNET_BURN_ADDRESS : TESTNET_BURN_ADDRESS;
}
