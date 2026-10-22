import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import DispatchPlan from '@/models/DispatchPlan';
import DispatchPlanItem from '@/models/DispatchPlanItem';

export async function PUT(request, { params }) {
  try {
    await dbConnect();
    const { id } = params;
    const body = await request.json();

    const plan = await DispatchPlan.findById(id);
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Dispatch plan not found' }, { status: 404 });
    }

    if (body.action === 'approve') {
      plan.status = 'Approved';
      plan.approvedBy = body.approvedBy || 'admin';
      plan.approvedAt = new Date();
      await plan.save();
      return NextResponse.json({ success: true, plan });
    }

    if (body.action === 'updateCell') {
      const { itemId, dispatchNum, value } = body;
      const parsedVal = Math.max(0, parseInt(value, 10) || 0);

      const item = await DispatchPlanItem.findById(itemId);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Dispatch item not found' }, { status: 404 });
      }

      const dField = `dispatch${dispatchNum}`;
      item[dField] = parsedVal;
      item.netDispatchTarget = item.dispatch1 + item.dispatch2 + item.dispatch3 + item.dispatch4;
      item.isManuallyEdited = true;
      await item.save();

      return NextResponse.json({ success: true, item });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('PUT dispatch-plans error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
