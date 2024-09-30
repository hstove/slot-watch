import { MAINNET_BURN_ADDRESS, TESTNET_BURN_ADDRESS } from "@clarigen/core";

export const networkName = process.env.STACKS_NETWORK || "testnet";

export const burnAddress =
	networkName === "mainnet" ? MAINNET_BURN_ADDRESS : TESTNET_BURN_ADDRESS;
