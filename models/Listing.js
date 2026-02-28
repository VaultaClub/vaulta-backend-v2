const mongoose = require('mongoose');

const negotiationSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'refused'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const listingSchema = new mongoose.Schema({
  card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  price: { type: Number, required: true },
  finalPrice: { type: Number }, // Prix après négociation acceptée
  featured: { type: Boolean, default: false },
  featuredUntil: { type: Date },
  negotiations: [negotiationSchema],
  status: { type: String, enum: ['active', 'sold', 'cancelled'], default: 'active' },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  soldAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

listingSchema.index({ status: 1 });
listingSchema.index({ seller: 1 });

module.exports = mongoose.model('Listing', listingSchema);
