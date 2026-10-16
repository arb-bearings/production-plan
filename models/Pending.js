import mongoose from 'mongoose';

const PendingSchema = new mongoose.Schema({
  bearingNo: { type: String, required: true, index: true },
  quantity: { type: Number, required: true, default: 0 },
  unit: { type: String, default: '' }
}, {
  timestamps: true
});

PendingSchema.index({ bearingNo: 1, unit: 1 });

export default mongoose.models.Pending || mongoose.model('Pending', PendingSchema);
