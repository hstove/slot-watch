import * as P from 'micro-packed';

export const StacksTransactionCoder = P.struct({
  version: P.U8,
  chainId: P.U32BE,
  auth: P.mappedTag(P.U8, {
    standard: [4, P.struct({})],
    sponsored: [5, P.struct({})],
  }),
  rest: P.bytes(null),
});
