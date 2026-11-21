import mongoose from 'mongoose';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(l => { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); });
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const samples = await db.collection('records').find({}).limit(10).toArray();
for (const s of samples) {
  console.log(s.unit, s.month, s.year, s.bearingNo, 'qty:', s.quantity, 'created:', s.createdAt?.toISOString(), 'updated:', s.updatedAt?.toISOString());
}

const updatedCount = await db.collection('records').countDocuments({
  $expr: { $ne: ['$createdAt', '$updatedAt'] }
});
const total = await db.collection('records').countDocuments();
console.log(`Total records: ${total}, Records updated after creation: ${updatedCount} (${((updatedCount/total)*100).toFixed(1)}%)`);

await mongoose.disconnect();
