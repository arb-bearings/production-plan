import mongoose from 'mongoose';

const RecordSchema = new mongoose.Schema({
  unit: { type: String, required: true, index: true },
  month: { type: String, required: true },
  year: { type: Number, required: true, index: true },
  quarter: { type: String, required: true, index: true },
  partyName: { type: String, required: true },
  bearingNo: { type: String, required: true, index: true },
  category: { type: String, required: true, index: true },
  quantity: { type: Number, required: true },
  basicValue: { type: Number, default: 0 },
  withGstValue: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Compound index for duplicate checking
RecordSchema.index({ unit: 1, month: 1, year: 1, partyName: 1, bearingNo: 1 });
RecordSchema.index({ year: -1, month: 1 });

export default mongoose.models.Record || mongoose.model('Record', RecordSchema);
