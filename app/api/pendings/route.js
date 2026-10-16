import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Pending from '@/models/Pending';

export async function GET(request) {
  try {
    await dbConnect();
    
    const pendings = await Pending.find({}).lean();
    let lastUpdated = null;
    if (pendings.length > 0) {
      const timestamps = pendings
        .map(p => p.updatedAt || p.createdAt)
        .filter(Boolean)
        .map(d => new Date(d).getTime());
      if (timestamps.length > 0) {
        lastUpdated = new Date(Math.max(...timestamps)).toISOString();
      }
    }

    return NextResponse.json({ success: true, count: pendings.length, pendings, lastUpdated });
  } catch (error) {
    console.error("GET pendings error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { rows, action = 'overwrite' } = body;

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ success: false, error: "Invalid rows data" }, { status: 400 });
    }

    // Standardize pending row formats (aggregate quantity if duplicates exist in upload batch)
    const aggregated = {};
    for (const r of rows) {
      if (!r.bearingNo) continue;
      const bNo = String(r.bearingNo).trim().toUpperCase();
      const unit = r.unit ? String(r.unit).trim() : '';
      const qty = parseInt(r.quantity, 10);
      if (!bNo || isNaN(qty) || qty < 0) continue;

      const key = unit ? `${unit}|${bNo}` : bNo;
      if (!aggregated[key]) {
        aggregated[key] = { bearingNo: bNo, unit, quantity: qty };
      } else {
        aggregated[key].quantity += qty;
      }
    }

    if (action === 'overwrite') {
      await Pending.deleteMany({});
    }

    const bulkOps = Object.values(aggregated).map(item => {
      return {
        updateOne: {
          filter: { bearingNo: item.bearingNo, unit: item.unit },
          update: action === 'overwrite' ? { $set: { quantity: item.quantity } } : { $inc: { quantity: item.quantity } },
          upsert: true
        }
      };
    });

    let modifiedCount = 0;
    if (bulkOps.length > 0) {
      const result = await Pending.bulkWrite(bulkOps, { ordered: false });
      modifiedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.insertedCount || 0);
    }

    const lastUpdated = new Date().toISOString();
    const allPendings = await Pending.find({}).lean();

    return NextResponse.json({
      success: true,
      modifiedCount,
      count: allPendings.length,
      pendings: allPendings,
      lastUpdated
    });

  } catch (error) {
    console.error("POST pendings error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    await dbConnect();
    const result = await Pending.deleteMany({});
    return NextResponse.json({
      success: true,
      message: "All pending records deleted successfully",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("DELETE pendings error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
