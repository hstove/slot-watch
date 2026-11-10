import { createFileRoute } from '@tanstack/react-router';
import { Forecast } from '@/components/forecast/forecast';
import { getBurnBlockArrival, getSigners } from '@/lib/slots-api';
import { validateForecastSearch } from '@/lib/search-schema';

export const Route = createFileRoute('/forecast')({
  component: Forecast,
  validateSearch: validateForecastSearch,
  // Only the network: the target height is handled client-side, so typing a
  // new height never refetches.
  loaderDeps: ({ search: { network } }) => ({ network }),
  loader: async ({ deps: { network } }) => {
    const networkKey = network ?? 'mainnet';
    const [arrival, pox] = await Promise.all([
      getBurnBlockArrival(networkKey),
      getSigners(networkKey)
        .then(({ firstBurnchainBlockHeight, rewardCycleLength }) => ({
          firstBurnchainBlockHeight,
          rewardCycleLength,
        }))
        .catch(() => null),
    ]);
    return { networkKey, arrival, pox };
  },
});
