import mongoose from 'mongoose';

const uri = 'mongodb://arbbearingsmarketing_db_user:HKBxqgspkHpcTdOB@ac-bc7kxyx-shard-00-00.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-01.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-02.98biddx.mongodb.net:27017/prod_planning?ssl=true&replicaSet=atlas-8hr1xs-shard-0&authSource=admin&appName=Cluster0';

async function main() {
  await mongoose.connect(uri);
  const recCol = mongoose.connection.db.collection('records');
  const total = await recCol.countDocuments();
  console.log('Total records:', total);

  const agg = await recCol.aggregate([
    { $group: { _id: { year: '$year', month: '$month' }, count: { $sum: 1 }, totalQty: { $sum: '$quantity' } } },
    { $sort: { '_id.year': -1, '_id.month': 1 } }
  ]).toArray();

  console.log('Breakdown:', JSON.stringify(agg, null, 2));

  const stockCol = mongoose.connection.db.collection('stocks');
  const stockCount = await stockCol.countDocuments();
  const latestStock = await stockCol.find({}).sort({ updatedAt: -1 }).limit(1).toArray();
  console.log('Stocks count:', stockCount, 'Latest updated stock:', latestStock[0]?.updatedAt);

  const planCol = mongoose.connection.db.collection('productionplans');
  const plans = await planCol.find({}).sort({ createdAt: -1 }).toArray();
  console.log('Plans count:', plans.length, 'Latest plan:', plans[0]);

  await mongoose.disconnect();
}

main().catch(console.error);
