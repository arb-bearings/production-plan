import mongoose from 'mongoose';

const ProductionPlanSchema = new mongoose.Schema({
  status: { type: String, enum: ['Draft', 'Approved'], default: 'Draft', index: true },
  growthRate: { type: Number, required: true },
  planningPeriod: { type: Number, required: true }, // N months
  startMonth: { type: Number, default: 8 }, // 1-12
  startYear: { type: Number, default: 2026 },
  finalMonthRuleUnder: { type: String, default: 'merge-backward' },
  finalMonthRuleOver: { type: String, default: 'split-retain' },
  minThresholds: { type: [Number], default: [] },
  gapMonth: { type: Number, default: null },
  dividingRatios: { type: [Number], default: [] },
  recentTotal: { type: Number },
  previousTotal: { type: Number },
  isRecentStronger: { type: Boolean },
  createdBy: { type: String, default: 'system' },
  approvedBy: { type: String, default: '' },
  approvedAt: { type: Date }
}, {
  timestamps: true
});

export default mongoose.models.ProductionPlan || mongoose.model('ProductionPlan', ProductionPlanSchema);
