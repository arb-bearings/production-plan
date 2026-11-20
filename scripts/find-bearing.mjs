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

// Search for bearings containing "2-4" or similar patterns
const pattern = /2.?4/i;

// Get all distinct bearing numbers and filter
const allBearings = await db.collection('records').distinct('bearingNo');
console.log(`Total distinct bearings in DB: ${allBearings.length}`);

// Find ones matching "2-4" pattern
const matching = allBearings.filter(b => /^2[-\s]?4$/i.test(b) || b.toLowerCase().includes('2-4'));
console.log(`\nBearings matching "2-4" pattern:`, matching);

// Also search for similar short codes
const shortBearings = allBearings.filter(b => b.length <= 5).sort();
console.log(`\nAll bearings with <= 5 chars (${shortBearings.length}):`, shortBearings.join(', '));

// Search partial match - bearings containing just "2" and "4"
const twoFour = allBearings.filter(b => /2.*4|4.*2/.test(b) && b.length <= 6);
console.log(`\nShort bearings with 2 and 4:`, twoFour.join(', '));

await mongoose.disconnect();
