const mongoose = require('mongoose');

const priceCacheSchema = new mongoose.Schema({
  // Unique identifier: setCode + cardNumber (e.g. "PAL-226")
  cardKey: { type: String, required: true, unique: true, index: true },
  
  // Card info
  cardName: { type: String, default: '' },
  cardNumber: { type: String, default: '' },
  rarity: { type: String, default: '' },
  setCode: { type: String, default: '', index: true },
  setName: { type: String, default: '' },
  cmApiId: { type: Number, default: 0 }, // cardmarket-api.com internal ID
  
  // Cardmarket prices (EUR)
  cm: {
    lowestNM: { type: Number, default: 0 },       // lowest_near_mint (global)
    lowestNM_FR: { type: Number, default: 0 },     // lowest_near_mint_FR
    lowestNM_DE: { type: Number, default: 0 },     // lowest_near_mint_DE
    lowestNM_ES: { type: Number, default: 0 },     // lowest_near_mint_ES
    lowestNM_IT: { type: Number, default: 0 },     // lowest_near_mint_IT
    avg30d: { type: Number, default: 0 },           // 30d_average
    avg7d: { type: Number, default: 0 },            // 7d_average
    avg1d: { type: Number, default: 0 },            // 1d_average
    trendPrice: { type: Number, default: 0 },       // trend price
  },
  
  // Raw cardmarket response (for debugging)
  cmRaw: { type: String, default: '' },
  
  // TCGPlayer prices (USD) — bonus
  tcg: {
    marketPrice: { type: Number, default: 0 },
    midPrice: { type: Number, default: 0 },
  },
  
  // Graded prices
  graded: {
    psa10: { type: Number, default: 0 },
    psa9: { type: Number, default: 0 },
    cgc10: { type: Number, default: 0 },
  },
  
  // Image URL from API
  imageUrl: { type: String, default: '' },
  
  // Computed best price (what we show to users)
  // Priority: FR price > avg7d > avg30d > lowestNM > 0
  bestPrice: { type: Number, default: 0 },
  
  // Metadata
  lastUpdated: { type: Date, default: Date.now },
  source: { type: String, default: 'cardmarket-api' },

}, { timestamps: true });

// Compute best price before saving
priceCacheSchema.pre('save', function(next) {
  const cm = this.cm;
  // Priority: trendPrice (what Cardmarket shows) > avg7d > avg30d > avg1d > FR lowest > global lowest
  this.bestPrice = cm.trendPrice || cm.avg7d || cm.avg30d || cm.avg1d || cm.lowestNM_FR || cm.lowestNM || 0;
  this.bestPrice = Math.round(this.bestPrice * 100) / 100;
  next();
});

// Static method: get price for a card by set+number
priceCacheSchema.statics.getPrice = async function(setCode, cardNumber) {
  const key = `${setCode}-${cardNumber}`;
  return this.findOne({ cardKey: key });
};

// Static method: get all prices for a set
priceCacheSchema.statics.getSetPrices = async function(setCode) {
  return this.find({ setCode }).lean();
};

const PriceCache = mongoose.model('PriceCache', priceCacheSchema);
module.exports = { PriceCache };
