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
import BigNumber from 'bignumber.js';

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/** Merge two types, adding undefined values for keys that are in the second type but not the first */
export type TypeMerge<T extends object, U extends object> = Prettify<
  T & {
    [K in Exclude<keyof U, keyof T>]?: undefined;
  }
>;

export type Version = [number, number, number, number, number, number];

export function getVersionFromString(version: string) {
  // Handle `stacks-signer VERSION (...);`
  const match = version.match(/^stacks-[\w]+ ([^\s]*)/);
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

function getVersionPart(version: string | undefined): number {
  if (typeof version === 'undefined') return 0;
  const n = Number.parseInt(version);
  if (Number.isNaN(n)) return 0;
  return n;
}

export function getSortableVersion(version: string): Version {
  const [a, b, c, d, e, f] = version.split('.');
  return [
    getVersionPart(a),
    getVersionPart(b),
    getVersionPart(c),
    getVersionPart(d),
    getVersionPart(e),
    getVersionPart(f),
  ];
}

export function versionSort(a: Version, b: Version) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] - b[2];
  if (a[3] !== b[3]) return a[3] - b[3];
  if (a[4] !== b[4]) return a[4] - b[4];
  return a[5] - b[5];
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

export type IntegerType = number | string | bigint;

export function intToBn(value: IntegerType) {
  if (typeof value === 'bigint') {
    return BigNumber(value.toString());
  }
  return BigNumber(value);
}

export function microStxToStx(microStx: IntegerType) {
  const bn = intToBn(microStx);
  return bn.decimalPlaces(6).shiftedBy(-6);
}

export function stxToMicroStx(stx: IntegerType) {
  const bn = intToBn(stx);
  return bn.decimalPlaces(6).shiftedBy(6).decimalPlaces(0);
}

export function prefix0x(value: string) {
  return value.startsWith('0x') ? value : `0x${value}`;
}
