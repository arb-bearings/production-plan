import mongoose from 'mongoose';
import dns from 'dns';

// Fix for Windows / ISP DNS refusing SRV queries (ECONNREFUSED querySrv)
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (err) {
  // Ignore in environments where setting DNS servers is unsupported
}

const FALLBACK_DIRECT_URI = 'mongodb://arbbearingsmarketing_db_user:HKBxqgspkHpcTdOB@ac-bc7kxyx-shard-00-00.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-01.98biddx.mongodb.net:27017,ac-bc7kxyx-shard-00-02.98biddx.mongodb.net:27017/prod_planning?ssl=true&replicaSet=atlas-8hr1xs-shard-0&authSource=admin&appName=Cluster0';

const MONGODB_URI = process.env.MONGODB_URI || FALLBACK_DIRECT_URI;

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    };

    cached.promise = (async () => {
      try {
        return await mongoose.connect(MONGODB_URI, opts);
      } catch (primaryErr) {
        console.warn("Primary MongoDB URI connection failed, connecting via direct replica set...", primaryErr.message);
        return await mongoose.connect(FALLBACK_DIRECT_URI, opts);
      }
    })();
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
