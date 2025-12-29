import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { makeDb } from '../src/db/db';
import { burnBlocks, stacksBlocks } from '../src/db/schema';
import { eq, and, gt, asc } from 'drizzle-orm';
import { subDays, format } from 'date-fns';
import * as R from 'remeda';
import { v7 as uuidv7 } from 'uuid';
import { getCreatedAt } from '../src/utils';

const db = makeDb();

const csvStr = await readFile('../data/signer-health-l2.csv', 'utf-8');
const [_, ...recordsRaw] = parse(csvStr, {
  columns: ['timestamp', 'l2-1', 'l2-2', 'l2-3'],
  skip_empty_lines: true,
  relax_quotes: true,
}) as {
  timestamp: string;
  'l2-1': string;
  'l2-2': string;
  'l2-3': string;
}[];

const records = recordsRaw.map((r) => {
  return {
    timestamp: new Date(r.timestamp),
    'l2-1': Number.parseInt(r['l2-1'].replace('%', ''), 10),
    'l2-2': Number.parseInt(r['l2-2'].replace('%', ''), 10),
    'l2-3': Number.parseInt(r['l2-3'].replace('%', ''), 10),
  };
});

const timeAgoV7 = uuidv7({ msecs: subDays(new Date(), 1.5).getTime() });

const btcBlocks = await db
  .select()
  .from(burnBlocks)
  .where(
    and(
      eq(burnBlocks.networkKey, 'mainnet'),
      // created since at least 1.5 days ago
      gt(burnBlocks.id, timeAgoV7)
    )
  )
  .orderBy(asc(burnBlocks.id));

const stxBlocks = await db
  .select()
  .from(stacksBlocks)
  .where(
    and(eq(stacksBlocks.networkKey, 'mainnet'), gt(stacksBlocks.id, timeAgoV7))
  )
  .orderBy(asc(stacksBlocks.id));

// Now, merge the CSV data with a "burn height" column

const merged = records.map((r) => {
  const beforeTimeBtc = R.filter(
    btcBlocks,
    (b) => getCreatedAt(b.id) <= r.timestamp
  );
  const btcBlock = beforeTimeBtc.at(-1);
  const beforeTimeStx = R.filter(
    stxBlocks,
    (b) => getCreatedAt(b.id) <= r.timestamp
  );
  const stxBlock = beforeTimeStx.at(-1);
  return {
    ...r,
    timestamp: format(r.timestamp, 'MM/dd/yyyy HH:mm:ss'),
    burnHeight: (btcBlock?.burnBlockHeight ?? 0) - 1,
    stxHeight: (stxBlock?.blockHeight ?? 0) - 1,
  };
});

const mergedCsvStr = stringify(merged);
await writeFile('../data/signer-health-l2-with-burn-height.csv', mergedCsvStr, {
  encoding: 'utf-8',
});

console.log(mergedCsvStr);

process.exit(0);
