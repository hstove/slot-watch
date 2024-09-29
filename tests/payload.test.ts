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
import {
	decodeChunk,
	type BlockResponseAccepted,
	type NakamotoBlock,
} from "../src/codec";
import { makeSignerSignatureHash } from "../src/hashes";

test("parse-fixtures", () => {
	const payload = fixtureToJson(fixtures.signers1);
	// console.log(payload);
	// console.log(payload.contract_id);
	const version =
		payload.contract_id.issuer[0] === 26
			? AddressVersion.TestnetSingleSig
			: AddressVersion.MainnetSingleSig;
	const address = addressFromVersionHash(
		version,
		hex.encode(new Uint8Array(payload.contract_id.issuer[1])),
	);
	// console.log(addressToString(address));
	// console.log(getPayloadContractId(payload));
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
		// console.log(decoded);
	}
});

test("miners payload", () => {
	const payload = fixtureToJson(fixtures.miners1);
	for (const slot of payload.modified_slots) {
		const data = hex.decode(slot.data);
		const decoded = decodeChunk(data);
		// console.log(decoded);
		// console.log(makeSignerSignatureHash(decoded as NakamotoBlock));
	}
	const signersResponse = fixtureToJson(fixtures.signers1);
	for (const slot of signersResponse.modified_slots) {
		const data = hex.decode(slot.data);
		const decoded = decodeChunk(data);
		// console.log(decoded);
		// console.log((decoded as BlockResponseAccepted).signerSignatureHash);
	}
});

test("block proposal fixture", async () => {
	const messageHex =
		"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000010000000000afbcfa26acafaa29a3e73ecee6bb07c8";
	const message = decodeChunk(hex.decode(messageHex));
	const signerSignatureHash = await makeSignerSignatureHash(
		message as NakamotoBlock,
	);
	expect(hex.encode(signerSignatureHash)).toEqual(
		"ced4ed4e61eef9b2859ae1053bc5df414e7b3a901c927107ea7c66d1a81a7f28",
	);
});

test("decoding", () => {
	const chunkData =
		"01008058e991f5255b43078efd1d5ab4c05fbbd6520e37fc6b4feb51870602bb24c50172238b998b6467c0dfc28ee48319526f98ee1fd6077ad9b53a64d116525ccdc919132fdcb9d43777504ad807e4d16514a942b3a0cf6b66551350a8d030169be6";
	const decoded = decodeChunk(hex.decode(chunkData));
	// console.log(decoded);
});

test("signature hashing", async () => {
	const proposalHex =
		"0000000000000001247700000001d6841e30f2142481aae594961e8320efe6b8ec428b7e066f76d2b170a3fd900782f7eee04f06e76991971aa7f186bdcefa1ece5f3fec44c4a7e413dfb97ff858472e4a1f86caa283437bf9f2ba6d8a7a7a6346923f31851ed9c350144609c2781a539dff68e4ebb60c4277d3026ee65500fcb83f6ad7551b0000000066f9c1980118c4760cbc18e8c5454af95a06c5f93de28fa48e8c265c70713b0fa3e320150741ab0018c23f1e10aadc3f3f74c0ec28d1f378fb379960cfab6e7a624c8d7a8e00000000063d000000c8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1f0000000180800000000400e959844d85de7954970675332446df1c5a54419c0000000000000900000000000000012c0001b7d22aae49bc34b0dd8f747ccd26a5befac5f4f2f5b9fa45c4504a89fa18946271419a03dae49d73ed4aac7beccb05850a89c4ae16027e02df6a20b55559418503020000000000051a08825323da99657d20e45820f6e7d1baaab3632000000000000003e8000000000000000000000000000000000000000000000000000000000000000000000000000000011eb30000000000000051";
	const proposal = decodeChunk(hex.decode(proposalHex));
	const responseHex =
		"010011717149677c2ac97d15ae5954f7a716f10100b9cb81a2bf27551b2f2e54ef19001c694f8134c5c90f2f2bcd330e9f423204884f001b5df0050f36a2c4ff79dd93522bb2ae395ea87de4964886447507c18374b7a46ee2e371e9bf332f0706a3e8";
	const response = decodeChunk(hex.decode(responseHex));
	const proposalHash = await makeSignerSignatureHash(proposal as NakamotoBlock);
	console.log(hex.encode(proposalHash));
	console.log(
		hex.encode((response as BlockResponseAccepted).signerSignatureHash),
	);
	expect(hex.encode(proposalHash)).toEqual(
		hex.encode((response as BlockResponseAccepted).signerSignatureHash),
	);
});
