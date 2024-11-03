import { textStyles } from '@/lib/text-variants';
import type React from 'react';

export function DataValue({ children }: { children: React.ReactNode }) {
  return <p className={textStyles('muted')}>{children}</p>;
}

export function DataLabel({ children }: { children: React.ReactNode }) {
  return <p className={textStyles('small', 'pr-4 text-nowrap')}>{children}</p>;
}
