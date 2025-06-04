import { useMemo } from 'react';

export function formatTimestamp(createdAt: string) {
  const date = new Date(createdAt);
  const timestampWithoutMillis = date.toLocaleTimeString('en-US', {
    hour12: false,
  });
  const millis = date.getMilliseconds();

  return {
    timestampWithoutMillis,
    timestamp: `${timestampWithoutMillis}.${millis.toString().padStart(3, '0')}`,
  };
}

export const useTimestamp = (createdAt: string) => {
  const { timestamp, timestampWithoutMillis } = useMemo(() => {
    return formatTimestamp(createdAt);
  }, [createdAt]);

  return { timestamp, timestampWithoutMillis };
};
