import mongoose from 'mongoose';

const PlanItemSchema = new mongoose.Schema({
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionPlan', required: true, index: true },
  unitName: { type: String, required: true },
  bearingNo: { type: String, required: true, index: true },
  category: { type: String, required: true },
  targetMonth: { type: Number, required: true }, // 1-12
  targetYear: { type: Number, required: true },
  originalQuantity: { type: Number, required: true },
  plannedQuantity: { type: Number, required: true },
  qtyRecent: { type: Number, default: 0 },
  qtyPrevious: { type: Number, default: 0 },
  isManuallyEdited: { type: Boolean, default: false }
}, {
  timestamps: true
});

export default mongoose.models.PlanItem || mongoose.model('PlanItem', PlanItemSchema);
