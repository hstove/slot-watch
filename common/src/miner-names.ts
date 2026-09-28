import { sha256 } from '@noble/hashes/sha2';

export const MINER_COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  lime: '#84cc16',
  green: '#22c55e',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  pink: '#ec4899',
  rose: '#f43f5e',
} as const;

export const MINER_ANIMALS = {
  fox: '🦊',
  owl: '🦉',
  bear: '🐻',
  wolf: '🐺',
  eagle: '🦅',
  octopus: '🐙',
  shark: '🦈',
  turtle: '🐢',
  hedgehog: '🦔',
  otter: '🦦',
  raccoon: '🦝',
  elephant: '🐘',
  giraffe: '🦒',
  zebra: '🦓',
  rhino: '🦏',
  penguin: '🐧',
  flamingo: '🦩',
  peacock: '🦚',
  bee: '🐝',
  butterfly: '🦋',
  snail: '🐌',
  crab: '🦀',
  whale: '🐳',
  dolphin: '🐬',
  lion: '🦁',
  tiger: '🐯',
  panda: '🐼',
  koala: '🐨',
  kangaroo: '🦘',
  sloth: '🦥',
  beaver: '🦫',
  bat: '🦇',
  frog: '🐸',
  lizard: '🦎',
  croc: '🐊',
  rex: '🦖',
  snake: '🐍',
  parrot: '🦜',
  swan: '🦢',
  rooster: '🐓',
  rabbit: '🐇',
  deer: '🦌',
  boar: '🐗',
  bison: '🦬',
  camel: '🐫',
  llama: '🦙',
  goat: '🐐',
  squid: '🦑',
  lobster: '🦞',
  puffer: '🐡',
  seal: '🦭',
  ladybug: '🐞',
  scorpion: '🦂',
  ant: '🐜',
  unicorn: '🦄',
  dragon: '🐉',
  dino: '🦕',
  monkey: '🐒',
  gorilla: '🦍',
  leopard: '🐆',
  turkey: '🦃',
  dodo: '🦤',
  mouse: '🐭',
  pig: '🐷',
} as const;

export type MinerColor = keyof typeof MINER_COLORS;
export type MinerAnimal = keyof typeof MINER_ANIMALS;

export const MINER_COLOR_KEYS = Object.keys(MINER_COLORS) as MinerColor[];
export const MINER_ANIMAL_KEYS = Object.keys(MINER_ANIMALS) as MinerAnimal[];

export interface MinerNameSeed {
  color: MinerColor;
  animal: MinerAnimal;
}

export interface MinerName extends MinerNameSeed {
  /** e.g. "Teal Wolf" */
  name: string;
  /** e.g. "Wolf" */
  short: string;
  emoji: string;
  /** UI label, e.g. "🐺 Wolf". Color is conveyed by `hex` alongside it. */
  label: string;
  hex: string;
}

/** Fields attached to API responses that reference a miner. */
export interface MinerIdentity {
  minerLabel: string | null;
  minerColor: MinerColor | null;
  minerAnimal: MinerAnimal | null;
}

/**
 * Pinned identities, keyed by miner (proposal/commit) public key. Adding an
 * entry reshuffles every unpinned miner's name, so pin new miners promptly.
 */
export const knownMiners: Record<string, MinerNameSeed> = {
  // Mainnet
  '035e291c2a379e7e47809859466378c0f036db49ce1382bcd72b97794aeb9e5324': {
    color: 'violet',
    animal: 'monkey',
  },
  '0355c8a06fbb3a313f9a65a69a6d21c6b7dbaa43019753248b9b515397e545fe6d': {
    color: 'red',
    animal: 'dragon',
  },
  '03d1bb53a0dc5b1df3bf87b75aefe3b6e7050738d77e98ca7f1a01b965eca7a131': {
    color: 'pink',
    animal: 'flamingo',
  },
  '039aede2763e836b3ad1b54de222a541270bdebabd69c32c81046388d66fd243d8': {
    color: 'blue',
    animal: 'sloth',
  },
  '021f5e677fe25b4d9a255923cf3f6cc6a345559aa8a9c1f2633b737bc4beb06f97': {
    color: 'amber',
    animal: 'leopard',
  },
  '0300710a046b5d8f9093bb7b14b7fbef4fb9a84b2047a1712166659dd5119ae7b2': {
    color: 'green',
    animal: 'croc',
  },
  '02cf020357e5b6dc07faf0904b055429cb6399b2490bb276adb571767ebf317127': {
    color: 'teal',
    animal: 'wolf',
  },
  '02d2ce43867f5b8fdd1246b1535717aac9b73147b05eba7ff8698c39d42701fc93': {
    color: 'lime',
    animal: 'turkey',
  },
};

const knownSeeds = Object.values(knownMiners);

function unclaimed<T extends string>(all: readonly T[], claimed: Set<T>) {
  const free = all.filter((v) => !claimed.has(v));
  return free.length > 0 ? free : all;
}

const freeColors = unclaimed(
  MINER_COLOR_KEYS,
  new Set(knownSeeds.map((s) => s.color))
);
const freeAnimals = unclaimed(
  MINER_ANIMAL_KEYS,
  new Set(knownSeeds.map((s) => s.animal))
);

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pick<T>(options: readonly T[], n: number, fallback: T) {
  return options[n % options.length] ?? fallback;
}

function pickSeed(publicKey: string): MinerNameSeed {
  const digest = sha256(new TextEncoder().encode(publicKey.toLowerCase()));
  const view = new DataView(digest.buffer);
  return {
    animal: pick(freeAnimals, view.getUint32(0), 'fox'),
    color: pick(freeColors, view.getUint32(4), 'cyan'),
  };
}

const cache = new Map<string, MinerName>();

/**
 * Deterministic `{Color} {Animal}` identity for a miner. Known miners use their
 * pinned seed; unknown miners hash into the colors/animals no known miner uses.
 */
export function getMinerName(publicKey: string): MinerName {
  const cached = cache.get(publicKey);
  if (cached) return cached;
  const seed = knownMiners[publicKey] ?? pickSeed(publicKey);
  const short = capitalize(seed.animal);
  const result: MinerName = {
    color: seed.color,
    animal: seed.animal,
    name: `${capitalize(seed.color)} ${short}`,
    short,
    emoji: MINER_ANIMALS[seed.animal],
    label: `${MINER_ANIMALS[seed.animal]} ${short}`,
    hex: MINER_COLORS[seed.color],
  };
  cache.set(publicKey, result);
  return result;
}

export function getMinerIdentity(
  publicKey: string | null | undefined
): MinerIdentity {
  if (!publicKey) {
    return { minerLabel: null, minerColor: null, minerAnimal: null };
  }
  const { name, color, animal } = getMinerName(publicKey);
  return { minerLabel: name, minerColor: color, minerAnimal: animal };
}

/** Resolve display details from API identity fields. */
export function minerDisplay(
  identity: Partial<MinerIdentity>
): MinerName | null {
  const { minerLabel, minerColor, minerAnimal } = identity;
  if (!(minerLabel && minerColor && minerAnimal)) return null;
  return {
    color: minerColor,
    animal: minerAnimal,
    name: minerLabel,
    short: capitalize(minerAnimal),
    emoji: MINER_ANIMALS[minerAnimal],
    label: `${MINER_ANIMALS[minerAnimal]} ${capitalize(minerAnimal)}`,
    hex: MINER_COLORS[minerColor],
  };
}
