import mongoose from 'mongoose';

const DispatchPlanItemSchema = new mongoose.Schema({
  dispatchPlanId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DispatchPlan', 
    required: true, 
    index: true 
  },
  depot: { type: String, required: true, index: true },
  bearingNo: { type: String, required: true, index: true },
  category: { type: String, required: true },
  
  // 4 Historical baseline comparison months
  m1Sales: { type: Number, default: 0 },
  m2Sales: { type: Number, default: 0 },
  m3Sales: { type: Number, default: 0 },
  m4Sales: { type: Number, default: 0 },
  m1Label: { type: String, default: '' },
  m2Label: { type: String, default: '' },
  m3Label: { type: String, default: '' },
  m4Label: { type: String, default: '' },
  
  highestSales: { type: Number, default: 0 },
  highestMonthIndex: { type: Number, default: 0 }, // 0: m1, 1: m2, 2: m3, 3: m4

  growthQty: { type: Number, default: 0 },
  pendingQty: { type: Number, default: 0 },
  grossQty: { type: Number, default: 0 },
  stockQty: { type: Number, default: 0 },
  netDispatchTarget: { type: Number, default: 0 },

  // 4 Dispatches
  dispatch1: { type: Number, default: 0 },
  dispatch2: { type: Number, default: 0 },
  dispatch3: { type: Number, default: 0 },
  dispatch4: { type: Number, default: 0 },

  isManuallyEdited: { type: Boolean, default: false }
}, {
  timestamps: true
});

DispatchPlanItemSchema.index({ dispatchPlanId: 1, depot: 1, bearingNo: 1 });
DispatchPlanItemSchema.index({ dispatchPlanId: 1, bearingNo: 1 });

export default mongoose.models.DispatchPlanItem || mongoose.model('DispatchPlanItem', DispatchPlanItemSchema);
