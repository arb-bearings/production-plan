import mongoose from 'mongoose';

const StockSchema = new mongoose.Schema({
  bearingNo: { type: String, required: true, unique: true, index: true },
  quantity: { type: Number, required: true }
}, {
  timestamps: true
});

export default mongoose.models.Stock || mongoose.model('Stock', StockSchema);
