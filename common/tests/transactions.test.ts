import { hex } from '@scure/base';
import { StacksTransactionCoder } from '../src';
import { test } from 'vitest';

test('stacks transaction', () => {
  const txHex =
    '808000000004009a1a24e8cb1c51415b01f7dce1896dd76327a5e4000000000000293f000000000000012c000190a3c5ac010dab9c6e0fd86301f8c16d5f0192b29dd91aa87fe8e2e08af9303c51e64015da24bb2f8296e44a8ca2b237c03b89a9059e48fab5e5d93d37af1d6f03020000000000051ae959844d85de7954970675332446df1c5a54419c00000000000003e800000000000000000000000000000000000000000000000000000000000000000000';
  const _tx = StacksTransactionCoder.decode(hex.decode(txHex));
  // console.log(tx);
});
