import dbConnect from '../lib/db.js';
import Record from '../models/Record.js';
import PlanItem from '../models/PlanItem.js';
import ProductionPlan from '../models/ProductionPlan.js';

async function run() {
  await dbConnect();
  
  console.log('=== RECORD COUNTS BY UNIT ===');
  const unitCounts = await Record.aggregate([
    { $group: { _id: '$unit', count: { $sum: 1 }, totalQty: { $sum: '$quantity' } } },
    { $sort: { totalQty: -1 } }
  ]);
  console.table(unitCounts);

  console.log('\n=== RECORD COUNTS BY YEAR & MONTH ===');
  const ymCounts = await Record.aggregate([
    { $group: { _id: { year: '$year', month: '$month' }, count: { $sum: 1 }, totalQty: { $sum: '$quantity' } } },
    { $sort: { '_id.year': -1, count: -1 } }
  ]);
  console.table(ymCounts.map(y => ({ year: y._id.year, month: y._id.month, count: y.count, totalQty: y.totalQty })));

  console.log('\n=== DISTINCT UNITS IN PLAN ITEMS ===');
  const planUnits = await PlanItem.distinct('unitName');
  console.log(planUnits);

  console.log('\n=== ACTIVE PRODUCTION PLAN ===');
  const activePlan = await ProductionPlan.findOne().sort({ createdAt: -1 }).lean();
  if (activePlan) {
    console.log({
      id: activePlan._id,
      status: activePlan.status,
      startMonth: activePlan.startMonth,
      startYear: activePlan.startYear,
      planningPeriod: activePlan.planningPeriod,
      growthRate: activePlan.growthRate,
      recentTotal: activePlan.recentTotal,
      previousTotal: activePlan.previousTotal,
      recentMonths: activePlan.recentMonths,
      previousMonths: activePlan.previousMonths
    });
  }

  process.exit(0);
}

run().catch(console.error);
