import { useAtomValue } from 'jotai';
import { groupedStateMachinesAtom } from '@/store/state-machine-store';
import { StateMachineCard } from './state-machine-card';
import { cn } from '@/lib/utils';

export function GroupedStateMachines() {
  const groupedStateMachines = useAtomValue(groupedStateMachinesAtom);

  console.log('Weighted State Machines', groupedStateMachines);
  const activeStateMachines = groupedStateMachines.filter(
    (groupedStateMachine) => groupedStateMachine.stateMachine !== null
  );

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        activeStateMachines.length > 1 ? 'md:grid-cols-2' : ''
      )}
    >
      {groupedStateMachines.map((groupedStateMachine) => (
        <StateMachineCard
          key={groupedStateMachine.stateMachine?.burnBlockHeight}
          groupedStateMachine={groupedStateMachine}
        />
      ))}
    </div>
  );
}
