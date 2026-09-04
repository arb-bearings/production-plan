import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Record from '@/models/Record';
import ProductionPlan from '@/models/ProductionPlan';
import PlanItem from '@/models/PlanItem';
import { calculateRollingBaseline, applyBatchRedistribution, MONTH_NAMES } from '@/lib/planning-engine';

export async function GET(request) {
  try {
    await dbConnect();
    
    let activePlan = await ProductionPlan.findOne({}).sort({ createdAt: -1 });
    
    // If no plan exists, generate a default approved 6-month plan
    if (!activePlan) {
      console.log("No plans found, generating default initial plan...");
      
      const records = await Record.find({}).lean();
      if (records.length === 0) {
        return NextResponse.json({ success: true, plan: null, items: [] });
      }

      // Find latest year & month available in database to initialize matching baseline
      const yearsInDb = [...new Set(records.map(r => r.year))].sort((a, b) => b - a);
      const latestYear = yearsInDb[0] || 2024;
      const monthsInLatestYear = [...new Set(records.filter(r => r.year === latestYear).map(r => MONTH_NAMES.indexOf(r.month) + 1))].sort((a, b) => b - a);
      const latestMonth = monthsInLatestYear[0] || 7;

      let startMonth = latestMonth + 1;
      let startYear = latestYear;
      if (startMonth > 12) {
        startMonth = 1;
        startYear += 1;
      }
      const growthRate = 15;
      const N = Math.min(6, Math.max(1, monthsInLatestYear.length));

      // 1. Compute baseline and target redistribution first
      const baselineResult = calculateRollingBaseline(records, startMonth, startYear, N, growthRate, true);
      if (!baselineResult.success) {
        return NextResponse.json({ success: true, plan: null, items: [] });
      }

      const redistributionResult = applyBatchRedistribution(
        baselineResult.baselineItems,
        N,
        startMonth,
        startYear,
        { 
          minThresholds: Array(N - 1).fill(0),
          gapMonth: null,
          dividingRatios: Array(N).fill(0)
        },
        true
      );

      // 2. Create plan header with comparison details
      activePlan = await ProductionPlan.create({
        status: 'Approved',
        growthRate,
        planningPeriod: N,
        startMonth,
        startYear,
        finalMonthRuleUnder: 'merge-backward',
        finalMonthRuleOver: 'split-retain',
        minThresholds: Array(N - 1).fill(0),
        gapMonth: null,
        dividingRatios: Array(N).fill(0),
        recentTotal: baselineResult.recentTotal,
        previousTotal: baselineResult.previousTotal,
        isRecentStronger: baselineResult.isRecentStronger,
        createdBy: 'system',
        approvedBy: 'admin',
        approvedAt: new Date()
      });

      // 3. Save items
      const itemsToSave = redistributionResult.itemsList.map(item => ({
        planId: activePlan._id,
        ...item
      }));

      await PlanItem.insertMany(itemsToSave);
      console.log(`Generated default approved plan with ${itemsToSave.length} target allocations.`);
    }

    const items = await PlanItem.find({ planId: activePlan._id }).lean();
    
    return NextResponse.json({
      success: true,
      plan: activePlan,
      items
    });

  } catch (error) {
    console.error("GET plans error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    let { 
      growthRate = 20, 
      planningPeriod = 6, 
      startMonth,
      startYear,
      finalMonthRuleUnder = 'merge-backward',
      finalMonthRuleOver = 'split-retain',
      currentMonth,
      currentYear,
      minThresholds = [],
      gapMonth = null,
      dividingRatios = []
    } = body;

    let sMonth = parseInt(startMonth, 10);
    let sYear = parseInt(startYear, 10);
    if (isNaN(sMonth) || sMonth < 1 || sMonth > 12) {
      if (currentMonth !== undefined && !isNaN(parseInt(currentMonth, 10))) {
        const cM = parseInt(currentMonth, 10);
        sMonth = (cM % 12) + 1;
        sYear = cM === 12 ? (parseInt(currentYear, 10) || 2026) + 1 : (parseInt(currentYear, 10) || 2026);
      } else {
        sMonth = 8;
        sYear = 2026;
      }
    }
    if (isNaN(sYear) || sYear < 2000 || sYear > 2100) {
      sYear = parseInt(currentYear, 10) || 2026;
    }

    const parsedMinThresholds = Array.isArray(minThresholds) 
      ? minThresholds.map(t => Math.max(0, parseInt(t, 10) || 0)) 
      : Array(planningPeriod - 1).fill(0);

    let parsedGapMonth = null;
    if (gapMonth !== undefined && gapMonth !== null && gapMonth !== "") {
      const parsedVal = parseInt(gapMonth, 10);
      if (!isNaN(parsedVal) && parsedVal >= 2 && parsedVal <= planningPeriod) {
        parsedGapMonth = parsedVal;
      }
    }

    let parsedDividingRatios = Array(planningPeriod).fill(0);
    if (Array.isArray(dividingRatios) && dividingRatios.length === planningPeriod) {
      const mapped = dividingRatios.map(r => Math.max(0, Math.min(100, parseFloat(r) || 0)));
      const sum = mapped.reduce((s, r) => s + r, 0);
      if (sum === 100 || sum === 0) {
        parsedDividingRatios = mapped;
      }
    }

    const records = await Record.find({}).lean();
    if (records.length === 0) {
      return NextResponse.json({ success: false, error: "No actual production records found to plan from." }, { status: 400 });
    }

    // 1. Compute rolling baseline
    const baselineResult = calculateRollingBaseline(records, sMonth, sYear, planningPeriod, growthRate, true);
    if (!baselineResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: baselineResult.error,
        missingRecent: baselineResult.missingRecent,
        missingPrevious: baselineResult.missingPrevious
      }, { status: 400 });
    }

    // 2. Redistribute quantities across months using batch rules and selected edge case policies
    const redistributionResult = applyBatchRedistribution(
      baselineResult.baselineItems,
      planningPeriod,
      sMonth,
      sYear,
      { 
        under: finalMonthRuleUnder, 
        over: finalMonthRuleOver, 
        minThresholds: parsedMinThresholds,
        gapMonth: parsedGapMonth,
        dividingRatios: parsedDividingRatios
      },
      true
    );

    // 3. Create Draft plan header with comparison details
    const draftPlan = await ProductionPlan.create({
      status: 'Draft',
      growthRate,
      planningPeriod,
      startMonth: sMonth,
      startYear: sYear,
      finalMonthRuleUnder,
      finalMonthRuleOver,
      minThresholds: parsedMinThresholds,
      gapMonth: parsedGapMonth,
      dividingRatios: parsedDividingRatios,
      recentTotal: baselineResult.recentTotal,
      previousTotal: baselineResult.previousTotal,
      isRecentStronger: baselineResult.isRecentStronger,
      createdBy: 'production planner',
      approvedBy: '',
      approvedAt: null
    });

    // 4. Save items
    const itemsToSave = redistributionResult.itemsList.map(item => ({
      planId: draftPlan._id,
      ...item
    }));

    const savedItems = await PlanItem.insertMany(itemsToSave);

    return NextResponse.json({
      success: true,
      plan: draftPlan,
      comparison: {
        recentTotal: baselineResult.recentTotal,
        previousTotal: baselineResult.previousTotal,
        isRecentStronger: baselineResult.isRecentStronger,
        recentMonths: baselineResult.recentMonths,
        previousMonths: baselineResult.previousMonths
      },
      items: savedItems
    });

  } catch (error) {
    console.error("POST plans error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
