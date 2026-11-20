import dbConnect from '../lib/db.js';
import Record from '../models/Record.js';
import Pending from '../models/Pending.js';
import { getBaselineMonths, getPreviousYearForwardMonths } from '../lib/planning-engine.js';

async function testCalc() {
  await dbConnect();
  
  const startMonth = 11; // November
  const startYear = 2026;
  const N = 6;
  const growthRate = 20;

  const recent = getBaselineMonths(startMonth, startYear, N);
  const previous = getPreviousYearForwardMonths(startMonth, startYear, N);

  console.log('CY Baseline Months:', recent.map(m => `${m.monthName} ${m.year}`));
  console.log('PY Baseline Months:', previous.map(m => `${m.monthName} ${m.year}`));

  const records = await Record.find({}).lean();
  console.log(`Total records in DB: ${records.length}`);

  const filterByPeriod = (periodMonths) =>
    records.filter(r =>
      periodMonths.some(p => p.monthName === r.month && p.year === r.year)
    );

  const recentRecords = filterByPeriod(recent);
  const previousRecords = filterByPeriod(previous);

  console.log(`Recent records count: ${recentRecords.length}, totalQty: ${recentRecords.reduce((s, r) => s + r.quantity, 0)}`);
  console.log(`Previous records count: ${previousRecords.length}, totalQty: ${previousRecords.reduce((s, r) => s + r.quantity, 0)}`);

  // Bearing 32218 test
  const b32218Recent = recentRecords.filter(r => r.bearingNo === '32218');
  const b32218Previous = previousRecords.filter(r => r.bearingNo === '32218');
  const qtyRecent32218 = b32218Recent.reduce((s, r) => s + r.quantity, 0);
  const qtyPrev32218 = b32218Previous.reduce((s, r) => s + r.quantity, 0);

  console.log(`Bearing 32218:`);
  console.log(` - Total CY across ALL depots: ${qtyRecent32218}`);
  console.log(` - Total PY across ALL depots: ${qtyPrev32218}`);
  console.log(` - Base (max): ${Math.max(qtyRecent32218, qtyPrev32218)}`);
  console.log(` - Target with 20% growth: ${Math.round(Math.max(qtyRecent32218, qtyPrev32218) * 1.2)}`);

  process.exit(0);
}

testCalc().catch(console.error);
