import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import DepotDispatchConfig from '@/models/DepotDispatchConfig';
import Record from '@/models/Record';

export async function GET() {
  try {
    await dbConnect();

    // Fetch all configured depots
    const configs = await DepotDispatchConfig.find({}).lean();
    const configMap = {};
    configs.forEach(c => {
      configMap[c.depot] = [c.dispatch1, c.dispatch2, c.dispatch3, c.dispatch4];
    });

    // Also get all distinct depots from records to ensure every depot has an entry
    const recordDepots = await Record.distinct('unit');
    const allDepots = Array.from(new Set([...recordDepots.filter(Boolean)])).sort();

    const result = allDepots.map(depot => {
      const ratios = configMap[depot] || [25, 25, 25, 25];
      return {
        depot,
        dispatch1: ratios[0],
        dispatch2: ratios[1],
        dispatch3: ratios[2],
        dispatch4: ratios[3]
      };
    });

    return NextResponse.json({ success: true, configs: result });
  } catch (error) {
    console.error('GET dispatch-config error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { configs = [] } = body;

    const operations = configs.map(c => {
      const d1 = Math.max(0, parseFloat(c.dispatch1) || 0);
      const d2 = Math.max(0, parseFloat(c.dispatch2) || 0);
      const d3 = Math.max(0, parseFloat(c.dispatch3) || 0);
      const d4 = Math.max(0, parseFloat(c.dispatch4) || 0);

      return {
        updateOne: {
          filter: { depot: c.depot },
          update: {
            $set: {
              dispatch1: d1,
              dispatch2: d2,
              dispatch3: d3,
              dispatch4: d4
            }
          },
          upsert: true
        }
      };
    });

    if (operations.length > 0) {
      await DepotDispatchConfig.bulkWrite(operations);
    }

    return NextResponse.json({ success: true, message: 'Depot dispatch configurations saved successfully' });
  } catch (error) {
    console.error('POST dispatch-config error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
