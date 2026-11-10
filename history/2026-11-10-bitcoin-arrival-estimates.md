# Bitcoin block arrival estimates: findings and recommended algorithm

Date: 2026-11-10. Code and data: `research/bitcoin-arrival/` (README there). Status: research, nothing is wired into `client/`, `server/` or `common/`.

Sources for numbers: **[run]** = produced by a command run while writing this document (`bun src/combined/report.ts`, `bun src/run.ts ...`, `bun src/structural/oracle.ts`, `bun src/combined/fit-sigma.ts`); **[short]**, **[structural]**, **[regression]** = `research/bitcoin-arrival/notes/{short,structural,regression}.md`.

## 1. Conclusion

Recommended algorithm (`research/bitcoin-arrival/src/combined/model.ts`, called `combined`):

1. Estimate the hashrate pace under the current difficulty from the recent past, difficulty-normalised and exponentially weighted (half-life 700 blocks, prior weight 300 blocks at 600 s). Apply it to the rest of the current difficulty epoch.
2. Next epoch's pace comes from the retarget that the current epoch's projected duration implies. Everything after that is 600 s/block.
3. That gives a mean time-to-target `M(n)` from `now`. The point estimate is the MEDIAN of the arrival distribution, `now + M * median(Gamma(n)) / n` (about `M * (n - 1/3) / n`).
4. Show the 80% range (q10 to q90) from a Gamma-plus-rate-uncertainty model with a sigma(n) table fit on dev.

Anchor on `now`, not on the tip's timestamp.

What it buys, pooled per-horizon relative skill averaged within bucket (`1 - MAE/MAE_ref`), 90% paired epoch-block-bootstrap CI **[run]**:

| bucket | vs production `stacking_cycles`, dev | holdout | vs `flat600_now`, dev | holdout |
|---|---|---|---|---|
| <1d (n 1..144) | 13.5% [11.8, 15.2] | 14.0% [12.1, 15.8] | 3.8% [2.0, 5.8] | 2.7% [1.3, 4.0] |
| 1-7d (n 288..1008) | 15.8% [5.4, 25.8] | 17.5% [5.4, 27.5] | 13.2% [3.2, 21.4] | 9.1% [0.7, 16.0] |
| 14-60d (n 2016..8640) | 13.3% [1.7, 23.4] | 12.7% [3.3, 22.2] | 3.9% [0.7, 7.4] | **0.1% [-2.2, 2.3]** |

How to read this:

- **Against production the gain is real and mostly "stop doing the wrong thing".** `flat600_now` (always 600 s/block from now) already beats `stacking_cycles` at every bucket from 1d up; see section 6 for the numbers. At <1d most of the gap is the anchor: production counts from the tip's timestamp and ignores the time already elapsed since the tip (at n=1 the MAE is 744 s vs 461 s for flat-from-now, dev **[run]**).
- **Against flat 600 from now, the gain is concentrated at 1-7d** (+13.2% dev, +9.1% holdout; both CIs exclude zero, both are wide). The <1d gain is small and mostly the median-vs-mean effect at n <= 6. The 14-60d gain is NOT distinguishable from zero: dev 3.9%, holdout 0.1% with a CI straddling zero, and at n = 8640 the holdout is -3.0% [-6.4, -0.7] (3 independent windows, so I do not trust that interval either way).
- **The 1-7d gain comes from a minority of epochs.** `combined` beats `flat600_now` at 1-7d in only 9/19 dev epochs and 9/17 holdout epochs; the mean is carried by epochs with large hashrate moves.
- The intervals are calibrated up to about one week and conservative beyond it (section 4).

Recommendation: ship `combined` as specified: median ETA and the 80% range, anchored at `now`. For n >= 2016 the evidence that it beats "600 s/block from now" is dev +3.9% and holdout +0.1%, i.e. not established; if a guarantee of never being worse than flat is wanted there, use flat 600 with the median correction (`short_median600`) for n > 2016. That is a product call, I have no data that settles it.

## 2. Dataset and its caveats

Built from the Slot Watch Postgres database only, via the read-only role (`research/bitcoin-arrival/data/README.md`). No external source was used. A mempool.space backfill was deliberately not used, so gaps stay gaps.

