import mongoose from 'mongoose';
import { calculateDispatchPlan, getDispatchComparisonMonths, MONTH_NAMES } from '../lib/dispatch-engine.js';

const uri = 'mongodb://arbbearingsmarketing_db_user:HKBxqgspkHpcTdOB@ac-bc7kxyx-shard-00-00.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-01.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-02.98biddx.mongodb.net:27017/prod_planning?ssl=true&replicaSet=atlas-8hr1xs-shard-0&authSource=admin&appName=Cluster0';

async function trace() {
  await mongoose.connect(uri);

  const records = await mongoose.connection.db.collection('records').find({}).toArray();
  const pendings = await mongoose.connection.db.collection('pendings').find({}).toArray();
  const stocks = await mongoose.connection.db.collection('stocks').find({}).toArray();

  const compMonths = getDispatchComparisonMonths(10, 2026);
  const bearingNo = '6203-2RS';
  const depot = 'ARB-LUDH';

  // Show raw sales data for this bearing+depot across 4 comparison months
  console.log(`\n=== RAW SALES for ${bearingNo} @ ${depot} ===`);
  for (const cm of compMonths) {
    const monthRecords = records.filter(r => {
      const rMonth = parseInt(r.month, 10) || (MONTH_NAMES.indexOf(r.month) + 1);
      return r.bearingNo === bearingNo && r.unit === depot && rMonth === cm.monthNum && parseInt(r.year) === cm.year;
    });
    const total = monthRecords.reduce((s, r) => s + (r.quantity || 0), 0);
    console.log(`  ${cm.label} (M${cm.index + 1}): ${total.toLocaleString()} units`);
  }

  // Show all pending for this bearing
  const pendingForBearing = pendings.filter(p => p.bearingNo === bearingNo);
  console.log(`\nPending entries for ${bearingNo}:`, pendingForBearing);
  const totalPending = pendingForBearing.reduce((s, p) => s + (p.quantity || 0), 0);
  console.log('Total pending qty:', totalPending);

  // Show stock
  const stockEntry = stocks.find(s => s.bearingNo === bearingNo);
  console.log('Stock entry:', stockEntry);

  // How many depots have 6203-2RS in records?
  const depotsWithBearing = [...new Set(records.filter(r => r.bearingNo === bearingNo).map(r => r.unit))];
  console.log(`\nDepots with ${bearingNo}:`, depotsWithBearing);

  // Run the calculation and find this specific item
  const result = calculateDispatchPlan(records, pendings, stocks, 10, 2026, 20, {});
  const targetItem = result.items.find(it => it.bearingNo === bearingNo && it.depot === depot);

  if (targetItem) {
    console.log(`\n=== CALCULATED ITEM: ${bearingNo} @ ${depot} ===`);
    console.log(`  M1 (${compMonths[0].label}):   ${targetItem.m1Sales.toLocaleString()}`);
    console.log(`  M2 (${compMonths[1].label}):   ${targetItem.m2Sales.toLocaleString()}`);
    console.log(`  M3 (${compMonths[2].label}):   ${targetItem.m3Sales.toLocaleString()}`);
    console.log(`  M4 (${compMonths[3].label}):   ${targetItem.m4Sales.toLocaleString()}`);
    console.log(`  Highest Sales:         ${targetItem.highestSales.toLocaleString()} (Month index ${targetItem.highestMonthIndex} = ${compMonths[targetItem.highestMonthIndex].label})`);
    console.log(`  Growth Qty (+20%):     ${targetItem.growthQty.toLocaleString()}  [= round(${targetItem.highestSales} × 1.20)]`);
    console.log(`  Pending Qty:           ${targetItem.pendingQty.toLocaleString()}`);
    console.log(`  Gross Qty:             ${targetItem.grossQty.toLocaleString()}  [= growthQty + pending]`);
    console.log(`  Stock Deducted:        ${targetItem.stockQty.toLocaleString()}  [proportional share of total stock]`);
    console.log(`  Net Dispatch Target:   ${targetItem.netDispatchTarget.toLocaleString()}  [= gross - stockDeducted]`);
    console.log(`  D1/D2/D3/D4:           ${targetItem.dispatch1} / ${targetItem.dispatch2} / ${targetItem.dispatch3} / ${targetItem.dispatch4}`);
  } else {
    console.log(`Item NOT found for ${bearingNo} @ ${depot}`);
  }

  await mongoose.disconnect();
}

trace().catch(e => {
  console.error(e);
  process.exit(1);
});
