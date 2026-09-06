import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Stock from '@/models/Stock';
import { BEARING_CATALOG } from '@/lib/mock-data-generator';

export async function GET(request) {
  try {
    await dbConnect();
    
    // Seed default stocks if collection is empty
    let count = await Stock.countDocuments();
    if (count === 0) {
      console.log("Stocks collection is empty, seeding default stocks...");
      const mockStocks = BEARING_CATALOG.map(bearing => ({
        bearingNo: bearing.no,
        quantity: Math.floor(Math.random() * 850) + 150 // Random quantity between 150 and 1000
      }));
      await Stock.insertMany(mockStocks);
      console.log(`Successfully seeded ${mockStocks.length} default stocks.`);
    }

    const stocks = await Stock.find({}).lean();
    let lastUpdated = null;
    if (stocks.length > 0) {
      const timestamps = stocks
        .map(s => s.updatedAt || s.createdAt)
        .filter(Boolean)
        .map(d => new Date(d).getTime());
      if (timestamps.length > 0) {
        lastUpdated = new Date(Math.max(...timestamps)).toISOString();
      }
    }

    return NextResponse.json({ success: true, count: stocks.length, stocks, lastUpdated });
  } catch (error) {
    console.error("GET stocks error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { rows } = body;

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ success: false, error: "Invalid rows data" }, { status: 400 });
    }

    // Standardize stock row formats (aggregate quantity if duplicates exist in the upload batch)
    const aggregated = {};
    for (const r of rows) {
      if (!r.bearingNo) continue;
      const bNo = r.bearingNo.trim().toUpperCase();
      const qty = parseInt(r.quantity, 10);
      if (isNaN(qty) || qty < 0) continue;

      aggregated[bNo] = (aggregated[bNo] || 0) + qty;
    }

    const bulkOps = Object.keys(aggregated).map(bNo => {
      return {
        updateOne: {
          filter: { bearingNo: bNo },
          update: { $set: { quantity: aggregated[bNo] } },
          upsert: true
        }
      };
    });

    let modifiedCount = 0;
    if (bulkOps.length > 0) {
      const result = await Stock.bulkWrite(bulkOps, { ordered: false });
      modifiedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);
    }

    const lastUpdated = new Date().toISOString();

    return NextResponse.json({
      success: true,
      modifiedCount,
      lastUpdated
    });

  } catch (error) {
    console.error("POST stocks error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