- 71,001 mainnet burn heights, 901647 to 975234 (span 73,588); first ingest 2025-06-17, data pulled 2026-11-10. 2,587 heights are missing in 118 runs, the largest being 924373-926269 (about 1,900 blocks) and 913267-913688 (data/README.md).
- **Header time vs ingest time.** The Bitcoin header time is not stored on `burn_blocks`. It is taken from `stacks_blocks.burn_block_timestamp` (min over Stacks blocks at that height and hash); it matches `bitcoin_blocks.header_timestamp` on all 4,568 overlapping rows, which only exists from 2026-09-28. 12,192 rows have no Stacks block and so no header time. Ingest time is the UUIDv7 `burn_blocks.id` timestamp; it is not arrival time for backfilled rows (189 rows lag the header by more than 600 s) and is a different clock event from the watcher's `observed_at` (median +2.5 s).
- **Canonical-time rule** (`src/dataset.ts`): the header time if present; else the ingest time only if it falls within 7,200 s of the neighbouring header times and does not look like a backfill burst (adjacent ingests under 2 s apart and far from the header trend); else unknown. Result: 58,809 header, 12,097 ingest-time, 95 unknown, i.e. 70,906 known heights of the 73,588 in the span (**[run]**, counts of `data/canonical.csv`).
- Header times are miner-set and non-monotonic: 532 of 47,596 consecutive header-header intervals are negative (data/stats.md). 20 heights have two hashes (reorgs); the dataset keeps the one with a Stacks block, else the most recently ingested, and canonicality was not verified against Bitcoin.
- The retarget reconstruction uses the protocol rule only. It was not validated against real difficulty (no difficulty column) **[structural]**. Epoch 459 (925344-927359) sits inside the 1,900-block gap and is skipped (ratio 1) **[structural]**.
- Mean block interval over the covered period, height-weighted across consecutive known blocks: 599.2 s overall, 598.4 s dev, 600.3 s holdout **[run]** (the regression study quotes 599.7 s for dev; a different averaging, I did not reconcile them). Hashrate was essentially flat across the period; see limitations.

## 3. Evaluation method

- **Origins**: a wall-clock grid, one origin every 47 minutes (`GRID_STEP_S`). At origin `now` the tip is the largest known height whose running-max time is <= now. Origins whose tip is more than 3 h old are skipped (523), as are the first 4,500 heights (warm-up, 936). Dev = origins before 2026-04-01: 7,344 origins, 19 difficulty epochs. Holdout = after: 6,835 origins, 17 epochs **[run]**.
- **Horizons**: n = 1, 3, 6, 18, 36, 72, 144, 288, 432, 720, 1008, 2016, 3024, 4320, 6048, 8640 blocks. Truth is the canonical time of block `tip + n`. Buckets: <1d (n <= 144), 1-7d (288..1008), 14-60d (2016..8640).
- **Discipline**: tuning on dev only. The sigma(n) table was refit on dev for this estimator. The holdout was used for the final tables, and the long-horizon over-coverage it shows was not tuned away.
- **Metrics**: MAE (the objective, since the median minimises it), median AE, bias, skill = `1 - MAE/MAE_ref`, interval coverage and width. Bucket skill is the mean over the bucket's horizons of per-horizon relative skill, so the longest horizon does not dominate (the harness's own bucket column averages raw seconds and is used only in section 6, marked as such).
- **Confidence intervals**: paired block bootstrap, resampling the difficulty epoch of the origin's tip (2,000 draws, 5th to 95th percentile, same epoch draw for every horizon). The report recomputes per-pair errors itself and was checked against `runBacktest`: max MAE difference 0 s, max coverage difference 0 **[run]**.
- **Low power at 14-60d.** Rough count of non-overlapping n-block windows (`(lastTip - firstTip)/n + 1`) **[run]**:

| n | 144 | 432 | 1008 | 2016 | 3024 | 4320 | 6048 | 8640 |
|---|---|---|---|---|---|---|---|---|
| dev | 257 | 86 | 37 | 19 | 13 | 9 | 7 | 5 |
| holdout | 222 | 74 | 31 | 15 | 10 | 7 | 5 | 3 |

  Pairs overlap heavily (47-minute grid vs 10-minute blocks), so pair counts (about 7,000 per split) say nothing about precision. At n >= 2016 there are 3 to 19 independent windows per split, and errors are autocorrelated within an epoch.
- The harness world is self-consistent in header time: `now - tipTime` is between 0 and 3 h. It does not model ingest lag or header-time skew, so production's tip age can be negative or odd **[short]**.

## 4. Final results

`combined` = median ETA + intervals. `combined_mean` = same pace path, mean ETA (identical to `structural`, as expected). `floor` = MAE of Gamma(n, 600 s) about its median, i.e. the error with a perfectly known 600 s rate (not a hard bound: a better-than-600 rate can beat it). All values in seconds; skill is `combined` vs the named reference. Everything in this section is **[run]**: `bun src/combined/report.ts`.

### Dev (7,344 origins, 19 epochs): MAE

