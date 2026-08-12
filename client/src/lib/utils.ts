import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Truncate the middle of a string, keeping `head` leading and `tail` trailing
 * characters. Assumes a monospace context, where character count is
 * proportional to rendered width.
 */
export function truncateMiddle(value: string, head = 6, tail = 6) {
  const chars = Array.from(value);
  if (chars.length <= head + tail + 1) return value;
  return `${chars.slice(0, head).join('')}…${chars.slice(-tail).join('')}`;
}
