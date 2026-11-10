import { getApiUrl } from 'slot-watch-common';

/** One schedule point of a PoX-5 bond, as served by the Stacks API. */
interface ApiBondPoint {
  bitcoin_height: number;
  pox_cycle: number;
}

interface ApiBond {
  index: number;
  status: string;
  schedule: {
    enrollment_cutoff: ApiBondPoint;
    activation: ApiBondPoint;
    unlock: ApiBondPoint;
  };
}

export interface Bond {
  index: number;
  status: string;
  /** Registration must complete before this burn height. */
  enrollmentCutoff: number;
  /** First burn height of the bond's first reward cycle. */
  activation: number;
  activationCycle: number;
  unlock: number;
}

const MAX_INDEX = 10_000;

function normalize(bond: ApiBond): Bond {
  return {
    index: bond.index,
    status: bond.status,
    enrollmentCutoff: bond.schedule.enrollment_cutoff.bitcoin_height,
    activation: bond.schedule.activation.bitcoin_height,
    activationCycle: bond.schedule.activation.pox_cycle,
    unlock: bond.schedule.unlock.bitcoin_height,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Stacks API ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Bond schedules around `tipHeight`: every published bond that has not
 * unlocked yet, plus enough projected ones (fetched by index) that `count`
 * bonds still have their enrollment cutoff ahead. Ascending by index.
 */
export async function getBondSchedule(
  networkKey: string,
  tipHeight: number,
  count = 6
): Promise<Bond[]> {
  const api = getApiUrl(networkKey);
  const page = await fetchJson<{ results: ApiBond[] }>(
    `${api}/extended/v3/staking/bonds?limit=50`
  );
  const published = page.results.map(normalize);
  const upcoming = published.filter((b) => b.enrollmentCutoff > tipHeight);
  const nextIndex = Math.max(0, ...published.map((b) => b.index)) + 1;
  const missing = Math.max(0, count - upcoming.length);
  const indexes = Array.from(
    { length: Math.min(missing, MAX_INDEX + 1 - nextIndex) },
    (_, i) => nextIndex + i
  );
  const projected = await Promise.all(
    indexes.map((index) =>
      fetchJson<ApiBond>(`${api}/extended/v3/staking/bonds/${index}`)
        .then(normalize)
        .catch(() => null)
    )
  );
  return [
    ...published.filter((b) => b.unlock > tipHeight),
    ...projected.filter((b): b is Bond => b !== null),
  ].sort((a, b) => a.index - b.index);
}

/** The next `count` bonds whose enrollment cutoff is after `height`. */
export function upcomingBonds(
  bonds: readonly Bond[],
  height: number,
  count = 6
): Bond[] {
  return bonds.filter((b) => b.enrollmentCutoff > height).slice(0, count);
}

export type BondPhase = 'upcoming' | 'closed' | 'locked' | 'unlocked';

/**
 * Where `height` falls in a bond's life. The API has no enrollment start, so
 * everything before the cutoff is just "upcoming".
 */
export function bondPhase(bond: Bond, height: number): BondPhase {
  if (height < bond.enrollmentCutoff) return 'upcoming';
  if (height < bond.activation) return 'closed';
  if (height < bond.unlock) return 'locked';
  return 'unlocked';
}