| n | stacking_cycles | flat600_now | structural | combined_mean | combined | floor | combined / floor | vs stacking_cycles (90% CI) | vs flat600_now (90% CI) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 744 | 461 | 461 | 461 | 433 | 416 | 1.04 | 41.8% [40.2%, 43.1%] | 6.1% [5.1%, 7.1%] |
| 3 | 985 | 810 | 808 | 808 | 791 | 791 | 1.00 | 19.7% [18.7%, 20.6%] | 2.4% [1.6%, 3.2%] |
| 6 | 1295 | 1168 | 1165 | 1165 | 1153 | 1146 | 1.01 | 11.0% [10.2%, 11.8%] | 1.3% [0.6%, 2.1%] |
| 18 | 2158 | 2082 | 2060 | 2060 | 2051 | 2015 | 1.02 | 5.0% [3.9%, 6.1%] | 1.5% [0.4%, 2.8%] |
| 36 | 3092 | 3025 | 2961 | 2961 | 2952 | 2861 | 1.03 | 4.5% [2.7%, 6.5%] | 2.4% [0.6%, 4.5%] |
| 72 | 4591 | 4568 | 4356 | 4356 | 4348 | 4054 | 1.07 | 5.3% [1.8%, 9.3%] | 4.8% [1.3%, 8.6%] |
| 144 | 7016 | 7075 | 6506 | 6506 | 6501 | 5739 | 1.13 | 7.3% [2.0%, 13.3%] | 8.1% [2.2%, 13.7%] |
| 288 | 11144 | 11170 | 9822 | 9822 | 9809 | 8120 | 1.21 | 12.0% [3.8%, 20.5%] | 12.2% [3.1%, 20.2%] |
| 432 | 14811 | 14800 | 12608 | 12608 | 12584 | 9947 | 1.27 | 15.0% [5.1%, 25.3%] | 15.0% [4.9%, 23.3%] |
| 720 | 22637 | 21593 | 18782 | 18782 | 18771 | 12843 | 1.46 | 17.1% [5.4%, 27.9%] | 13.1% [2.4%, 21.5%] |
| 1008 | 30299 | 28067 | 24532 | 24532 | 24516 | 15197 | 1.61 | 19.1% [6.7%, 30.2%] | 12.7% [2.0%, 20.8%] |
| 2016 | 53106 | 45238 | 42756 | 42756 | 42736 | 21493 | 1.99 | 19.5% [6.5%, 31.0%] | 5.5% [-1.0%, 11.1%] |
| 3024 | 64628 | 56233 | 54770 | 54770 | 54756 | 26325 | 2.08 | 15.3% [1.9%, 27.2%] | 2.6% [-1.7%, 7.0%] |
| 4320 | 74754 | 69284 | 66505 | 66505 | 66498 | 31464 | 2.11 | 11.0% [-1.7%, 21.9%] | 4.0% [0.3%, 8.0%] |
| 6048 | 81409 | 76460 | 73664 | 73664 | 73676 | 37230 | 1.98 | 9.5% [-3.8%, 22.1%] | 3.6% [0.4%, 7.6%] |
| 8640 | 93434 | 86433 | 83197 | 83197 | 83223 | 44498 | 1.87 | 10.9% [1.1%, 20.9%] | 3.7% [0.9%, 6.8%] |

Median AE and bias (s):

| n | medAE stacking | medAE flat | medAE combined | bias stacking | bias flat | bias combined |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 442 | 380 | 286 | -619 | -13 | -197 |
| 3 | 729 | 691 | 636 | -594 | 13 | -183 |
| 6 | 995 | 982 | 933 | -610 | 1 | -198 |
| 18 | 1733 | 1717 | 1680 | -626 | 4 | -199 |
| 36 | 2537 | 2456 | 2404 | -659 | -2 | -210 |
| 72 | 3779 | 3782 | 3607 | -725 | -19 | -233 |
| 144 | 5771 | 5909 | 5440 | -761 | 47 | -180 |
| 288 | 8675 | 8884 | 7672 | -812 | 188 | -60 |
| 432 | 11214 | 11821 | 9913 | -724 | 451 | 203 |
| 720 | 17115 | 16536 | 15024 | -906 | 642 | 465 |
| 1008 | 22822 | 21280 | 19382 | -730 | 1118 | 943 |
| 2016 | 41742 | 34045 | 33009 | -60 | 2117 | 1081 |
| 3024 | 48435 | 45789 | 46546 | 3287 | 4025 | 2481 |
| 4320 | 64072 | 58740 | 57816 | 3869 | 4358 | 2689 |
| 6048 | 72758 | 67205 | 64736 | -1231 | 752 | 201 |
| 8640 | 80215 | 78644 | 71901 | 3111 | 3532 | 1145 |

### Holdout (6,835 origins, 17 epochs): MAE

