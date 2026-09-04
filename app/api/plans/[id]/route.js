import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ProductionPlan from '@/models/ProductionPlan';
import PlanItem from '@/models/PlanItem';

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    const { id } = params;
    const body = await request.json();
    const { status, approvedBy } = body;

    const plan = await ProductionPlan.findById(id);
    if (!plan) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    if (status) plan.status = status;
    if (approvedBy) {
      plan.approvedBy = approvedBy;
      plan.approvedAt = new Date();
    }

    await plan.save();

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("PATCH plan error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await dbConnect();
    const { id } = params; // planId
    const body = await request.json();
    const { 
      unitName, 
      bearingNo, 
      category, 
      targetMonth, 
      targetYear, 
      plannedQuantity 
    } = body;

    // Find and update the specific item
    const item = await PlanItem.findOne({
      planId: id,
      unitName,
      bearingNo,
      category,
      targetMonth,
      targetYear
    });

    if (!item) {
      return NextResponse.json({ success: false, error: "Plan item target not found" }, { status: 404 });
    }

    item.plannedQuantity = parseInt(plannedQuantity, 10);
    item.isManuallyEdited = true;
    await item.save();

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("PUT plan item error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
