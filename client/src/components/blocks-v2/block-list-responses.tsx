import React from 'react';
import { useAtomValue } from 'jotai';
import {
  responseForBlockFamily,
  responsesForBlockAtomFamily,
} from '@/store/blocks-store';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PublicKey } from '@/components/public-key';
import { DataLabel, DataValue } from '@/components/data-group';
import { Text } from '@/components/text';
import {
  signersApiAtom,
  signersAtomFamily,
  totalWeightAtom,
} from '@/store/signers-store';
import { statusStyles } from '@/lib/status-variants';
import { Countdown } from '../countdown';
import { loadable } from 'jotai/utils';
import { useSpring, animated, config } from '@react-spring/web';
import { useEntity } from '@/hooks/use-entity';

export const BlockListResponse = ({
  blockHash,
  signerPublicKey,
}: { blockHash: string; signerPublicKey: string }) => {
  const signer = useAtomValue(signersAtomFamily(signerPublicKey));
  const totalWeight = useAtomValue(totalWeightAtom);
  const entity = useEntity(signerPublicKey);
  const response = useAtomValue(
    responseForBlockFamily({
      blockHash,
      signerPublicKey,
    }),
  );
  const status = React.useMemo(() => {
    if (response?.accepted) return 'success';
    if (response?.accepted === false) return 'error';
    return 'pending';
  }, [response?.accepted]);
  if (!signer) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // className="h-full box-border transition-colors"
          className={statusStyles(
            status,
            'h-full box-border transition-colors duration-500',
          )}
          style={{
            flexGrow: signer.weight + totalWeight * 0.01,
            // backgroundColor: color,
            // borderColor: borderColor,
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-0 grid-cols-[minmax(100px,min-content)_1fr] items-center">
          {entity ? (
            <>
              <DataLabel>Entity</DataLabel>
              <DataValue>{entity}</DataValue>
            </>
          ) : null}

          <DataLabel>Public Key</DataLabel>
          <DataValue>
            <PublicKey publicKey={signer.signing_key} />
          </DataValue>

          <DataLabel>Weight</DataLabel>
          <DataValue>{signer.weightPercentStr}%</DataValue>

          <DataLabel>Tenure Extend</DataLabel>
          <DataValue>
            {response?.tenureExtendTimestamp
              ? new Date(response.tenureExtendTimestamp).toLocaleString()
              : 'N/A'}
          </DataValue>

          {response?.tenureExtendTimestamp ? (
            <>
              <DataLabel>Time Remaining</DataLabel>
              <DataValue>
                <Text variant={'small'}>
                  <Countdown date={response.tenureExtendTimestamp} />
                </Text>
              </DataValue>
            </>
          ) : null}

          {typeof response?.rejectCode === 'number' ? (
            <>
              <DataLabel>Reject Code</DataLabel>
              <DataValue>{response.rejectCode}</DataValue>
            </>
          ) : null}
          {typeof response?.validationCode === 'number' ? (
            <>
              <DataLabel>Validation Code</DataLabel>
              <DataValue>{response.validationCode}</DataValue>
            </>
          ) : null}

          {response?.reason ? (
            <>
              <DataLabel>Reason</DataLabel>
              <DataValue>{response.reason}</DataValue>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const BlockListResponsesInner = ({
  blockHash,
}: { blockHash: string }) => {
  // const stacksBlock = useAtomValue(stacksBlocksFamily(blockHash));
  // preload
  useAtomValue(loadable(responsesForBlockAtomFamily(blockHash)));
  const signers = useAtomValue(signersApiAtom);
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const contentRef = React.useRef<HTMLDivElement>(null!);
  const [styles, api] = useSpring(() => {
    return {
      height: 0,
      config: config.stiff,
      // config: {
      //   friction: 10,
      // },
    };
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  React.useEffect(() => {
    if (!contentRef.current) return;
    api.start({
      height: contentRef.current.clientHeight + 2,
    });
  }, [contentRef.current]);
  if (!signers) return null;

  return (
    <animated.div
      style={{ ...styles, overflow: 'hidden' }}
      className="col-span-2 md:col-span-4"
    >
      <div
        className="w-full rounded-md h-7 border border-border flex overflow-hidden gap-[1px]"
        ref={contentRef}
      >
        {signers.signers.map((signer) => (
          <BlockListResponse
            key={`${blockHash}-${signer.signing_key}`}
            blockHash={blockHash}
            signerPublicKey={signer.signing_key}
          />
        ))}
      </div>
    </animated.div>
  );
};

export const BlockListResponses = ({ blockHash }: { blockHash: string }) => {
  return (
    <React.Suspense fallback={<div className="h-7 col-span-3 md:col-span-4" />}>
      <BlockListResponsesInner blockHash={blockHash} />
    </React.Suspense>
  );
};
