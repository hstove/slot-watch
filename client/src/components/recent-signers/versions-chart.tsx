import {
  signerVersionsChartAtom,
  useSignerVersionsWeightedAtom,
} from '@/store/signers-store';
import { useAtomValue } from 'jotai';
import { SimpleTooltip } from '../simple-tooltip';

export const VersionsChart = () => {
  const { chartData } = useAtomValue(signerVersionsChartAtom);
  const useWeighted = useAtomValue(useSignerVersionsWeightedAtom);

  return (
    <div>
      <div className="flex h-2 w-full gap-px overflow-hidden bg-muted">
        {chartData.map((item) => (
          <SimpleTooltip
            key={item.version}
            content={`${useWeighted ? `${item.signers}% of signer weight` : `${item.signers} signers`} on ${item.version === 'unknown' ? 'an unknown version' : `v${item.version}`}`}
          >
            <div
              className="h-full min-w-0"
              style={{
                flexGrow: item.signers,
                backgroundColor: item.fill,
              }}
            />
          </SimpleTooltip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {chartData.map((item) => (
          <div
            key={item.version}
            className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
          >
            <span
              className="h-1.5 w-1.5"
              style={{ backgroundColor: item.fill }}
            />
            <span>
              {item.version === 'unknown' ? 'unknown' : `v${item.version}`}
            </span>
            <span className="tabular-nums text-foreground">
              {item.signers}
              {useWeighted ? '%' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
