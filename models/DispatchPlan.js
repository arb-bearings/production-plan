import mongoose from 'mongoose';

const DispatchPlanSchema = new mongoose.Schema({
  status: { 
    type: String, 
    enum: ['Draft', 'Approved'], 
    default: 'Draft',
    index: true 
  },
  targetMonth: { type: Number, required: true }, // 1 - 12
  targetYear: { type: Number, required: true },
  growthRate: { type: Number, default: 20 },
  depotRatios: { 
    type: Object, // e.g. { 'ARB-JAIPUR': [25, 25, 25, 25] }
    default: {} 
  },
  totalNetDispatch: { type: Number, default: 0 },
  totalDispatch1: { type: Number, default: 0 },
  totalDispatch2: { type: Number, default: 0 },
  totalDispatch3: { type: Number, default: 0 },
  totalDispatch4: { type: Number, default: 0 },
  createdBy: { type: String, default: 'dispatch planner' },
  approvedBy: { type: String, default: '' },
  approvedAt: { type: Date, default: null }
}, {
  timestamps: true
});

DispatchPlanSchema.index({ targetYear: -1, targetMonth: -1, status: 1 });

export default mongoose.models.DispatchPlan || mongoose.model('DispatchPlan', DispatchPlanSchema);
