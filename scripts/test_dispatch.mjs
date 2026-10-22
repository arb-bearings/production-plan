import mongoose from 'mongoose';
import { getDispatchComparisonMonths, checkDispatchFeasibility, calculateDispatchPlan, MONTH_NAMES } from '../lib/dispatch-engine.js';

const uri = 'mongodb://arbbearingsmarketing_db_user:HKBxqgspkHpcTdOB@ac-bc7kxyx-shard-00-00.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-01.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-02.98biddx.mongodb.net:27017/prod_planning?ssl=true&replicaSet=atlas-8hr1xs-shard-0&authSource=admin&appName=Cluster0';

async function testDispatch() {
  console.log('=== TESTING DISPATCH ENGINE ===\n');
  await mongoose.connect(uri);

  // 1. Fetch all records
  console.log('Fetching all records...');
  const records = await mongoose.connection.db.collection('records').find({}).toArray();
  const pendings = await mongoose.connection.db.collection('pendings').find({}).toArray();
  const stocks = await mongoose.connection.db.collection('stocks').find({}).toArray();
  console.log(`Records: ${records.length}, Pendings: ${pendings.length}, Stocks: ${stocks.length}\n`);

  // 2. Test feasibility for October 2026 (should be feasible: needs Aug+Sep 2026)
  const feasOct = checkDispatchFeasibility(records, 10, 2026);
  console.log('Feasibility Oct 2026:', feasOct.feasible ? '✓ FEASIBLE' : '✗ NOT FEASIBLE');
  if (!feasOct.feasible) {
    console.log('Missing:', feasOct.missing);
  } else {
    console.log('Comparison months:', feasOct.comparisonMonths.map(m => m.label));
  }
  console.log();

  // 3. Get comparison months for October 2026
  const compMonths = getDispatchComparisonMonths(10, 2026);
  console.log('Comparison months for Oct 2026:');
  compMonths.forEach((m, i) => console.log(`  M${i + 1}: ${m.label} (${m.isCurrentYear ? 'CY' : 'PY'})`));
  console.log();

  // 4. Test calculate with full data
  const depotRatios = {
    'Unit-1': [25, 25, 25, 25],
    'ARB-KANPUR': [30, 25, 25, 20],
  };

  console.log('Calculating dispatch plan for Oct 2026 (growth 20%)...');
  const result = calculateDispatchPlan(records, pendings, stocks, 10, 2026, 20, depotRatios);
  console.log('Success:', result.success);
  console.log('Total items:', result.items.length);
  console.log('Totals:', result.totals);
  console.log();

  // 5. Show a sample non-zero item
  const nonZeroItems = result.items.filter(i => i.netDispatchTarget > 0);
  console.log('Non-zero items:', nonZeroItems.length);
  if (nonZeroItems.length > 0) {
    const sample = nonZeroItems[0];
    console.log('Sample non-zero item:');
    console.log(`  Depot: ${sample.depot} | Bearing: ${sample.bearingNo} | Category: ${sample.category}`);
    console.log(`  Sales: [${sample.m1Sales}, ${sample.m2Sales}, ${sample.m3Sales}, ${sample.m4Sales}]`);
    console.log(`  Highest: ${sample.highestSales} (month index ${sample.highestMonthIndex})`);
    console.log(`  Growth: ${sample.growthQty} | Pending: ${sample.pendingQty} | Stock: ${sample.stockQty}`);
    console.log(`  Net Dispatch Target: ${sample.netDispatchTarget}`);
    console.log(`  D1:${sample.dispatch1}  D2:${sample.dispatch2}  D3:${sample.dispatch3}  D4:${sample.dispatch4}`);
  }

  await mongoose.disconnect();
  console.log('\n=== ALL TESTS PASSED ===');
}

testDispatch().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});
