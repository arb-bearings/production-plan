import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) { const k = line.slice(0, eqIdx).trim(); const v = line.slice(eqIdx+1).trim(); if (k) process.env[k] = v; }
});

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

// First, check what the active plan's startMonth/startYear is
const plan = await db.collection('productionplans').findOne({}, { sort: { createdAt: -1 } });
console.log('\n=== Active Plan ===');
console.log('Start Month:', plan?.startMonth, '| Start Year:', plan?.startYear, '| N:', plan?.planningPeriod);
console.log('CY Months (recentMonths):', JSON.stringify(plan?.recentMonths?.map(m => `${m.monthName} ${m.year}`)));
console.log('PY Months (previousMonths):', JSON.stringify(plan?.previousMonths?.map(m => `${m.monthName} ${m.year}`)));

// All records for 06-WC
const all06wc = await db.collection('records').find({ bearingNo: '06-WC' }).toArray();
console.log('\n=== ALL 06-WC records in DB ===');
console.log('Total count:', all06wc.length);

// Group by month+year
const byMonthYear = {};
all06wc.forEach(r => {
  const key = `${r.month} ${r.year}`;
  if (!byMonthYear[key]) byMonthYear[key] = { total: 0, units: {} };
  byMonthYear[key].total += r.qty || 0;
  if (!byMonthYear[key].units[r.unit]) byMonthYear[key].units[r.unit] = 0;
  byMonthYear[key].units[r.unit] += r.qty || 0;
});

// Sort by year+month
const sorted = Object.entries(byMonthYear).sort(([a], [b]) => {
  const [am, ay] = a.split(' '); const [bm, by] = b.split(' ');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return (parseInt(ay) - parseInt(by)) || (months.indexOf(am) - months.indexOf(bm));
});

sorted.forEach(([key, val]) => {
  const unitsStr = Object.entries(val.units).map(([u, q]) => `${u}:${q}`).join(', ');
  console.log(`  ${key}: TOTAL=${val.total}  [${unitsStr}]`);
});

// Now explicitly check the CY baseline months
if (plan?.recentMonths?.length) {
  console.log('\n=== 06-WC in CY Baseline Months ===');
  let cyTotal = 0;
  for (const m of plan.recentMonths) {
    const recs = await db.collection('records').find({ bearingNo: '06-WC', month: m.monthName, year: m.year }).toArray();
    const qty = recs.reduce((s, r) => s + (r.qty || 0), 0);
    cyTotal += qty;
    console.log(`  ${m.monthName} ${m.year}: qty=${qty} (${recs.length} records)`);
    if (recs.length > 0) {
      recs.forEach(r => console.log(`    unit=${r.unit}, qty=${r.qty}, party=${r.partyName}`));
    }
  }
  console.log(`  CY TOTAL: ${cyTotal}`);
}

if (plan?.previousMonths?.length) {
  console.log('\n=== 06-WC in PY Baseline Months ===');
  let pyTotal = 0;
  for (const m of plan.previousMonths) {
    const recs = await db.collection('records').find({ bearingNo: '06-WC', month: m.monthName, year: m.year }).toArray();
    const qty = recs.reduce((s, r) => s + (r.qty || 0), 0);
    pyTotal += qty;
    console.log(`  ${m.monthName} ${m.year}: qty=${qty} (${recs.length} records)`);
    if (recs.length > 0) {
      recs.forEach(r => console.log(`    unit=${r.unit}, qty=${r.qty}, party=${r.partyName}`));
    }
  }
  console.log(`  PY TOTAL: ${pyTotal}`);
}

// Also check planitem for 06-WC in the active plan
const planItem = await db.collection('planitems').findOne({ planId: plan._id, bearingNo: '06-WC' });
console.log('\n=== PlanItem for 06-WC ===');
console.log(JSON.stringify(planItem, null, 2));

await mongoose.disconnect();
