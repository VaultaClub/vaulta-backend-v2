const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'purchase', 'sale', 'commission', 'recycle', 'shipping', 'refund'], required: true },
  amount: { type: Number, required: true }, // Positif = crédit, négatif = débit
  description: { type: String, required: true },
  reference: { type: String, default: '' }, // Référence Stripe ou interne
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

transactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
