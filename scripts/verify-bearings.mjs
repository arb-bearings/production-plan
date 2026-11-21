import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
fs.readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(line => {
  const i = line.indexOf('='); if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
});

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const BEARINGS = ['06-WC', '32218', '32207'];
const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const plan = await db.collection('productionplans').findOne({}, { sort: { createdAt: -1 } });
const cyMonths = plan.recentMonths || [];
const pyMonths = plan.previousMonths || [];

console.log(`\nACTIVE PLAN: startMonth=${plan.startMonth}/${plan.startYear}, N=${plan.planningPeriod}, Growth=${plan.growthRate}%`);
console.log(`CY MONTHS: ${cyMonths.map(m => `${m.monthName.substring(0,3)} ${m.year}`).join(' | ')}`);
console.log(`PY MONTHS: ${pyMonths.map(m => `${m.monthName.substring(0,3)} ${m.year}`).join(' | ')}`);
console.log(`\n${'='.repeat(100)}`);

for (const BEARING of BEARINGS) {
  console.log(`\n${'█'.repeat(100)}`);
  console.log(`BEARING: ${BEARING}`);
  console.log(`${'█'.repeat(100)}`);

  // ── CY BREAKDOWN ──────────────────────────────────────────────────────────
  console.log(`\n  ┌── CY BASELINE (${cyMonths.map(m=>m.monthName.substring(0,3)+' '+m.year).join(', ')})`);
  let cyGrandTotal = 0;

  for (const m of cyMonths) {
    const recs = await db.collection('records')
      .find({ bearingNo: BEARING, month: m.monthName, year: m.year })
      .sort({ unit: 1 })
      .toArray();

    const monthTotal = recs.reduce((s, r) => s + (r.quantity || 0), 0);
    cyGrandTotal += monthTotal;

    console.log(`\n  │  ► ${m.monthName.padEnd(10)} ${m.year}  ──  TOTAL = ${monthTotal}`);
    if (recs.length === 0) {
      console.log(`  │      (no records)`);
    } else {
      // Group by unit
      const byUnit = {};
      recs.forEach(r => {
        if (!byUnit[r.unit]) byUnit[r.unit] = [];
        byUnit[r.unit].push({ qty: r.quantity || 0, party: r.partyName });
      });
      for (const [unit, entries] of Object.entries(byUnit).sort()) {
        const unitTotal = entries.reduce((s, e) => s + e.qty, 0);
        console.log(`  │      ${unit.padEnd(15)} subtotal=${String(unitTotal).padStart(5)}  [${entries.map(e => `${e.party}: ${e.qty}`).join('  |  ')}]`);
      }
    }
  }
  console.log(`\n  └── CY GRAND TOTAL = ${cyGrandTotal}`);

  // ── PY BREAKDOWN ──────────────────────────────────────────────────────────
  console.log(`\n  ┌── PY BASELINE (${pyMonths.map(m=>m.monthName.substring(0,3)+' '+m.year).join(', ')})`);
  let pyGrandTotal = 0;

  for (const m of pyMonths) {
    const recs = await db.collection('records')
      .find({ bearingNo: BEARING, month: m.monthName, year: m.year })
      .sort({ unit: 1 })
      .toArray();

    const monthTotal = recs.reduce((s, r) => s + (r.quantity || 0), 0);
    pyGrandTotal += monthTotal;

    console.log(`\n  │  ► ${m.monthName.padEnd(10)} ${m.year}  ──  TOTAL = ${monthTotal}`);
    if (recs.length === 0) {
      console.log(`  │      (no records)`);
    } else {
      const byUnit = {};
      recs.forEach(r => {
        if (!byUnit[r.unit]) byUnit[r.unit] = [];
        byUnit[r.unit].push({ qty: r.quantity || 0, party: r.partyName });
      });
      for (const [unit, entries] of Object.entries(byUnit).sort()) {
        const unitTotal = entries.reduce((s, e) => s + e.qty, 0);
        console.log(`  │      ${unit.padEnd(15)} subtotal=${String(unitTotal).padStart(5)}  [${entries.map(e => `${e.party}: ${e.qty}`).join('  |  ')}]`);
      }
    }
  }
  console.log(`\n  └── PY GRAND TOTAL = ${pyGrandTotal}`);

  // ── FINAL CALCULATION ─────────────────────────────────────────────────────
  const base = Math.max(cyGrandTotal, pyGrandTotal);
  const winner = cyGrandTotal >= pyGrandTotal ? 'CY' : 'PY';
  const target = Math.round(base * (1 + plan.growthRate / 100));
  console.log(`\n  ┌── FINAL CALCULATION`);
  console.log(`  │   CY Total = ${cyGrandTotal}`);
  console.log(`  │   PY Total = ${pyGrandTotal}`);
  console.log(`  │   Base     = max(${cyGrandTotal}, ${pyGrandTotal}) = ${base}  ← ${winner} WINS`);
  console.log(`  └── Target   = ${base} × (1 + ${plan.growthRate}%) = ${target}`);
}

await mongoose.disconnect();