| n | stacking_cycles | flat600_now | structural | combined_mean | combined | floor | combined / floor | vs stacking_cycles (90% CI) | vs flat600_now (90% CI) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 745 | 452 | 452 | 452 | 428 | 416 | 1.03 | 42.6% [41.7%, 43.6%] | 5.3% [4.7%, 6.0%] |
| 3 | 1005 | 824 | 822 | 822 | 808 | 791 | 1.02 | 19.6% [18.7%, 20.6%] | 1.9% [1.1%, 2.6%] |
| 6 | 1314 | 1188 | 1184 | 1184 | 1173 | 1146 | 1.02 | 10.7% [9.5%, 12.0%] | 1.3% [0.7%, 1.9%] |
| 18 | 2178 | 2088 | 2071 | 2071 | 2066 | 2015 | 1.03 | 5.1% [3.7%, 6.6%] | 1.0% [0.3%, 1.9%] |
| 36 | 3108 | 3010 | 2967 | 2967 | 2964 | 2861 | 1.04 | 4.6% [2.6%, 6.7%] | 1.5% [0.2%, 2.9%] |
| 72 | 4473 | 4332 | 4208 | 4208 | 4205 | 4054 | 1.04 | 6.0% [3.0%, 9.1%] | 2.9% [0.5%, 5.5%] |
| 144 | 6776 | 6462 | 6158 | 6158 | 6160 | 5739 | 1.07 | 9.1% [4.0%, 14.3%] | 4.7% [0.2%, 9.2%] |
| 288 | 10745 | 9900 | 9229 | 9229 | 9222 | 8120 | 1.14 | 14.2% [5.7%, 22.2%] | 6.8% [-0.4%, 13.6%] |
| 432 | 13952 | 12706 | 11580 | 11580 | 11568 | 9947 | 1.16 | 17.1% [5.9%, 26.7%] | 9.0% [0.5%, 16.3%] |
| 720 | 19679 | 17800 | 15857 | 15857 | 15841 | 12843 | 1.23 | 19.5% [5.5%, 30.5%] | 11.0% [1.1%, 18.4%] |
| 1008 | 25311 | 22597 | 20425 | 20425 | 20397 | 15197 | 1.34 | 19.4% [4.5%, 30.5%] | 9.7% [0.2%, 16.5%] |
| 2016 | 40222 | 34266 | 33605 | 33605 | 33568 | 21493 | 1.56 | 16.5% [3.4%, 27.5%] | 2.0% [-4.4%, 7.4%] |
| 3024 | 50814 | 42822 | 42283 | 42283 | 42251 | 26325 | 1.61 | 16.9% [5.8%, 27.8%] | 1.3% [-2.2%, 4.8%] |
| 4320 | 53627 | 46112 | 45892 | 45892 | 45882 | 31464 | 1.46 | 14.4% [3.4%, 26.1%] | 0.5% [-2.3%, 3.1%] |
| 6048 | 57751 | 53663 | 53774 | 53774 | 53790 | 37230 | 1.44 | 6.9% [-3.2%, 18.5%] | -0.2% [-2.5%, 3.0%] |
| 8640 | 81417 | 72038 | 74152 | 74152 | 74186 | 44498 | 1.67 | 8.9% [1.2%, 18.0%] | -3.0% [-6.4%, -0.7%] |

Median AE and bias (s):

| n | medAE stacking | medAE flat | medAE combined | bias stacking | bias flat | bias combined |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 465 | 376 | 288 | -627 | -18 | -202 |
| 3 | 732 | 699 | 645 | -626 | -13 | -207 |
| 6 | 1022 | 1009 | 968 | -632 | -13 | -210 |
| 18 | 1797 | 1777 | 1724 | -664 | -24 | -219 |
| 36 | 2614 | 2571 | 2534 | -725 | -53 | -243 |
| 72 | 3777 | 3694 | 3568 | -821 | -83 | -265 |
| 144 | 5694 | 5468 | 5170 | -1041 | -171 | -343 |
| 288 | 8979 | 7941 | 7490 | -1326 | -211 | -354 |
| 432 | 11124 | 10428 | 9310 | -1491 | -150 | -268 |
| 720 | 14361 | 14663 | 12567 | -1525 | 184 | 148 |
| 1008 | 18329 | 18765 | 17013 | -1401 | 549 | 599 |
| 2016 | 31409 | 28471 | 26747 | 1760 | 3493 | 3262 |
| 3024 | 42517 | 35793 | 34791 | 4862 | 5467 | 4970 |
| 4320 | 46276 | 43094 | 40615 | 8240 | 7498 | 6893 |
| 6048 | 51794 | 43752 | 44282 | 7688 | 6237 | 6137 |
| 8640 | 76775 | 67010 | 68541 | 2570 | -539 | -924 |

`combined` has a bias of about -200 s at short horizons on both splits by construction (the median sits below the mean); use `combined_mean` if a sum-of-times is needed.

### Bucket skill (mean over horizons of per-horizon relative skill), with epoch-bootstrap CIs

| split | reference | bucket | skill | 90% CI | epochs where combined better |
| --- | --- | --- | --- | --- | --- |
| dev | stacking_cycles | <1d | 13.5% | [11.8%, 15.2%] | 19/19 |
| dev | stacking_cycles | 1-7d | 15.8% | [5.4%, 25.8%] | 9/19 |
| dev | stacking_cycles | 14-60d | 13.3% | [1.7%, 23.4%] | 10/19 |
| dev | flat600_now | <1d | 3.8% | [2.0%, 5.8%] | 16/19 |
| dev | flat600_now | 1-7d | 13.2% | [3.2%, 21.4%] | 9/19 |
| dev | flat600_now | 14-60d | 3.9% | [0.7%, 7.4%] | 10/19 |
| holdout | stacking_cycles | <1d | 14.0% | [12.1%, 15.8%] | 17/17 |
| holdout | stacking_cycles | 1-7d | 17.5% | [5.4%, 27.5%] | 12/17 |
| holdout | stacking_cycles | 14-60d | 12.7% | [3.3%, 22.2%] | 11/16 |
| holdout | flat600_now | <1d | 2.7% | [1.3%, 4.0%] | 13/17 |
| holdout | flat600_now | 1-7d | 9.1% | [0.7%, 16.0%] | 9/17 |
| holdout | flat600_now | 14-60d | 0.1% | [-2.2%, 2.3%] | 9/16 |

