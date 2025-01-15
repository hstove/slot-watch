import { textStyles } from '@/lib/text-variants';
import type React from 'react';

export function DataValue({ children }: { children: React.ReactNode }) {
  return <div className={textStyles('muted')}>{children}</div>;
}

export function DataLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className={textStyles('small', 'pr-4 text-nowrap')}>{children}</div>
  );
}
