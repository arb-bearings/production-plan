import mongoose from 'mongoose';

const DepotDispatchConfigSchema = new mongoose.Schema({
  depot: { type: String, required: true, unique: true, index: true },
  dispatch1: { type: Number, default: 25 },
  dispatch2: { type: Number, default: 25 },
  dispatch3: { type: Number, default: 25 },
  dispatch4: { type: Number, default: 25 }
}, {
  timestamps: true
});

export default mongoose.models.DepotDispatchConfig || mongoose.model('DepotDispatchConfig', DepotDispatchConfigSchema);
