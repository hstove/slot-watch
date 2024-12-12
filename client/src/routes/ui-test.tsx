import { createFileRoute } from '@tanstack/react-router';
import React from 'react';

export const Route = createFileRoute('/ui-test')({
  component: UiTestComponent,
});

function UiTestComponent() {
  const percentExtend = 0.01;
  const signers = React.useMemo(() => {
    const count = 40;
    const min = 1;
    const max = 200;
    const s = Array.from({ length: count }, () => {
      return {
        weight: Math.floor(Math.random() * (max - min + 1)) + min,
        key: `0x${Math.floor(Math.random() * 16 ** 40)
          .toString(16)
          .padStart(40, '0')}`,
      };
    });
    const totalWeight = s.reduce((acc, signer) => acc + signer.weight, 0);
    const threshold = totalWeight * 0.7;
    const totalWithExtends = totalWeight + totalWeight * percentExtend * count;
    let sum = 0;
    return {
      signers: s.map((s) => {
        sum += s.weight;
        return {
          ...s,
          extend: sum >= threshold,
        };
      }),
      totalWeight,
      totalWithExtends,
      threshold,
    };
  }, []);
  return (
    <>
      <div className="flex h-10 w-full">
        <div
          className="h-full bg-red-500"
          style={{
            flexGrow: signers.totalWithExtends * 0.7,
          }}
        />
        <div
          style={{
            flexGrow: signers.totalWithExtends * 0.3,
          }}
        />
      </div>
      <div className="w-full flex">
        <div className="w-[70%] h-10 bg-blue-500" />
        <div className="w-[30%] h-10 bg-green-500" />
      </div>
      <div className="w-full rounded-md h-10 border border-border flex overflow-hidden gap-[2px]">
        {signers.signers.map((signer) => (
          <div
            key={signer.key}
            className="h-full box-border transition-colors bg-slate-500"
            style={{
              flexGrow: signer.weight + signers.totalWeight * 0.01,
              backgroundColor: signer.extend
                ? 'hsl(142 76% 36%)'
                : 'hsl(210 40% 98%)',
              // backgroundColor: `hsl(${signer.weight / signers.totalWeight * 360}, 100%, 50%)`,
            }}
          />
        ))}
      </div>
    </>
  );
}
