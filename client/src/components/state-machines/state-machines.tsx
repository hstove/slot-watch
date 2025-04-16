import React from 'react';
import { Route } from '@/routes/state-machines';
import { recentSignersAtom } from '@/store/signers-store';
import { useAtom, useAtomValue } from 'jotai';
import {
  allSignersStateMachinesAtom,
  latestStateMachinesAtom,
} from '@/store/state-machine-store';
import { DataTable } from '../ui/data-table';
import { stateMachineColumns } from './state-machine-columns';
import { GroupedStateMachines } from './grouped-state-machines';

export function StateMachines() {
  const loaderData = Route.useLoaderData();
  const [recentSigners, setRecentSigners] = useAtom(recentSignersAtom);
  const [stateMachines, setStateMachines] = useAtom(latestStateMachinesAtom);
  const allSignersStateMachines = useAtomValue(allSignersStateMachinesAtom);
  React.useEffect(() => {
    setRecentSigners(loaderData.signers);
    setStateMachines(loaderData.stateMachines.latestStateMachineUpdates);
  }, [loaderData, setRecentSigners, setStateMachines]);

  return (
    <div className="flex flex-col gap-4">
      <DataTable columns={stateMachineColumns} data={allSignersStateMachines} />
      <GroupedStateMachines />
    </div>
  );
}
