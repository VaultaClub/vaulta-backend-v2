const mongoose = require('mongoose');

// A trade listing: user publishes cards they want to trade
const tradeListingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  userAvatar: { type: String, default: '' },
  // Cards offered for trade
  cards: [{
    cardId: String,        // ID in user's collection
    name: String,
    img: String,
    rarity: String,        // common, uncommon, rare, ultra, secret
    rarityName: String,    // Display name
    value: Number,         // Estimated value
    series: String,
    cardNum: String,
    setOfficial: String,
  }],
  // What the user is looking for (text description or specific cards)
  lookingFor: { type: String, default: '' },
  // Accept compensation in €?
  acceptMoney: { type: Boolean, default: false },
  minMoneyComp: { type: Number, default: 0 }, // Minimum € compensation
  
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  totalValue: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// A trade offer: someone proposes a trade on a listing
const tradeOfferSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'TradeListing', required: true },
  // Who is making the offer
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromUsername: { type: String, required: true },
  fromAvatar: { type: String, default: '' },
  // Who owns the listing
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUsername: { type: String, required: true },
  // Cards offered in exchange
  offeredCards: [{
    cardId: String,
    name: String,
    img: String,
    rarity: String,
    rarityName: String,
    value: Number,
    series: String,
    cardNum: String,
    setOfficial: String,
  }],
  // Money compensation (optional)
  moneyOffer: { type: Number, default: 0 },
  // Message from the proposer
  message: { type: String, default: '' },
  
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending' },
  
  offeredTotalValue: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date },
});

tradeListingSchema.index({ userId: 1, status: 1 });
tradeListingSchema.index({ status: 1, createdAt: -1 });
tradeOfferSchema.index({ listingId: 1 });
tradeOfferSchema.index({ fromUserId: 1 });
tradeOfferSchema.index({ toUserId: 1 });

const TradeListing = mongoose.model('TradeListing', tradeListingSchema);
const TradeOffer = mongoose.model('TradeOffer', tradeOfferSchema);

module.exports = { TradeListing, TradeOffer };
