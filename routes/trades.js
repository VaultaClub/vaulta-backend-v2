const express = require('express');
const { TradeListing, TradeOffer } = require('../models/Trade');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/trades — All active listings (paginated)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const filter = { status: 'active' };
    
    // Optional filters
    if (req.query.rarity && req.query.rarity !== 'all') {
      filter['cards.rarity'] = req.query.rarity;
    }
    if (req.query.search) {
      filter['cards.name'] = { $regex: req.query.search, $options: 'i' };
    }
    
    const [listings, total] = await Promise.all([
      TradeListing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      TradeListing.countDocuments(filter)
    ]);
    
    res.json({ listings, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/trades/mine — My listings
router.get('/mine', auth, async (req, res) => {
  try {
    const listings = await TradeListing.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ listings });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/trades/offers/mine — Offers I've received + sent
router.get('/offers/mine', auth, async (req, res) => {
  try {
    const [received, sent] = await Promise.all([
      TradeOffer.find({ toUserId: req.user._id }).sort({ createdAt: -1 }).limit(50),
      TradeOffer.find({ fromUserId: req.user._id }).sort({ createdAt: -1 }).limit(50),
    ]);
    res.json({ received, sent });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/trades — Create a trade listing
router.post('/', auth, async (req, res) => {
  try {
    const { cards, lookingFor, acceptMoney, minMoneyComp } = req.body;
    if (!cards || !cards.length) return res.status(400).json({ error: 'Sélectionnez au moins une carte' });
    if (cards.length > 10) return res.status(400).json({ error: 'Maximum 10 cartes par échange' });
    
    // Sanitize cards data
    const cleanCards = cards.map(c => ({
      cardId: String(c.cardId || ''),
      name: String(c.name || ''),
      img: String(c.img || ''),
      rarity: String(c.rarity || 'common'),
      rarityName: String(c.rarityName || ''),
      value: parseFloat(c.value) || 0,
      series: String(c.series || ''),
      cardNum: String(c.cardNum || ''),
      setOfficial: String(c.setOfficial || ''),
    }));
    
    const totalValue = cleanCards.reduce((s, c) => s + c.value, 0);
    
    const listing = await TradeListing.create({
      userId: req.user._id,
      username: req.user.username,
      userAvatar: req.user.avatar || '',
      cards: cleanCards,
      lookingFor: (lookingFor || '').slice(0, 500),
      acceptMoney: !!acceptMoney,
      minMoneyComp: acceptMoney ? (parseFloat(minMoneyComp) || 0) : 0,
      totalValue,
    });
    
    res.status(201).json({ listing });
  } catch (err) {
    console.error('Create trade error:', err.message, err.errors ? JSON.stringify(err.errors) : '');
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// DELETE /api/trades/:id — Cancel my listing
router.delete('/:id', auth, async (req, res) => {
  try {
    const listing = await TradeListing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Annonce introuvable' });
    if (listing.userId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Non autorisé' });
    
    listing.status = 'cancelled';
    await listing.save();
    
    // Cancel all pending offers
    await TradeOffer.updateMany({ listingId: listing._id, status: 'pending' }, { status: 'cancelled' });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/trades/:id/offer — Make an offer on a listing
router.post('/:id/offer', auth, async (req, res) => {
  try {
    const listing = await TradeListing.findById(req.params.id);
    if (!listing || listing.status !== 'active') return res.status(404).json({ error: 'Annonce non disponible' });
    if (listing.userId.toString() === req.user._id.toString()) return res.status(400).json({ error: 'Vous ne pouvez pas proposer sur votre propre annonce' });
    
    const { offeredCards, moneyOffer, message } = req.body;
    if ((!offeredCards || !offeredCards.length) && !moneyOffer) {
      return res.status(400).json({ error: 'Proposez des cartes ou une compensation' });
    }
    
    // Sanitize
    const cleanCards = (offeredCards || []).map(c => ({
      cardId: String(c.cardId || ''),
      name: String(c.name || ''),
      img: String(c.img || ''),
      rarity: String(c.rarity || 'common'),
      rarityName: String(c.rarityName || ''),
      value: parseFloat(c.value) || 0,
      series: String(c.series || ''),
      cardNum: String(c.cardNum || ''),
      setOfficial: String(c.setOfficial || ''),
    }));
    
    const offeredTotalValue = cleanCards.reduce((s, c) => s + c.value, 0) + (parseFloat(moneyOffer) || 0);
    
    const offer = await TradeOffer.create({
      listingId: listing._id,
      fromUserId: req.user._id,
      fromUsername: req.user.username,
      fromAvatar: req.user.avatar || '',
      toUserId: listing.userId,
      toUsername: listing.username,
      offeredCards: cleanCards,
      moneyOffer: parseFloat(moneyOffer) || 0,
      message: (message || '').slice(0, 300),
      offeredTotalValue,
    });
    
    // Notify listing owner via socket if available
    const io = req.app.get('io');
    if (io) {
      io.emit('trade:newOffer', { listingId: listing._id.toString(), toUserId: listing.userId.toString(), fromUsername: req.user.username });
    }
    
    res.status(201).json({ offer });
  } catch (err) {
    console.error('Trade offer error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/trades/:id/offers — Get offers for a listing (owner only)
router.get('/:id/offers', auth, async (req, res) => {
  try {
    const listing = await TradeListing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Annonce introuvable' });
    if (listing.userId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Non autorisé' });
    
    const offers = await TradeOffer.find({ listingId: listing._id }).sort({ createdAt: -1 });
    res.json({ offers });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/trades/offers/:offerId/respond — Accept or reject an offer
router.post('/offers/:offerId/respond', auth, async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: 'Action invalide' });
    
    const offer = await TradeOffer.findById(req.params.offerId);
    if (!offer) return res.status(404).json({ error: 'Offre introuvable' });
    if (offer.toUserId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Non autorisé' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'Offre déjà traitée' });
    
    offer.status = action === 'accept' ? 'accepted' : 'rejected';
    offer.respondedAt = new Date();
    await offer.save();
    
    if (action === 'accept') {
      // Mark listing as completed
      await TradeListing.updateOne({ _id: offer.listingId }, { status: 'completed' });
      // Reject all other pending offers
      await TradeOffer.updateMany(
        { listingId: offer.listingId, _id: { $ne: offer._id }, status: 'pending' },
        { status: 'rejected', respondedAt: new Date() }
      );
    }
    
    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.emit('trade:offerResponse', { offerId: offer._id.toString(), action, fromUserId: offer.fromUserId.toString(), toUserId: offer.toUserId.toString() });
    }
    
    res.json({ offer });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
