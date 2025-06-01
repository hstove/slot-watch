import {
  AddressVersion,
  addressFromVersionHash,
  addressToString,
} from '@stacks/transactions';
import { hex } from '@scure/base';
import {
  chunkTypeName,
  knownSigners,
  recoverChunkPublicKey,
  type ChunkEventParsed,
  type StackerDBPayload,
} from 'slot-watch-common';
import { log, logger } from './logger';

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

type DbChunk = {
  id: string;
  slotId: number;
  version: number;
  signature: Uint8Array;
  data: Uint8Array;
  contractId: string;
  networkKey: string | null;
  publicKey: string | null;
};

export function serializeDbChunk(chunk: DbChunk): ChunkEventParsed {
  const publicKey = chunk.publicKey ?? recoverChunkPublicKey(chunk).toHex();
  const entity = knownSigners[publicKey] ?? null;
  const createdAt = getCreatedAt(chunk.id);
  return {
    ...chunk,
    signature: hex.encode(chunk.signature),
    data: hex.encode(chunk.data),
    createdAt: createdAt.toISOString(),
    type: chunkTypeName(chunk.data),
    publicKey,
    entity,
  };
}

export function getCreatedAt(uuid: string): Date {
  // Remove hyphens from the UUID string for easier processing
  const cleanUuid = uuid.replace(/-/g, '');

  // Basic validation: Check if the cleaned string has the correct length (32 hex chars)
  // and contains only hex characters.
  if (cleanUuid.length !== 32 || !/^[0-9a-f]+$/i.test(cleanUuid)) {
    log.withMetadata({ uuid }).error('Invalid UUID format');
    throw new Error('Invalid UUID format');
  }

  // Validate if it's likely a v7 UUID by checking the version nibble.
  // The version is the first digit of the third group of hex characters.
  // In the flattened string, this is the 13th character (index 12).
  const versionHex = cleanUuid[12];
  if (versionHex !== '7') {
    // While the first 48 bits can always be interpreted as a number,
    // the function is specifically for v7, so we validate the version.
    log
      .withMetadata({
        uuid,
        versionHex,
      })
      .warn('UUID does not appear to be v7, returning null.');
    throw new Error('Invalid UUID format');
  }

  // Extract the first 12 hex characters which represent the 48-bit timestamp
  const timestampHex = cleanUuid.substring(0, 12);

  // Convert the 12-character hex string to a decimal number.
  // A 48-bit integer fits safely within JavaScript's standard `number` type
  // (which uses 64-bit floating-point with 53 bits of integer precision).
  const timestampMs = Number.parseInt(timestampHex, 16);

  return new Date(timestampMs);
}
