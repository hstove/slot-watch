import { makeContractDeploy, broadcastTransaction } from '@stacks/transactions';

const tx = await makeContractDeploy({
  contractName: 'test-blah',
  codeBody: '(ok true)',
  senderKey:
    'b244296d5907de9864c0b0d51f98a13c52890be0404e83f273144cd5b9960eed01',
  network: 'testnet',
  fee: 1000,
});

const txId = await broadcastTransaction({
  transaction: tx,
  network: 'testnet',
});

console.log(txId);
