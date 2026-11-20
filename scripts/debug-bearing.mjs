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

const BEARING = process.argv[2] || '2-4';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

// Active plan
const plan = await db.collection('productionplans').findOne({}, { sort: { createdAt: -1 } });
console.log(`\n=== Active Plan ===`);
console.log(`startMonth=${plan.startMonth}, startYear=${plan.startYear}, N=${plan.planningPeriod}, growthRate=${plan.growthRate}%`);
console.log(`CY months: ${plan.recentMonths?.map(m=>`${m.monthName} ${m.year}`).join(', ')}`);
console.log(`PY months: ${plan.previousMonths?.map(m=>`${m.monthName} ${m.year}`).join(', ')}`);

// All records for this bearing
const all = await db.collection('records').find({ bearingNo: BEARING }).toArray();
console.log(`\n=== ALL "${BEARING}" records in DB (${all.length} total) ===`);

// Sort by year+month
const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December'];
all.sort((a,b) => (a.year - b.year) || (MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month)));
all.forEach(r => console.log(`  ${r.month} ${r.year} | unit=${r.unit} | qty=${r.quantity} | party=${r.partyName}`));

// CY breakdown
console.log(`\n=== CY Baseline (May–Oct 2026) for "${BEARING}" ===`);
let cyTotal = 0;
for (const m of (plan.recentMonths || [])) {
  const recs = await db.collection('records').find({ bearingNo: BEARING, month: m.monthName, year: m.year }).toArray();
  const qty = recs.reduce((s,r) => s + (r.quantity||0), 0);
  cyTotal += qty;
  const detail = recs.length ? recs.map(r=>`${r.unit}:${r.quantity}`).join(' + ') : 'no records';
  console.log(`  ${m.monthName} ${m.year}: ${qty}  [${detail}]`);
}
console.log(`  => CY TOTAL: ${cyTotal}`);

// PY breakdown
console.log(`\n=== PY Baseline (Nov 2025–Apr 2026) for "${BEARING}" ===`);
let pyTotal = 0;
for (const m of (plan.previousMonths || [])) {
  const recs = await db.collection('records').find({ bearingNo: BEARING, month: m.monthName, year: m.year }).toArray();
  const qty = recs.reduce((s,r) => s + (r.quantity||0), 0);
  pyTotal += qty;
  const detail = recs.length ? recs.map(r=>`${r.unit}:${r.quantity}`).join(' + ') : 'no records';
  console.log(`  ${m.monthName} ${m.year}: ${qty}  [${detail}]`);
}
console.log(`  => PY TOTAL: ${pyTotal}`);

// Final
const base = Math.max(cyTotal, pyTotal);
const growthRate = plan.growthRate || 20;
const target = Math.round(base * (1 + growthRate / 100));
const winner = cyTotal >= pyTotal ? 'CY' : 'PY';
console.log(`\n=== Result ===`);
console.log(`CY=${cyTotal}, PY=${pyTotal} → base=${base} (${winner} wins) → target=${base}*(1+${growthRate}%)=${target}`);

// Stored plan items
const items = await db.collection('planitems').find({ planId: plan._id, bearingNo: BEARING }).toArray();
console.log(`\n=== Stored PlanItems for "${BEARING}" (${items.length}) ===`);
items.sort((a,b)=>(a.targetYear-b.targetYear)||(a.targetMonth-b.targetMonth));
items.forEach(i => console.log(`  ${MONTH_ORDER[i.targetMonth-1]} ${i.targetYear} | unit=${i.unitName} | target=${i.plannedQuantity} | qtyBase=${i.qtyBase} | qtyRecent=${i.qtyRecent} | qtyPrevious=${i.qtyPrevious}`));
const sumTarget = items.reduce((s,i)=>s+(i.plannedQuantity||0),0);
console.log(`  => Sum Target across all months/units: ${sumTarget}`);

await mongoose.disconnect();
