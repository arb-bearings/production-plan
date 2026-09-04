import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Record from '@/models/Record';
import { generateHistoricalRecords } from '@/lib/mock-data-generator';

export async function GET(request) {
  try {
    await dbConnect();
    
    const count = await Record.countDocuments();
    if (count === 0) {
      return NextResponse.json({ success: true, count: 0, records: [] });
    }

    const records = await Record.find({}, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 })
      .lean()
      .exec();

    // Fast in-memory sort by year desc, month asc
    records.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return String(a.month || '').localeCompare(String(b.month || ''));
    });

    return NextResponse.json({ success: true, count: records.length, records });
  } catch (error) {
    console.error("GET records error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { rows, action } = body;

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ success: false, error: "Invalid rows data" }, { status: 400 });
    }

    // 1. Aggregate duplicate rows in the batch to avoid duplicate key or write conflicts inside bulkWrite
    const aggregated = {};
    for (const r of rows) {
      const u = String(r.unit || '').trim();
      const m = String(r.month || '').trim();
      const y = parseInt(r.year, 10);
      const p = String(r.partyName || '').trim();
      const b = String(r.bearingNo || '').trim().toUpperCase();

      if (!u || !m || isNaN(y) || !p || !b) continue;

      const key = `${u.toLowerCase()}|${m.toLowerCase()}|${y}|${p.toLowerCase()}|${b.toLowerCase()}`;
      if (!aggregated[key]) {
        aggregated[key] = {
          unit: u,
          month: m,
          year: y,
          quarter: r.quarter || 'Q1',
          partyName: p,
          bearingNo: b,
          category: r.category || 'General',
          quantity: parseInt(r.quantity, 10) || 0,
          basicValue: parseFloat(r.basicValue) || 0,
          withGstValue: parseFloat(r.withGstValue) || 0
        };
      } else {
        aggregated[key].quantity += (parseInt(r.quantity, 10) || 0);
        aggregated[key].basicValue += (parseFloat(r.basicValue) || 0);
        aggregated[key].withGstValue += (parseFloat(r.withGstValue) || 0);
      }
    }

    const bulkOps = Object.values(aggregated).map(r => {
      const updateQuery = action === 'overwrite' ? {
        $set: {
          quantity: r.quantity,
          basicValue: r.basicValue || 0,
          withGstValue: r.withGstValue || 0,
          category: r.category,
          quarter: r.quarter,
          unit: r.unit,
          month: r.month,
          year: r.year,
          partyName: r.partyName,
          bearingNo: r.bearingNo
        }
      } : {
        $inc: {
          quantity: r.quantity,
          basicValue: r.basicValue || 0,
          withGstValue: r.withGstValue || 0
        },
        $setOnInsert: {
          category: r.category,
          quarter: r.quarter,
          unit: r.unit,
          month: r.month,
          year: r.year,
          partyName: r.partyName,
          bearingNo: r.bearingNo
        }
      };

      return {
        updateOne: {
          filter: {
            unit: r.unit,
            month: r.month,
            year: r.year,
            partyName: r.partyName,
            bearingNo: r.bearingNo
          },
          update: updateQuery,
          upsert: true
        }
      };
    });

    let insertedCount = 0;
    let updatedCount = 0;

    if (bulkOps.length > 0) {
      const CHUNK_SIZE = 1500;
      for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
        const chunk = bulkOps.slice(i, i + CHUNK_SIZE);
        const result = await Record.bulkWrite(chunk, { ordered: false });
        insertedCount += (result.upsertedCount || 0);
        updatedCount += (result.matchedCount || 0);
      }
    }

    return NextResponse.json({
      success: true,
      status: 'success',
      insertedCount,
      updatedCount
    });

  } catch (error) {
    console.error("POST records error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    await dbConnect();
    const result = await Record.deleteMany({});
    console.log(`Deleted ${result.deletedCount} records from database.`);
    return NextResponse.json({
      success: true,
      message: "All records deleted successfully",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("DELETE records error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