"Epochs where combined better" counts tip epochs where the bucket-mean skill is positive. Context, bucket skill vs `flat600_now` for the pieces: dev structural 2.3 / 13.1 / 3.9%, combined_mean 2.3 / 13.1 / 3.9%, combined 3.8 / 13.2 / 3.9%; holdout structural 1.5 / 9.0 / 0.1%, combined_mean 1.5 / 9.0 / 0.1%, combined 2.7 / 9.1 / 0.1% (<1d / 1-7d / 14-60d). So the median correction adds about 1.2-1.5 points at <1d and nothing measurable elsewhere, and the structural pace path is the whole 1-7d story. The structural numbers match the structural study's table.

### Interval coverage and mean width (`combined`)

Target 80% for [q10, q90] and 95% for [q025, q975]. The sigma(n) table was refit on dev only (`src/combined/fit-sigma.ts`; per-horizon pinball-loss fit, then a fixed [1,2,1]/4 smoothing over n >= 18).

| n | dev [q10,q90] | dev [q025,q975] | holdout [q10,q90] | holdout [q025,q975] | mean width 80% | mean width 95% |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 80.0% | 94.7% | 79.9% | 94.9% | 22.0m | 36.7m |
| 3 | 80.5% | 95.3% | 79.4% | 94.4% | 42.3m | 66.3m |
| 6 | 79.9% | 95.2% | 79.5% | 94.6% | 61.6m | 95.3m |
| 18 | 80.0% | 95.1% | 79.8% | 95.4% | 109.9m | 2.8h |
| 36 | 80.0% | 94.7% | 80.4% | 95.5% | 2.7h | 4.1h |
| 72 | 79.9% | 95.1% | 81.6% | 95.9% | 3.8h | 6.0h |
| 144 | 80.8% | 95.5% | 82.4% | 96.0% | 5.7h | 8.8h |
| 288 | 79.3% | 94.7% | 81.3% | 96.8% | 8.6h | 13.7h |
| 432 | 79.9% | 95.8% | 82.2% | 97.0% | 11.0h | 18.1h |
| 720 | 79.7% | 95.4% | 84.8% | 96.9% | 15.7h | 26.6h |
| 1008 | 79.4% | 95.0% | 88.2% | 97.3% | 21.1h | 33.5h |
| 2016 | 80.4% | 92.7% | 89.4% | 96.5% | 37.5h | 2.39d |
| 3024 | 78.7% | 94.6% | 90.0% | 99.8% | 2.12d | 3.06d |
| 4320 | 78.9% | 95.1% | 91.4% | 100.0% | 2.41d | 3.69d |
| 6048 | 82.4% | 94.9% | 90.8% | 100.0% | 2.79d | 3.91d |
| 8640 | 77.6% | 97.9% | 86.8% | 98.3% | 3.16d | 4.34d |

- n <= 144: calibrated on both splits (holdout 79.4-82.4% / 94.4-96.0%).
- n = 288 to 1008: dev on target (79.3-79.9% / 94.7-95.8%); holdout mildly conservative (81.3-88.2% / 96.8-97.3%).
- n >= 2016: dev is near nominal but noisy (77.6-82.4% and 92.7-97.9% across 2016-8640, a smoothing and sampling artefact, 5-19 independent windows). Holdout is over-covered: 86.8-91.4% for the 80% pair and 96.5-100.0% for the 95% pair. This matches the earlier short-study finding (87-94% / 100%). I did not tune on it. It is conservative, with caveat: dev contains the larger hashrate swings, so a more turbulent regime could need these intervals as wide as they are.
- The refit sigma is smaller than the earlier flat-600 table at n 36 to 1008 (0.035-0.0475 vs 0.0425-0.06 for the 80% pair) because the structural pace is a better centre.

## 5. The algorithm, precisely

Inputs: `now`, `tipHeight`, `tipTime`, and `blockTime(h)` (unix seconds or unknown) for the heights listed below; target height `T`; `n = T - tip`. Bitcoin retargets at `height % 2016 == 0`. Constants are the structural study's dev-tuned values, used as is: half-life 700, prior 300, chunk 72, window 4 half-lives (2,800 blocks), far pace 600, no growth term.

