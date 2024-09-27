import { test, expect } from "vitest";
import * as fixtures from "./fixtures";
import { fixtureToJson } from "./parse-fixtures";
import {
	addressFromHashMode,
	addressFromVersionHash,
	addressToString,
	AddressVersion,
} from "@stacks/transactions";
import { hex } from "@scure/base";
import { getPayloadContractId } from "../src/payload";
import { decodeChunk } from "../src/codec";

test("parse-fixtures", () => {
	const payload = fixtureToJson(fixtures.signers1);
	console.log(payload);
	console.log(payload.contract_id);
	const version =
		payload.contract_id.issuer[0] === 26
			? AddressVersion.TestnetSingleSig
			: AddressVersion.MainnetSingleSig;
	const address = addressFromVersionHash(
		version,
		hex.encode(new Uint8Array(payload.contract_id.issuer[1])),
	);
	console.log(addressToString(address));
	console.log(getPayloadContractId(payload));
	expect(getPayloadContractId(payload)).toEqual(
		"ST000000000000000000002AMW42H.signers-1-1",
	);
});

test("decode block response payload", () => {
	const payload = fixtureToJson(fixtures.signers1);
	for (const slot of payload.modified_slots) {
		const data = hex.decode(slot.data);
		const decoded = decodeChunk(data);
		// console.log(decoded);
	}
});

test("get rejection payload", () => {
	const payload = fixtureToJson(fixtures.signersReject);
	for (const slot of payload.modified_slots) {
		const data = hex.decode(slot.data);
		const decoded = decodeChunk(data);
		console.log(decoded);
	}
});
