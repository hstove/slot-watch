import { useMemo } from 'react';

export const useTimestamp = (createdAt: string) => {
  const timestamp = useMemo(() => {
    const date = new Date(createdAt);
    let str = date.toLocaleTimeString('en-US', {
      hour12: false,
    });
    const millis = date.getMilliseconds();
    // left pad with 0s
    str += `.${millis.toString().padStart(3, '0')}`;
    return str;
  }, [createdAt]);

  return { timestamp };
};
