import { hex } from '@scure/base';
import { p2pkh } from '@scure/btc-signer';
import { decodeChunkMaybe, SignerMessageTypePrefix } from './codec';
import {
  addressToString,
  createStacksPublicKey,
  addressFromPublicKeys,
  AddressVersion,
  AddressHashMode,
} from '@stacks/transactions';
import { isMainnet } from './networks';
import { ripemd160 } from '@noble/hashes/ripemd160';
// import { sha256 } from '@noble/hashes/sha256';
import { sha256 } from '@noble/hashes/sha2';

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/** Merge two types, adding undefined values for keys that are in the second type but not the first */
export type TypeMerge<T extends object, U extends object> = Prettify<
  T & {
    [K in Exclude<keyof U, keyof T>]?: undefined;
  }
>;

export function getVersionFromString(version: string) {
  // Handle `stacks-signer VERSION (...);`
  const match = version.match(/^stacks-signer ([^\s]*)/);
  if (match) {
    return match[1];
  }
  return '';
}

// Given a chunk in hex, return the version
export function versionFromData(data: string | null): string {
  if (!data) return '';
  const decoded = decodeChunkMaybe(hex.decode(data));
  if (!decoded) return '';
  if (decoded.typeId === SignerMessageTypePrefix.BlockResponse) {
    return decoded.metadata ?? '';
  }
  if (decoded.typeId === SignerMessageTypePrefix.MockSignature) {
    return decoded.metadata ?? '';
  }
  if (decoded.typeId === SignerMessageTypePrefix.MockSignatureOld) {
    return decoded.version ?? '';
  }
  return '';
}

export function percentString(value: number, precision = 10000) {
  const percent = value * precision;
  const percentString = Math.round(percent) / (precision / 100);
  return percentString.toString();
}

export function getStacksAddress(publicKey: string, networkKey: string) {
  const mainnet = isMainnet(networkKey);
  const publicKeys = [createStacksPublicKey(publicKey)];
  const address = addressFromPublicKeys(
    mainnet ? AddressVersion.MainnetSingleSig : AddressVersion.TestnetSingleSig,
    AddressHashMode.P2PKH,
    1,
    publicKeys,
  );
  return addressToString(address);
}

export function getBtcAddress(publicKey: string) {
  return p2pkh(hex.decode(publicKey)).address ?? '';
}

export function hash160(data: string | Uint8Array) {
  const bytes = typeof data === 'string' ? hex.decode(data) : data;
  return hex.encode(ripemd160(sha256(bytes)));
}
