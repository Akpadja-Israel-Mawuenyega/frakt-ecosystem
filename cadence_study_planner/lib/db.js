import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

/**
 * @typedef {Object} MongooseCache
 * @property {typeof mongoose | null} conn - The active, stateful cached Mongoose connection instance.
 * @property {Promise<typeof mongoose> | null} promise - The pending connection promise handled during serverless execution.
 */

/**
 * Global reference assignment preventing duplicate pool initialization 
 * loops during Next.js Hot Module Replacement (HMR) rebuilds.
 * @type {MongooseCache}
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Establishes an atomic, connection-pooled handshake with the MongoDB cluster.
 * Reuses the existing connection cache across serverless function invocations to minimize connection overhead.
 * * @async
 * @function connectDB
 * @returns {Promise<typeof mongoose>} Resolves with the fully initialized, active Mongoose tracking instance.
 * @throws {Error} If connection to the cluster fails or state variables drop out.
 */
async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    /** @type {mongoose.ConnectOptions} */
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;