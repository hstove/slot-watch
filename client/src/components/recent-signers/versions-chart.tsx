import {
  recentSignersAtom,
  signerVersionsAtom,
  signerVersionsChartAtom,
} from '@/store/signers-store';
import { useAtomValue } from 'jotai';
import React from 'react';
import { Pie, PieChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

export const VersionsChart = () => {
  const { chartConfig, chartData } = useAtomValue(signerVersionsChartAtom);
  return (
    <ChartContainer
      config={chartConfig}
      className="h-[100px] w-full flex-1 [&_.recharts-pie-label-text]:fill-foreground"
    >
      <PieChart width={100} height={100}>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Pie
          data={chartData}
          dataKey="signers"
          nameKey="version"
          // cx="50%"
          // cy="50%"
          // outerRadius={80}
          // fill="#82ca9d"
          // label
        />
      </PieChart>
    </ChartContainer>
  );
};
