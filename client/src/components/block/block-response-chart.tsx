import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../ui/chart';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { blockResponsesChartDataAtom } from '@/store/blocks-store';
import { useAtomValue } from 'jotai';

const chartConfig = {
  accepted: {
    label: 'Accepted',
    color: 'green',
  },
  rejected: {
    label: 'Rejected',
    color: 'red',
  },
} satisfies ChartConfig;

export const BlockResponseChart = ({ blockHash }: { blockHash: string }) => {
  const chartData = useAtomValue(blockResponsesChartDataAtom(blockHash));

  if (!chartData) return null;

  return (
    <ChartContainer config={chartConfig} className="w-full h-[400px]">
      <LineChart
        accessibilityLayer
        data={chartData}
        margin={{
          // left: 12,
          right: 24,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="createdAt"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          // tickFormatter={(value) => value.slice(0, 3)}
          tickFormatter={(value) => new Date(value).toLocaleTimeString()}
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
        />
        <YAxis
          domain={[0, 1]}
          tickMargin={8}
          tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Line
          dataKey="accepted"
          type="monotone"
          stroke="var(--color-accepted)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="rejected"
          type="monotone"
          stroke="var(--color-rejected)"
          strokeWidth={2}
          dot={false}
        />
        <ReferenceLine
          y={0.7}
          // label="Acceptance Threshold"
          stroke="green"
          strokeDasharray="3 3"
        />
        <ReferenceLine
          y={0.3}
          // label="Acceptance Threshold"
          stroke="red"
          strokeDasharray="3 3"
        />
      </LineChart>
    </ChartContainer>
  );
};
