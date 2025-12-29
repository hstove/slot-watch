import { test, expect } from 'vitest';
import * as BTC from '@scure/btc-signer';
import { hex } from '@scure/base';

test('convert-addr', () => {
  const addrRegtest = BTC.Address(BTC.TEST_NETWORK).decode(
    'tb1qxnzlc57krja4jzq6vq3fylll0rydxr2xjzv55p'
  );
  console.log(addrRegtest);
  if (addrRegtest?.type !== 'wpkh') {
    throw new Error('Not implemented');
  }
  const addr = BTC.Address().encode({
    type: 'wpkh',
    hash: addrRegtest.hash,
  });
  console.log(addr);
  const scriptKey = hex.decode('001434c5fc53d61cbb59081a6022927fff78c8d30d46');
  const addrFromScriptKey = BTC.OutScript.decode(scriptKey);
  console.log(addrFromScriptKey);
  console.log(BTC.Address(BTC.TEST_NETWORK).encode(addrFromScriptKey));
});
