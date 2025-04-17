import {
  type GroupedStateMachine,
  groupedStateMachinesAtom,
} from '@/store/state-machine-store';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function StateMachineCard({
  groupedStateMachine,
}: {
  groupedStateMachine: GroupedStateMachine;
}) {
  const { stateMachine, signerWeightPercent, signerWeightPercentStr } =
    groupedStateMachine;
  const isConsensus = signerWeightPercent >= 70;
  if (!stateMachine) {
    return null;
  }
  return (
    <Card
      className={cn(
        'overflow-hidden',
        isConsensus ? 'border-green-500 border-2' : '',
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg flex items-center gap-2">
            State Machine
            {isConsensus && <Badge className="bg-green-500">Consensus</Badge>}
          </CardTitle>
          <Badge
            variant={
              stateMachine.minerState.variant === 0 ? 'outline' : 'default'
            }
            className="ml-2"
          >
            {stateMachine.minerState.variant === 0 ? 'Inactive' : 'Active'}{' '}
            Miner
          </Badge>
        </div>
        <CardDescription>Block {stateMachine.burnBlockHeight}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm">Signer:</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="inline-flex items-center">
                    <span className="text-sm font-mono">
                      {truncatedSignerKey}
                    </span>
                    <InfoIcon className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs break-all">
                      {stateMachine.signerPublicKey}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">Network:</span>
              <Badge variant="outline" className="font-mono">
                {stateMachine.networkKey}
              </Badge>
            </div>
          </div> */}

          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>Signer Weight</span>
              <span className="font-medium">({signerWeightPercentStr}%)</span>
            </div>
            <Progress value={signerWeightPercent * 100} className="h-2" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Protocol Version:</span>
              <div className="font-medium">
                {stateMachine.activeSignerProtocolVersion}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Local Version:</span>
              <div className="font-medium">
                {stateMachine.localSignerProtocolVersion}
              </div>
            </div>
          </div>

          {stateMachine.minerState.variant === 1 && (
            <div className="space-y-3 pt-2 border-t">
              <h4 className="font-medium">Miner State Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Current Miner:</span>
                  <div className="font-mono text-xs truncate">
                    {stateMachine.minerState.currentMinerPkh}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Tenure ID:</span>
                  <div className="font-mono text-xs truncate">
                    {stateMachine.minerState.tenureId}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Parent Tenure ID:
                  </span>
                  <div className="font-mono text-xs truncate">
                    {stateMachine.minerState.parentTenureId}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Parent Last Block:
                  </span>
                  <div className="font-mono text-xs truncate">
                    {stateMachine.minerState.parentTenureLastBlock}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Parent Block Height:
                  </span>
                  <div className="font-medium">
                    {stateMachine.minerState.parentTenureLastBlockHeight.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
