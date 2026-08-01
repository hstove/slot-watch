import { expect, test } from 'bun:test';
import { hex } from '@scure/base';
import {
  decodeChunk,
  makeSignerSignatureHash,
  SignerMessageTypePrefix,
} from '../src/codec';
import {
  epoch4BlockProposalHex,
  epoch4BlockProposalSignerSignatureHash,
} from './fixtures/epoch4-block-proposal';

test('decodes an epoch 4 block proposal with the problematic transaction marker list', () => {
  const proposal = decodeChunk(hex.decode(epoch4BlockProposalHex));

  expect(proposal.typeId).toBe(SignerMessageTypePrefix.BlockProposal);
  if (proposal.typeId !== SignerMessageTypePrefix.BlockProposal) {
    throw new Error('Expected a block proposal');
  }

  expect(proposal.blockVersion).toBe(1);
  expect(proposal.blockHeight).toBe(960236n);
  expect(proposal.rewardCycle).toBe(140n);
  expect(proposal.serverVersion).toBe('stacks-node 4.0.1');
  expect(proposal.problematicTxs).toEqual([]);
  expect(proposal.txCount).toBe(0);
  expect(hex.encode(makeSignerSignatureHash(proposal))).toBe(
    epoch4BlockProposalSignerSignatureHash
  );
});
