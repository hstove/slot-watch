import React from 'react';
import { useAtomValue } from 'jotai';
import { groupedStateMachinesAtom } from '@/store/state-machine-store';

export function GroupedStateMachines() {
  const groupedStateMachines = useAtomValue(groupedStateMachinesAtom);

  console.log('Weighted State Machines', groupedStateMachines);

  return null;
}
