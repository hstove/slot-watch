import React from 'react';
import {
  type ArrivalInput,
  type ArrivalPlan,
  arrivalInputFromSamples,
  type BurnBlockArrivalResponse,
  buildArrivalPlan,
} from 'slot-watch-common';
import { MAX_MINED_LOOKBACK } from '@/lib/btc-arrival';
import { getBurnBlockArrival } from '@/lib/slots-api';

/** The tip and samples move slowly; the server caches them for up to 2 minutes. */
const REFRESH_MS = 60_000;
/** The chart and tables re-anchor at this cadence; the headline uses a 1s clock. */
const MODEL_TICK_S = 15;

export function useNow(intervalMs = 1000) {
  const [now, setNow] = React.useState(() => Date.now() / 1000);
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Arrival payload from the loader, re-polled so the tip follows the chain. */
export function useArrivalData(
  networkKey: string,
  initial: BurnBlockArrivalResponse
) {
  const [data, setData] = React.useState(initial);
  React.useEffect(() => setData(initial), [initial]);
  React.useEffect(() => {
    let cancelled = false;
    const id = window.setInterval(() => {
      getBurnBlockArrival(networkKey)
        .then((next) => {
          if (!cancelled) setData(next);
        })
        .catch(() => {
          // Keep the last good payload; the next poll retries.
        });
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [networkKey]);
  return data;
}

export interface ModelState {
  input: ArrivalInput;
  plan: ArrivalPlan;
}

/** Model input anchored at `now`. The plan only depends on tip + samples. */
export function useModel(
  data: BurnBlockArrivalResponse,
  now: number
): ModelState {
  const base = React.useMemo(
    () =>
      arrivalInputFromSamples({ now: 0, tip: data.tip, samples: data.samples }),
    [data]
  );
  const plan = React.useMemo(() => buildArrivalPlan(base), [base]);
  return React.useMemo(
    () => ({ input: { ...base, now }, plan }),
    [base, plan, now]
  );
}

/** `now` snapped to {@link MODEL_TICK_S}, for the heavier views. */
export function useModelNow(now: number) {
  return Math.floor(now / MODEL_TICK_S) * MODEL_TICK_S;
}

type ApiEstimate = NonNullable<BurnBlockArrivalResponse['estimates']>[number];
export type MinedArrival = Extract<ApiEstimate, { status: 'mined' }>;

export type MinedLookup =
  | { status: 'loading' }
  | { status: 'done'; arrival: MinedArrival | null }
  | { status: 'too-old' };

/** Known time of an already-mined height, resolved by the server. */
export function useMinedLookup(
  networkKey: string,
  height: number | undefined,
  tipHeight: number
): MinedLookup | null {
  const mined = height !== undefined && height <= tipHeight;
  const tooOld = mined && tipHeight - height > MAX_MINED_LOOKBACK;
  const [result, setResult] = React.useState<{
    height: number;
    arrival: MinedArrival | null;
  } | null>(null);
  React.useEffect(() => {
    if (!mined || tooOld || height === undefined) return;
    let cancelled = false;
    getBurnBlockArrival(networkKey, [height])
      .then((res) => {
        const estimate = res.estimates?.[0];
        if (cancelled) return;
        setResult({
          height,
          arrival: estimate?.status === 'mined' ? estimate : null,
        });
      })
      .catch(() => {
        if (!cancelled) setResult({ height, arrival: null });
      });
    return () => {
      cancelled = true;
    };
  }, [networkKey, height, mined, tooOld]);
  if (!mined) return null;
  if (tooOld) return { status: 'too-old' };
  if (result?.height !== height) return { status: 'loading' };
  return { status: 'done', arrival: result.arrival };
}
