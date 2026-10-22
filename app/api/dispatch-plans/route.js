import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Record from '@/models/Record';
import Pending from '@/models/Pending';
import Stock from '@/models/Stock';
import DispatchPlan from '@/models/DispatchPlan';
import DispatchPlanItem from '@/models/DispatchPlanItem';
import DepotDispatchConfig from '@/models/DepotDispatchConfig';
import { 
  getDispatchComparisonMonths, 
  checkDispatchFeasibility, 
  calculateDispatchPlan,
  getDispatchPlanningMonths,
  MONTH_NAMES 
} from '@/lib/dispatch-engine';

export async function GET(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('id');

    // Planning horizon: N - 1 previous month to N + 3 future months
    const now = new Date();
    const queryBaseMonth = searchParams.get('baseMonth');
    const queryBaseYear = searchParams.get('baseYear');
    const baseMonth = queryBaseMonth ? parseInt(queryBaseMonth, 10) : (now.getMonth() + 1);
    const baseYear = queryBaseYear ? parseInt(queryBaseYear, 10) : now.getFullYear();

    const feasibleMonths = getDispatchPlanningMonths(baseMonth, baseYear);

    let activePlan = null;
    if (planId) {
      activePlan = await DispatchPlan.findById(planId).lean();
    } else {
      activePlan = await DispatchPlan.findOne({}).sort({ createdAt: -1 }).lean();
    }

    let items = [];
    if (activePlan) {
      items = await DispatchPlanItem.find({ dispatchPlanId: activePlan._id }).lean();
    }

    return NextResponse.json({
      success: true,
      plan: activePlan,
      items,
      feasibleMonths,
      comparisonMonths: activePlan ? getDispatchComparisonMonths(activePlan.targetMonth, activePlan.targetYear) : []
    });
  } catch (error) {
    console.error('GET dispatch-plans error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const {
      targetMonth,
      targetYear,
      growthRate = 20,
      depotRatios = {}
    } = body;

    const tMonth = parseInt(targetMonth, 10);
    const tYear = parseInt(targetYear, 10);

    if (isNaN(tMonth) || tMonth < 1 || tMonth > 12) {
      return NextResponse.json({ success: false, error: 'Invalid target month.' }, { status: 400 });
    }
    if (isNaN(tYear) || tYear < 2000 || tYear > 2100) {
      return NextResponse.json({ success: false, error: 'Invalid target year.' }, { status: 400 });
    }

    const records = await Record.find({}).lean();
    const pendings = await Pending.find({}).lean();
    const stocks = await Stock.find({}).lean();

    if (records.length === 0) {
      return NextResponse.json({ success: false, error: 'No actual production or sales records found.' }, { status: 400 });
    }

    // 1. Feasibility check: must have 2 preceding current-year actual months
    const feasibility = checkDispatchFeasibility(records, tMonth, tYear);
    if (!feasibility.feasible) {
      return NextResponse.json({
        success: false,
        error: `Cannot create dispatch plan for ${MONTH_NAMES[tMonth - 1]} ${tYear}. Missing required prior actual data for: ${feasibility.missing.join(', ')}.`
      }, { status: 400 });
    }

    // 2. Fetch saved depot ratios if not passed in body
    let activeDepotRatios = { ...depotRatios };
    const savedConfigs = await DepotDispatchConfig.find({}).lean();
    savedConfigs.forEach(c => {
      if (!activeDepotRatios[c.depot]) {
        activeDepotRatios[c.depot] = [c.dispatch1, c.dispatch2, c.dispatch3, c.dispatch4];
      }
    });

    // 3. Compute Dispatch Plan
    const result = calculateDispatchPlan(
      records,
      pendings,
      stocks,
      tMonth,
      tYear,
      growthRate,
      activeDepotRatios
    );

    // 4. Save Plan Header
    const plan = await DispatchPlan.create({
      status: 'Draft',
      targetMonth: tMonth,
      targetYear: tYear,
      growthRate: parseFloat(growthRate) || 20,
      depotRatios: activeDepotRatios,
      totalNetDispatch: result.totals.totalNetDispatch,
      totalDispatch1: result.totals.totalDispatch1,
      totalDispatch2: result.totals.totalDispatch2,
      totalDispatch3: result.totals.totalDispatch3,
      totalDispatch4: result.totals.totalDispatch4,
      createdBy: 'dispatch planner'
    });

    // 5. Save Items
    const itemsToSave = result.items.map(item => ({
      dispatchPlanId: plan._id,
      ...item
    }));

    const savedItems = await DispatchPlanItem.insertMany(itemsToSave);

    return NextResponse.json({
      success: true,
      plan,
      items: savedItems,
      comparisonMonths: result.comparisonMonths
    });

  } catch (error) {
    console.error('POST dispatch-plans error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
