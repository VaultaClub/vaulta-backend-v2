const mongoose = require('mongoose');

// === Franchise TCG (Pokémon, One Piece, Yu-Gi-Oh, etc.) ===
const tcgSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// === Série (Écarlate & Violet, etc.) ===
const seriesSchema = new mongoose.Schema({
  name: { type: String, required: true },
  tcg: { type: String, default: 'pokemon' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// === Carte dans le pool d'un produit ===
const cardPoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  r: { type: String, enum: ['common', 'uncommon', 'rare', 'ultra', 'secret'], default: 'common' },
  v: { type: Number, default: 0.2 },
  e: { type: String, default: '🃏' },
  img: { type: String, default: '' },
  imgLow: { type: String, default: '' },
  localId: { type: String, default: '' },
  tcgId: { type: String, default: '' },
  cmPrice: { type: Number, default: 0 },
  cmTrend: { type: Number, default: 0 },
  cmLow: { type: Number, default: 0 },
  cmAvg1: { type: Number, default: 0 },
  cmAvg7: { type: Number, default: 0 },
  cmAvg30: { type: Number, default: 0 },
  cmUpdated: { type: String, default: '' },
  cmSource: { type: String, default: '' },
  priceNormal: { type: Number, default: 0 },
  priceHolo: { type: Number, default: 0 },
  lowNormal: { type: Number, default: 0 },
  lowHolo: { type: Number, default: 0 },
  variants: { type: mongoose.Schema.Types.Mixed, default: null },
  rarityName: { type: String, default: '' },
  category: { type: String, default: '' },
  cardNum: { type: String, default: '' },
  setTotal: { type: Number, default: 0 },
  setOfficial: { type: Number, default: 0 }
}, { _id: false, strict: false });

// === Produit (Booster) ===
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fr: { type: String, default: 'pokemon' },
  sub: { type: String, default: '' },
  series: { type: String, default: '' },
  price: { type: Number, required: true },
  cards: { type: Number, default: 10 },
  stock: { type: Number, default: 0 },
  badge: { type: String, default: null },
  badgeText: { type: String, default: null },
  grad: { type: String, default: 'linear-gradient(135deg, #6366f1, #7c3aed)' },
  emoji: { type: String, default: '🎴' },
  logoUrl: { type: String, default: '' },
  boosterImg: { type: String, default: '' },
  tcgdexId: { type: String, default: '' },
  pool: [cardPoolSchema],
  poolLoaded: { type: Boolean, default: false },
  poolLoadedAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const TCG = mongoose.model('TCG', tcgSchema);
const Series = mongoose.model('Series', seriesSchema);
const Product = mongoose.model('Product', productSchema);

module.exports = { TCG, Series, Product };
