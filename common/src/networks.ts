import { MAINNET_BURN_ADDRESS, TESTNET_BURN_ADDRESS } from "@clarigen/core";

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

export function getApiUrl(networkKey: string) {
	switch (networkKey) {
		case "testnet":
			return "https://api.testnet.hiro.so";
		case "naka-testnet":
			return "https://api.nakamoto.testnet.hiro.so";
		default:
			return "https://api.hiro.so";
	}
}
