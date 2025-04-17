import React from 'react';
import { Clock } from './clock';
import { useWatchBlocks } from '@/hooks/use-watch-blocks';
import { ConnectionStatus } from './connection-status';

export const Footer = () => {
  const { readyState } = useWatchBlocks();
  return (
    <div className="sticky bottom-0 w-full flex justify-end p-4 bg-background bg-opacity-50 z-20">
      <Clock className="mr-4" />
      <ConnectionStatus readyState={readyState} />
    </div>
  );
};
