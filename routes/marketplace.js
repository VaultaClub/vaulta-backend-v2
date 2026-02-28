const express = require('express');
const Listing = require('../models/Listing');
const Card = require('../models/Card');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const router = express.Router();

const COMMISSION_RATE = 0.08;

// GET /api/marketplace — Annonces actives
router.get('/', async (req, res) => {
  try {
    const { tcg, series, rarity, sort, page = 1, limit = 20 } = req.query;
    const filter = { status: 'active' };
    const cardFilter = {};
    if (rarity) cardFilter.rarity = rarity;

    let listings = await Listing.find(filter)
      .populate({ path: 'card', match: cardFilter })
      .populate('seller', 'username')
      .sort(sort === 'asc' ? 'price' : sort === 'desc' ? '-price' : '-featured -createdAt')
      .skip((page - 1) * limit).limit(limit);

    // Filtrer les nulls (quand le populate card ne match pas)
    listings = listings.filter(l => l.card);
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/marketplace/sell — Mettre en vente
router.post('/sell', auth, async (req, res) => {
  try {
    const { cardId, price } = req.body;
    if (!price || price <= 0) return res.status(400).json({ error: 'Prix invalide' });

    const card = await Card.findOne({ _id: cardId, owner: req.user._id, status: 'stored' });
    if (!card) return res.status(404).json({ error: 'Carte introuvable ou non disponible' });

    card.status = 'listed';
    await card.save();

    const listing = await Listing.create({ card: card._id, seller: req.user._id, price });
    res.json(listing);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/marketplace/buy/:listingId — Acheter
router.post('/buy/:listingId', auth, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.listingId).populate('card seller');
    if (!listing || listing.status !== 'active') return res.status(404).json({ error: 'Annonce introuvable' });
    if (listing.seller._id.equals(req.user._id)) return res.status(400).json({ error: 'Vous ne pouvez pas acheter votre propre carte' });

    const effectivePrice = listing.finalPrice || listing.price;
    const buyer = await User.findById(req.user._id);
    if (buyer.balance < effectivePrice) return res.status(400).json({ error: 'Solde insuffisant' });

    const commission = Math.round(effectivePrice * COMMISSION_RATE * 100) / 100;
    const sellerReceives = effectivePrice - commission;

    // Transactions
    buyer.balance -= effectivePrice;
    buyer.xp += 5;
    buyer.updateLevel();
    await buyer.save();

    const seller = await User.findById(listing.seller._id);
    seller.balance += sellerReceives;
    seller.xp += 10;
    seller.updateLevel();
    await seller.save();

    // Transférer la carte
    const card = listing.card;
    card.owner = buyer._id;
    card.status = 'stored';
    await card.save();

    listing.status = 'sold';
    listing.buyer = buyer._id;
    listing.soldAt = new Date();
    await listing.save();

    // Transactions financières
    await Transaction.create({ user: buyer._id, type: 'purchase', amount: -effectivePrice, description: `Marché: ${card.name}`, reference: listing._id.toString() });
    await Transaction.create({ user: seller._id, type: 'sale', amount: sellerReceives, description: `Vente: ${card.name} (${commission.toFixed(2)}€ commission)`, reference: listing._id.toString() });

    // Notifications
    await Notification.create({ user: seller._id, type: 'sale', title: 'Carte vendue !', message: `${card.name} vendu pour ${effectivePrice.toFixed(2)}€ (${sellerReceives.toFixed(2)}€ après commission)` });

    res.json({ newBalance: buyer.balance, card });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/marketplace/negotiate/:listingId — Faire une offre
router.post('/negotiate/:listingId', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Montant invalide' });

    const listing = await Listing.findById(req.params.listingId).populate('card seller');
    if (!listing || listing.status !== 'active') return res.status(404).json({ error: 'Annonce introuvable' });

    listing.negotiations.push({ buyer: req.user._id, amount });
    await listing.save();

    // Notifier le vendeur
    await Notification.create({
      user: listing.seller._id, type: 'negotiation', title: 'Nouvelle offre',
      message: `${req.user.username} propose ${amount.toFixed(2)}€ pour ${listing.card.name}`,
      link: `/marketplace/${listing._id}`
    });

    res.json({ message: 'Offre envoyée' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/marketplace/respond/:listingId/:negoId — Répondre à une offre (vendeur)
router.post('/respond/:listingId/:negoId', auth, async (req, res) => {
  try {
    const { accept } = req.body;
    const listing = await Listing.findById(req.params.listingId);
    if (!listing || !listing.seller.equals(req.user._id)) return res.status(403).json({ error: 'Non autorisé' });

    const nego = listing.negotiations.id(req.params.negoId);
    if (!nego) return res.status(404).json({ error: 'Offre introuvable' });

    if (accept) {
      nego.status = 'accepted';
      listing.finalPrice = nego.amount;
      await Notification.create({ user: nego.buyer, type: 'negotiation', title: 'Offre acceptée !', message: `Votre offre de ${nego.amount.toFixed(2)}€ a été acceptée !` });
    } else {
      nego.status = 'refused';
      await Notification.create({ user: nego.buyer, type: 'negotiation', title: 'Offre refusée', message: `Votre offre de ${nego.amount.toFixed(2)}€ a été refusée.` });
    }

    await listing.save();
    res.json({ listing });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
