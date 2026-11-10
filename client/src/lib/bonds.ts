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
 * The next `count` bonds whose enrollment cutoff is still ahead of
 * `tipHeight`. Published bonds come from the list; later ones are the
 * API's projected schedules, fetched by index.
 */
export async function getUpcomingBonds(
  networkKey: string,
  tipHeight: number,
  count = 6
): Promise<Bond[]> {
  const api = getApiUrl(networkKey);
  const page = await fetchJson<{ results: ApiBond[] }>(
    `${api}/extended/v3/staking/bonds?limit=50`
  );
  const published = page.results.map(normalize);
  const upcoming = published
    .filter((b) => b.enrollmentCutoff > tipHeight)
    .sort((a, b) => a.index - b.index);
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
  return [...upcoming, ...projected.filter((b): b is Bond => b !== null)]
    .filter((b) => b.enrollmentCutoff > tipHeight)
    .slice(0, count);
}
