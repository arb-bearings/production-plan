import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) { const k = line.slice(0, eqIdx).trim(); const v = line.slice(eqIdx+1).trim(); if (k) process.env[k] = v; }
});

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('No MONGODB_URI'); process.exit(1); }

await mongoose.connect(MONGODB_URI);
console.log('Connected to MongoDB');

const db = mongoose.connection.db;

// --- Records collection ---
const unitMap = { 'Unit-1': 'P-1', 'Unit-2': 'P-2', 'Unit-4': 'P-4' };

for (const [oldUnit, newUnit] of Object.entries(unitMap)) {
  const recCount = await db.collection('records').countDocuments({ unit: oldUnit });
  console.log(`Records: "${oldUnit}" → "${newUnit}" — ${recCount} docs`);
  if (recCount > 0) {
    const res = await db.collection('records').updateMany({ unit: oldUnit }, { $set: { unit: newUnit } });
    console.log(`  Updated ${res.modifiedCount} records`);
  }
}

// --- PlanItems collection (unitName field) ---
for (const [oldUnit, newUnit] of Object.entries(unitMap)) {
  const piCount = await db.collection('planitems').countDocuments({ unitName: oldUnit });
  console.log(`PlanItems: "${oldUnit}" → "${newUnit}" — ${piCount} docs`);
  if (piCount > 0) {
    const res = await db.collection('planitems').updateMany({ unitName: oldUnit }, { $set: { unitName: newUnit } });
    console.log(`  Updated ${res.modifiedCount} plan items`);
  }
}

// Final check
const remaining = await db.collection('records').distinct('unit');
console.log('\nFinal distinct units in records:', JSON.stringify(remaining));

await mongoose.disconnect();
console.log('Done.');
