import {
	AddressVersion,
	addressFromVersionHash,
	addressToString,
} from "@stacks/transactions";
import { hex } from "@scure/base";

export type StackerDBPayload = {
	contract_id: {
		issuer: [number, Uint8Array];
		name: string;
	};
	modified_slots: {
		data: string;
		sig: string;
		slot_id: number;
		slot_version: number;
	}[];
};

export function getPayloadContractId(payload: StackerDBPayload) {
	const version =
		payload.contract_id.issuer[0] === 26
			? AddressVersion.TestnetSingleSig
			: AddressVersion.MainnetSingleSig;
	const address = addressFromVersionHash(
		version,
		hex.encode(new Uint8Array(payload.contract_id.issuer[1])),
	);
	return `${addressToString(address)}.${payload.contract_id.name}`;
}
