import { Gauge } from "prom-client";
import { getRecentBlocksHealth } from "./health/health-checks";

export const acceptanceRateLastBlocks = new Gauge({
	name: "slot_watch_block_acceptance_rate",
	help: "Of the last N blocks, how many were accepted",
	labelNames: ["last_n_blocks"],
});

export const averageAcceptanceRateLastBlocks = new Gauge({
	name: "slot_watch_average_block_acceptance_rate",
	help: "Average weight accepted of the last N blocks",
	labelNames: ["last_n_blocks"],
});

export const averageTimeToPushedLastBlocks = new Gauge({
	name: "slot_watch_average_time_to_pushed",
	help: "Average time between proposal and push of the last N blocks",
	labelNames: ["last_n_blocks"],
});

let lastRun = 0;
const runEvery = 1000 * 60; // 1 minute

export async function warmupMetrics() {
	if (Date.now() - lastRun < runEvery) {
		return;
	}

	console.log("Warming up metrics");
	const recentBlocks = await getRecentBlocksHealth("mainnet");

	const lastNs = [10, 25, 50];

	const blocksResolved = recentBlocks.blocks.filter(
		(b) => typeof b.accepted === "boolean",
	);

	for (const n of lastNs) {
		const lastNBlocks = blocksResolved.slice(0, n);
		const accepted = lastNBlocks.filter((b) => b.accepted).length;
		acceptanceRateLastBlocks.set(
			{ last_n_blocks: n },
			accepted / lastNBlocks.length,
		);

		const sumWeightAccepted = lastNBlocks.reduce(
			(acc, b) => acc + (b.accepted ? b.weightAccept : 0),
			0,
		);
		const sumWeight = lastNBlocks.reduce((acc, b) => acc + b.totalWeight, 0);
		averageAcceptanceRateLastBlocks.set(
			{ last_n_blocks: n },
			sumWeightAccepted / sumWeight,
		);

		const blocksWithPush = lastNBlocks.filter(
			(b) => b.pushedAt !== null && b.accepted === true,
		);
		let sumTimeToPushed = 0;
		for (const b of blocksWithPush) {
			if (b.pushedAt) {
				sumTimeToPushed += b.pushedAt.getTime() - b.createdAt.getTime();
			}
		}
		averageTimeToPushedLastBlocks.set(
			{ last_n_blocks: n },
			sumTimeToPushed / 1000 / blocksWithPush.length,
		);
	}

	lastRun = Date.now();
}
