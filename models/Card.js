const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  rarity: { type: String, enum: ['common', 'uncommon', 'rare', 'ultra', 'secret'], required: true },
  value: { type: Number, required: true },
  imageUrl: { type: String, default: '' },
  emoji: { type: String, default: '🃏' },
  // Provenance
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String },
  tcgName: { type: String },
  seriesName: { type: String },
  boosterRef: { type: String, required: true }, // Réf unique du booster IRL
  videoUrl: { type: String, default: '' },       // Lien vidéo de l'ouverture
  openedAt: { type: Date, default: Date.now },    // Date/heure ouverture
  // Status
  status: { type: String, enum: ['stored', 'listed', 'sold', 'shipped', 'recycled'], default: 'stored' },
  createdAt: { type: Date, default: Date.now }
});

cardSchema.index({ owner: 1, status: 1 });
cardSchema.index({ boosterRef: 1 });

module.exports = mongoose.model('Card', cardSchema);
