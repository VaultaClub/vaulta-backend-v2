const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Card' }],
  shippingFee: { type: Number, default: 4.99 },
  address: {
    fullName: { type: String, required: true },
    street: { type: String, required: true },
    postalCode: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, default: 'France' }
  },
  trackingNumber: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'shipped', 'delivered', 'dispute'], default: 'pending' },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
