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

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

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

export function percentString(value: number) {
  const percent = value * 10000;
  const percentString = Math.round(percent) / 100;
  return percentString.toString();
}

export function getStacksAddress(publicKey: string, networkKey: string) {
  const mainnet = isMainnet(networkKey);
  const publicKeys = [createStacksPublicKey(publicKey)];
  const address = addressFromPublicKeys(
    mainnet ? AddressVersion.MainnetSingleSig : AddressVersion.TestnetSingleSig,
    AddressHashMode.SerializeP2PKH,
    1,
    publicKeys,
  );
  return addressToString(address);
}

export function getBtcAddress(publicKey: string) {
  return p2pkh(hex.decode(publicKey)).address ?? '';
}
