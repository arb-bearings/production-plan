import dbConnect from '../lib/db.js';
import Record from '../models/Record.js';
import PlanItem from '../models/PlanItem.js';

async function check() {
  await dbConnect();
  const recs = await Record.find({ bearingNo: '32218' }).lean();
  console.log(`Found ${recs.length} records for bearing 32218`);
  if (recs.length > 0) {
    console.log('Sample record for 32218:', recs[0]);
    const units = [...new Set(recs.map(r => r.unit))];
    console.log('Units for 32218:', units);
    const months = [...new Set(recs.map(r => `${r.month} ${r.year}`))];
    console.log('Months for 32218:', months);
  }

  const planItems = await PlanItem.find({ bearingNo: '32218' }).lean();
  console.log(`Found ${planItems.length} PlanItems for 32218`);
  if (planItems.length > 0) {
    console.log('Sample PlanItem for 32218:', planItems.map(p => ({
      unitName: p.unitName,
      month: `${p.targetMonth}/${p.targetYear}`,
      plannedQty: p.plannedQuantity,
      qtyRecent: p.qtyRecent,
      qtyPrevious: p.qtyPrevious,
      qtyBase: p.qtyBase
    })));
  }

  process.exit(0);
}

check().catch(console.error);