1. **Epoch durations.** For a completed epoch `e'`: `first` = nearest known block at or above `2016 e'` (within +60), `last` = nearest known block at or below `2016 e' + 2015`. If `last.h - first.h < 500` or `last.t <= first.t`, the epoch is unusable (ratio 1). Else `T_e' = (last.t - first.t) * 2015 / (last.h - first.h)`.
2. **Relative difficulty.** Current epoch `e = floor(tip/2016)` has `D_e = 1`. Going back: `D_{e'-1} = D_{e'} * T_{e'-1} / 1,209,600` (1 for an unusable epoch), for epochs from `floor((tip - 2800)/2016)` to `e`.
3. **Pace under the current difficulty.** Cut the history into 72-block chunks with boundaries at multiples of 72 (the nearest known block at or below each boundary; the newest chunk ends at the tip). For a chunk from `older` to `newer`: `dt = newer.t - older.t`; `work = sum of D(epoch(h))` over heights `(older.h, newer.h]`; `age = tip - (older.h + newer.h)/2`; `w = 2^(-age/700)`. Walk back until `tip - boundary > 2800 + 72`. Then
   `paceCur = (300 * 600 + sum(w * dt)) / (300 + sum(w * work))`.
4. **Retarget projection.** `k = tip - 2016 e`; `elapsed = (tipTime - first.t) * k / (tip - first.h)` with `first` = nearest known at or above `2016 e` (else `600 k`). `Tcur = elapsed + (2015 - k) * paceCur`; `paceNext = paceCur * clamp(1,209,600 / Tcur, 0.25, 4)`. (Using 2015 intervals against 1,209,600 mirrors Bitcoin's own off-by-one: a chain at exactly 600 s projects 600.298 s for the next epoch.)
5. **Mean time to target.** `M = sum over heights tip+1..T of pace(epoch(height))` with pace = `paceCur` in epoch `e`, `paceNext` in `e+1`, 600 afterwards. `mean = now + M`.
6. **Point estimate.** `eta = now + (M/n) * G50(n)`, `G50(n)` = median of Gamma(n, 1), computed with an exact Gamma quantile (`~ n - 1/3`; 0.693 at n = 1).
7. **Intervals.** `pace = M/n`. For probability `p` with sigma `s` (`s80` for 0.1/0.9, `s95` for 0.025/0.975): `v = n + n^2 s^2`; `q_p = now + pace * Q(n^2/v, p) * (v/n)`, with `Q(a, p)` the Gamma(a, 1) quantile. `sigma(n)` interpolates linearly in `log n`, flat outside the knots:

   | n | 1 | 18 | 36 | 72 | 144 | 288 | 432 | 720 | 1008 | 2016 | 3024 | 4320 | 6048 | 8640 |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
   | s80 | .0475 | .0475 | .0475 | .0425 | .04 | .0375 | .035 | .035 | .0375 | .0375 | .035 | .0275 | .0225 | .0175 |
   | s95 | .05 | .05 | .0525 | .0475 | .0425 | .0425 | .0425 | .0425 | .04 | .0375 | .0325 | .0275 | .02 | .015 |

8. **Degradation** (`src/combined/selftest.ts`, **[run]**, all pass): no history gives a flat 600 s/block (median ETA, up to the 0.05% next-epoch off-by-one above); `T <= tip` returns the known time (tip time if unknown); missing times (20% random plus a 1,900-block gap) and NaN times are tolerated; only the last 300 blocks known still gives a finite, ordered answer.

Equivalence: `estimateArrival` agrees with composing the original study modules (structural pace path, Gamma-median correction, `withQuantiles` with the refit sigma) to 1.2e-6 s over all 226,864 real (origin, horizon) pairs, for eta, mean, q10, q90, q025 and q975 **[run]**.

## 6. What was tried and did NOT work

Harness bucket skill vs `flat600_now` (the harness averages raw seconds across a bucket's horizons, so the longest horizon dominates; positive is better), dev / holdout, `bun src/run.ts` **[run]** unless marked:

| variant | <1d | 1-7d | 14-60d |
|---|---|---|---|
| `stacking_cycles` (production: trailing-2016 pace for the rest of the epoch, 600 after; counted from tip time) | -3.6 / -6.8% | -4.3 / -10.6% | -10.1 / -14.0% |
| `stacking_cycles_now` (same, counted from now) | +0.7 / -2.0% | -4.1 / -10.4% | -10.1 / -14.1% |
| `flat600_tip` (600 s from tip time) | -3.9 / -4.5% | +0.2 / +0.1% | 0.0 / 0.0% |
| `trailing144_now` | -11.6 / -13.2% | -57.7 / -82.2% | -260.5 / -336.1% |
| `trailing1008_now` | +1.2 / +0.3% | -11.6 / -16.9% | -117.3 / -133.3% |
| `structural_raw` (no difficulty normalisation) | +3.0 / +0.9% | +5.7 / +0.6% | -2.3 / -10.0% |
| `structural_noproj` (no retarget projection) | +4.4 / +2.7% | +11.9 / +8.5% | -1.1 / -0.8% |
| `structural_growth` (+0.3% per epoch hashrate growth) | +4.5 / +2.7% | +13.1 / +9.4% | +2.4 / -2.5% |
| `regression` (adds a next-epoch pace term, B = 2.5) | +4.2 / +2.1% | +11.6 / +5.8% | +2.0 / -3.4% |
| `regression_simple` | +4.2 / +2.1% | +10.3 / +6.3% | 0.0 / 0.0% |
| `short_best` (trailing 144/1008 shrinkage, faded out by n = 1500) | +4.0 / +2.5% | +7.6 / +3.0% | 0.0 / 0.0% |
| `structural` (final pace path) | +4.5 / +2.7% | +13.1 / +9.4% | +3.8 / -0.3% |
| `structural_shrunk` (post-hoc hedge halfway to 600 beyond n = 1008) | +4.5 / +2.7% | +13.1 / +9.4% | +2.2 / +0.3% |

(The harness bucket column differs slightly from the per-horizon-relative bucket skill used in section 1; for example `structural` 14-60d is -0.3% holdout here and +0.1% there.)

Notes on each:

- **Trailing-pace extrapolation, including production's.** Using the raw trailing pace for the rest of the epoch is the failure: the pace over the last 2016 blocks contains the previous retarget's mean reversion with the wrong sign. At 14-60d production loses 10.1% (dev) / 14.0% (holdout) to a constant 600, and `trailing144` and `trailing1008` are far worse. The regression study confirms it: raw tr2016/tr4032/previous-epoch/momentum features at n >= 2016 are significantly worse in blocked CV (-10% to -35%) **[regression]**.
- **Difficulty normalisation is the ingredient that fixes it**: without it, `structural_raw` is -2.3% / -10.0% at 14-60d, and 1-7d falls from 13.1 / 9.4 to 5.7 / 0.6 (above).
- **Growth/trend terms.** +0.3% per epoch costs 14-60d 2.8 vs 3.9% dev and -1.5 vs 0.1% holdout, +1% per epoch is -1.7 / -8.2% **[structural]**. Hashrate-trend features from chaining retarget ratios over 2-6 epochs add more noise than signal (each ratio carries about 5% noise, the size of the signal) **[regression]**.
- **Tuned constants other than 600.** An intercept or a constant pace never beat 600 in blocked CV at any horizon (0.1% to 49% worse; the dev mean interval was 599.7 s there) **[regression]**; a far-pace multiplier of 0.999 or 1.001 is within noise **[structural]**.
- **Next-epoch regression term** (`pn2016`, retarget-implied next-epoch pace). It helped on dev (+2 to +6% at n >= 2016) and failed on holdout (-2% to -9%) **[regression]**; the `regression` row above shows the same. The structural model already contains the retarget projection with a fixed coefficient; its ablation (`noproj`) shows the projection adds about 1 point at 1-7d and is the difference between 3.8% and -1.1% at 14-60d on dev, but only +0.5 points of holdout 14-60d (-0.3% vs -0.8%), within noise.
- **Time of day / day of week.** Mean T/n by UTC hour at n = 144 is within 595-604 s, consistent with noise; day-of-week 592-607 s **[short]**. Hour/day-of-week features score -0.3% to +0.1% CV gain **[regression]**.
- **Time since the last block.** Median time to the next block by tip-age bucket shows no trend (381-438 s), memoryless as expected; as a regressor ("tip age / n") it is significantly negative in CV at every horizon **[short]**, **[regression]**. The structural model's "open exposure" variant was no better **[structural]**.
- **Trailing-pace shrinkage (short study).** It works only for 36..1008 blocks, fades by 1500, and at full weight loses 14% at n = 2016 and 70% at n = 8640 on dev **[short]**. Superseded by the structural pace path: 1-7d 13.1 / 9.4% vs 7.6 / 3.0% (above).
- **Shrinking the long horizons toward 600** (`structural_shrunk`) was chosen with both splits in view, so it is a judgement, not a validated result **[structural]**.

## 7. Noise floor and remaining headroom

- Floor (known 600 s rate): combined MAE / floor, dev / holdout **[run]**: 1.04 / 1.03 at n=1, 1.00 / 1.02 at n=3, 1.01 / 1.02 at n=6, 1.02 / 1.03 at n=18, 1.03 / 1.04 at n=36, 1.07 / 1.04 at n=72, 1.13 / 1.07 at n=144, 1.21 / 1.14 at n=288, 1.27 / 1.16 at n=432, 1.46 / 1.23 at n=720, 1.61 / 1.34 at n=1008, then 1.99 / 1.56 (2016), 2.08 / 1.61 (3024), 2.11 / 1.46 (4320), 1.98 / 1.44 (6048), 1.87 / 1.67 (8640). So there is essentially no headroom at n <= 36 (at most 2-4%): the error is the exponential noise of the block process. The gap above the floor grows with n because the rate is not known.
- **Oracle** (dev, `bun src/structural/oracle.ts` **[run]**; uses true future timestamps, so an upper bound, not achievable). Skill vs `flat600_now`: the model gets 13.1% at 1-7d and 3.9% at 14-60d. Knowing the true mean pace of the rest of the CURRENT epoch (rest of the model unchanged) would give 46.8% at 1-7d and 18.4% at 14-60d. Also knowing the next epoch's pace: 51.1% and 49.7%. Knowing every epoch's pace: 51.1% and 85.1%. The model's structure (piecewise-constant pace per epoch plus retarget) can express nearly all the available gain; the limit is predicting hashrate, which nothing in the block-time history does beyond the persistence-plus-retarget identity used here (the correlation of consecutive epoch paces is -0.31 and the model already uses that mean reversion **[structural]**).
- What could still help, none of which exists in the block history: external hashrate or difficulty-adjustment information, mempool/fee signals, price. Not tested.

## 8. Limitations

- **Flat hashrate period.** The covered period had a mean interval of 599.2 s (dev 598.4, holdout 600.3 **[run]**). A sustained hashrate-growth regime, where the long-run mean interval is well below 600 s, would favour a long-run constant below 600 and a positive growth term; this dataset cannot show it, and the "growth terms hurt" and "no constant beats 600" findings are conditional on it. Conversely a hashrate shock regime (mass outage) is not in the sample.
- **Header-time noise.** Truth and inputs are miner-set header times, with 532 negative intervals in 47,596; at n = 1 this fattens the tails slightly versus a pure exponential **[short]**. Reconstructed retarget ratios inherit that noise (assumed small against T of about 1.2 million s, not quantified).
- **Gaps and reorg heights.** 3.6% of heights in the span (2,682 of 73,588: 2,587 absent plus 95 unknown after the canonical rule) have no time; the ~1,900-block gap damages the retarget reconstruction for the following epochs and one epoch is skipped. 20 reorg heights were resolved heuristically.
- **Thin holdout at long horizons.** 3 to 15 independent windows at n >= 2016 (section 3). The 14-60d conclusions are weak in both directions. Dev and holdout also differ in regime, so the holdout is not the same experiment.
- **One-regime evidence for the gain.** Roughly half the epochs show no gain at 1-7d (9/19 dev, 9/17 holdout). Skill in the short study varied by quarter from -0.9% to +11.7% **[short]**.
- **Not validated against real difficulty**; the harness is self-consistent in header time and has no ingest lag.
- Intervals over-cover on holdout at n >= 2016 (section 4).

## 9. Productionizing in Slot Watch

- **Data.** The estimator needs block times for roughly the last 5,000 to 6,000 burn blocks (the model reads at most about 4,900 back from the tip in normal cases and searches up to 7,000 below the tip for a missing time): every multiple of 72 in that window, plus the first and last block of each epoch touched, plus the current epoch's first block, about 45 points in all. Either read the times from the DB per request, or have the server compute a compact summary (about 45 `(height, time)` pairs) when a burn block arrives and cache it.
- **Where the time lives.** `burn_blocks` has no header timestamp (`created_at` is commented out in the schema; the UUIDv7 `id` is an ingest time only). Header time is available as `stacks_blocks.burn_block_timestamp` (absent for burn blocks without a Stacks block, 12,192 of 71,001 rows in this dataset, and thin around heights ~957000-967000), and since 2026-09-28 as `bitcoin_blocks.header_timestamp`. For forward use `bitcoin_blocks.header_timestamp` is the clean source, with ingest time as the tolerated fallback under the canonical rule above. The model already tolerates missing times, but accuracy near gaps has only been checked on this dataset.
- **No migration is required to start**: read from the existing tables. Adding a header-time column to `burn_blocks` (or backfilling `bitcoin_blocks`) would be a schema change; none was generated or run, and per project rules none should be run without the owner's explicit permission.
- **Port.** `src/combined/model.ts` is dependency-free; copy it (it needs `blockTime(h)` and nothing else). Keep `src/combined/selftest.ts`'s degradation cases when porting. Anchor at the server's `now`. Production's tip-age can be negative or large, unlike the harness; the model ignores tip age (memoryless), which is what the evidence supports **[short]**.
- **UI.** Show the median plus the 80% range, asymmetric ("about 7 min (2 to 17 min)") rather than plus/minus **[short]**.
- **Server-side caution** from the project guide: a failure in this code must not take down user-facing routes; fall back to flat 600 on any error.
- The harness, selftests and report run under bun only; none of this research is covered by the repo's workspace typecheck.

## 10. Reproduce

```sh
cd research/bitcoin-arrival
bun src/selftest.ts && bun test src/short/gamma.test.ts && bun src/combined/selftest.ts
bun src/combined/report.ts          # all tables in section 4
bun src/combined/fit-sigma.ts       # sigma(n) refit (dev only)
bun src/run.ts --estimators stacking_cycles,flat600_now,structural,combined,combined_mean [--detail]
```
