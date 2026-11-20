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

// Active plan
const plan = await db.collection('productionplans').findOne({}, { sort: { createdAt: -1 } });

// Search plan items for bearings that might be "2-4"
// Could be: "2-4", "2/4", "24", "2.4", "2 4"
const candidates = ['2-4', '2/4', '24', '2.4', '2 4', 'T-24', 'T-2-4'];
console.log('=== Searching plan items for possible "2-4" matches ===');
for (const c of candidates) {
  const count = await db.collection('planitems').countDocuments({ planId: plan._id, bearingNo: c });
  if (count > 0) console.log(`  FOUND "${c}": ${count} items`);
  else console.log(`  not found: "${c}"`);
}

// Search all plan items for bearings with "2" and "4" short
const allPlanBearings = await db.collection('planitems').distinct('bearingNo', { planId: plan._id });
const short24 = allPlanBearings.filter(b => b.length <= 5 && /2/.test(b) && /4/.test(b));
console.log(`\nShort (<=5 chars) plan bearings containing both 2 and 4:`, short24.join(', '));

// Also show all plan items for the first few unique bearings to understand the data
console.log(`\nTotal distinct bearings in active plan: ${allPlanBearings.length}`);

// Search records for similar
const allRecBearings = await db.collection('records').distinct('bearingNo');
const fuzzy = allRecBearings.filter(b => /^2[-\/\s]?4$/.test(b));
console.log(`\nRecords bearings exactly matching "2-4" variants:`, fuzzy);

// Check if the website is showing bearing "2-4" in category TAPER
// Let's look at the plan table on the website - what CY baseline the system shows
// The user says CY shows something for "2-4", so let's find it
const planItem24 = await db.collection('planitems').findOne({ planId: plan._id, bearingNo: { $regex: /^2.?4$/i } });
if (planItem24) {
  console.log('\nFound matching plan item:', JSON.stringify(planItem24, null, 2));
} else {
  console.log('\nNo plan item found matching /^2.?4$/i');
}

// Check if the user might mean the EXCEL bearing "2-4" which could be stored differently
// Let's show the first 10 plan items to understand structure
const sample = await db.collection('planitems').find({ planId: plan._id }).limit(5).toArray();
console.log('\nSample plan items:');
sample.forEach(i => console.log(`  bearingNo="${i.bearingNo}", category="${i.category}", unitName="${i.unitName}"`));

await mongoose.disconnect();
