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

// Raw sample of 06-WC record
const sample = await db.collection('records').findOne({ bearingNo: '06-WC' });
console.log('=== Sample 06-WC record (raw) ===');
console.log(JSON.stringify(sample, null, 2));

// All 06-WC records with quantity field
const all06wc = await db.collection('records').find({ bearingNo: '06-WC' }).toArray();
console.log('\n=== All 06-WC records - month/year/unit/quantity ===');
all06wc.forEach(r => {
  console.log(`  ${r.month} ${r.year} | unit=${r.unit} | quantity=${r.quantity} | qty=${r.qty}`);
});

// Check the active plan
const plan = await db.collection('productionplans').findOne({}, { sort: { createdAt: -1 } });
console.log('\n=== Active Plan ===');
console.log(`startMonth=${plan.startMonth}, startYear=${plan.startYear}, N=${plan.planningPeriod}, growthRate=${plan.growthRate}`);
console.log('CY months:', plan.recentMonths?.map(m => `${m.monthName} ${m.year}`).join(', '));
console.log('PY months:', plan.previousMonths?.map(m => `${m.monthName} ${m.year}`).join(', '));

// CY total using correct field: quantity
const cyMonths = plan.recentMonths || [];
let cyTotal = 0;
console.log('\n=== CY baseline (quantity field) ===');
for (const m of cyMonths) {
  const recs = await db.collection('records').find({ bearingNo: '06-WC', month: m.monthName, year: m.year }).toArray();
  const qty = recs.reduce((s, r) => s + (r.quantity || 0), 0);
  cyTotal += qty;
  console.log(`  ${m.monthName} ${m.year}: ${qty} (${recs.length} records)`);
  recs.forEach(r => console.log(`    unit=${r.unit}, quantity=${r.quantity}`));
}
console.log(`  => CY TOTAL: ${cyTotal}`);

// PY total
const pyMonths = plan.previousMonths || [];
let pyTotal = 0;
console.log('\n=== PY baseline (quantity field) ===');
for (const m of pyMonths) {
  const recs = await db.collection('records').find({ bearingNo: '06-WC', month: m.monthName, year: m.year }).toArray();
  const qty = recs.reduce((s, r) => s + (r.quantity || 0), 0);
  pyTotal += qty;
  console.log(`  ${m.monthName} ${m.year}: ${qty} (${recs.length} records)`);
  recs.forEach(r => console.log(`    unit=${r.unit}, quantity=${r.quantity}`));
}
console.log(`  => PY TOTAL: ${pyTotal}`);

// qtyBase calculation
const baseTotal = Math.max(cyTotal, pyTotal);
const growthRate = plan.growthRate || 20;
const target = Math.round(baseTotal * (1 + growthRate / 100));
console.log(`\n=== Expected calculation ===`);
console.log(`CY=${cyTotal}, PY=${pyTotal}, base=max=${baseTotal}, target=${baseTotal}*(1+${growthRate}/100)=${target}`);
console.log(`Website shows qtyBase=1190, qtyRecent=454, qtyPrevious=346`);

await mongoose.disconnect();
