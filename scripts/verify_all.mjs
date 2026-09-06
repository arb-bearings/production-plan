import mongoose from 'mongoose';
import { calculateRollingBaseline, applyBatchRedistribution, getCyclicActiveIndices } from '../lib/planning-engine.js';

const uri = 'mongodb://arbbearingsmarketing_db_user:HKBxqgspkHpcTdOB@ac-bc7kxyx-shard-00-00.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-01.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-02.98biddx.mongodb.net:27017/prod_planning?ssl=true&replicaSet=atlas-8hr1xs-shard-0&authSource=admin&appName=Cluster0';

async function verifyAll() {
  console.log("=== 1. VERIFYING CYCLIC ACTIVE INDICES ALGORITHM ===");
  const test1 = getCyclicActiveIndices(4, 3, 1);
  console.log("N=4, count=3, gap=1 ->", test1, "Expected: [0, 1, 2]");
  if (JSON.stringify(test1) !== JSON.stringify([0, 1, 2])) throw new Error("Test 1 failed!");

  const test2 = getCyclicActiveIndices(6, 3, 1);
  console.log("N=6, count=3, gap=1 ->", test2, "Expected: [0, 2, 4]");
  if (JSON.stringify(test2) !== JSON.stringify([0, 2, 4])) throw new Error("Test 2 failed!");

  const test3 = getCyclicActiveIndices(6, 2, 2);
  console.log("N=6, count=2, gap=2 ->", test3, "Expected: [0, 3]");
  if (JSON.stringify(test3) !== JSON.stringify([0, 3])) throw new Error("Test 3 failed!");

  console.log(" Cyclic Active Indices passed!\n");

  console.log("=== 2. VERIFYING 3-MIN REDISTRIBUTION ===");
  const baselineItems = [
    { unit: 'Unit 1', bearingNo: '6200', category: 'Deep Groove', qtyRecent: 100, qtyPrevious: 80, targetQty: 400 },   // < Min 1 (500) -> 1 month
    { unit: 'Unit 1', bearingNo: '6201', category: 'Deep Groove', qtyRecent: 600, qtyPrevious: 500, targetQty: 750 },   // Min 1 (500) to Min 2 (1000) -> 2 months (with gap)
    { unit: 'Unit 1', bearingNo: '6202', category: 'Deep Groove', qtyRecent: 1100, qtyPrevious: 900, targetQty: 1200 }, // Min 2 (1000) to Min 3 (1500) -> 3 months (with gap)
    { unit: 'Unit 1', bearingNo: '6203', category: 'Deep Groove', qtyRecent: 2000, qtyPrevious: 1800, targetQty: 2400 } // >= Min 3 (1500) -> 6 months (dividing ratios)
  ];

  const result = applyBatchRedistribution(
    baselineItems,
    6, // N = 6
    8, // Start: August
    2026,
    {
      minThresholds: [500, 1000, 1500],
      gapMonth: 1, // 1 month gap (alternative months)
      dividingRatios: [20, 20, 20, 20, 10, 10]
    },
    true
  );

  console.log("Redistributed items count:", result.itemsList.length);
  
  // Verify 6200 (< Min 1) -> 1 month (Month 1 has 400, other 5 months have 0)
  const items6200 = result.itemsList.filter(i => i.bearingNo === '6200');
  const qty6200 = items6200.map(i => i.plannedQuantity);
  console.log("6200 quantities across 6 months:", qty6200);
  if (qty6200[0] !== 400 || qty6200.slice(1).some(q => q !== 0)) throw new Error("6200 distribution failed");

  // Verify 6201 (>= Min 1, < Min 2) -> 2 months with gap 1 (Months 1 & 3 have 375 each)
  const items6201 = result.itemsList.filter(i => i.bearingNo === '6201');
  const qty6201 = items6201.map(i => i.plannedQuantity);
  console.log("6201 quantities across 6 months:", qty6201);
  if (qty6201[0] !== 375 || qty6201[2] !== 375 || qty6201[1] !== 0 || qty6201[3] !== 0) throw new Error("6201 distribution failed");

  // Verify 6202 (>= Min 2, < Min 3) -> 3 months with gap 1 (Months 1, 3, 5 have 400 each)
  const items6202 = result.itemsList.filter(i => i.bearingNo === '6202');
  const qty6202 = items6202.map(i => i.plannedQuantity);
  console.log("6202 quantities across 6 months:", qty6202);
  if (qty6202[0] !== 400 || qty6202[2] !== 400 || qty6202[4] !== 400 || qty6202[1] !== 0 || qty6202[3] !== 0) throw new Error("6202 distribution failed");

  // Verify 6203 (>= Min 3) -> all 6 months with dividing ratios [20, 20, 20, 20, 10, 10] of 2400
  const items6203 = result.itemsList.filter(i => i.bearingNo === '6203');
  const qty6203 = items6203.map(i => i.plannedQuantity);
  console.log("6203 quantities across 6 months:", qty6203);
  if (qty6203[0] !== 480 || qty6203[1] !== 480 || qty6203[4] !== 240 || qty6203[5] !== 240) throw new Error("6203 distribution failed");

  console.log(" 3-Min threshold redistribution passed!\n");

  console.log("=== 3. VERIFYING DATABASE CONNECTION & STOCK LAST UPDATED ===");
  await mongoose.connect(uri);
  const stockCol = mongoose.connection.db.collection('stocks');
  const stocks = await stockCol.find({}).toArray();
  const timestamps = stocks.map(s => s.updatedAt || s.createdAt).filter(Boolean).map(d => new Date(d).getTime());
  const latestStockTime = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
  console.log("Total stocks in DB:", stocks.length, "Latest Stock Updated Timestamp:", latestStockTime);

  await mongoose.disconnect();
  console.log("\nALL VERIFICATION CHECKS PASSED!");
}

verifyAll().catch(e => {
  console.error("Verification failed with error:", e);
  process.exit(1);
});
