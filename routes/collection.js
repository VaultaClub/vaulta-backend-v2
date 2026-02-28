const express = require('express');
const Card = require('../models/Card');
const User = require('../models/User');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const router = express.Router();

const RECYCLE_RATE = 0.4;
const SHIPPING_FEE = 4.99;

// GET /api/collection — Mes cartes
router.get('/', auth, async (req, res) => {
  try {
    const cards = await Card.find({ owner: req.user._id, status: 'stored' }).sort('-openedAt');
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/collection/recycle — Recycler des cartes
router.post('/recycle', auth, async (req, res) => {
  try {
    const { cardIds } = req.body;
    if (!cardIds?.length) return res.status(400).json({ error: 'Aucune carte sélectionnée' });

    const cards = await Card.find({ _id: { $in: cardIds }, owner: req.user._id, status: 'stored' });
    if (!cards.length) return res.status(404).json({ error: 'Cartes introuvables' });

    const totalValue = cards.reduce((sum, c) => sum + c.value, 0);
    const credit = Math.round(totalValue * RECYCLE_RATE * 100) / 100;

    // Mettre à jour les cartes
    await Card.updateMany({ _id: { $in: cards.map(c => c._id) } }, { status: 'recycled' });

    // Créditer l'utilisateur
    const user = await User.findById(req.user._id);
    user.balance += credit;
    user.xp += cards.length;
    user.updateLevel();
    await user.save();

    await Transaction.create({
      user: user._id, type: 'recycle', amount: credit,
      description: `♻️ ${cards.length} carte(s) recyclée(s)`
    });

    res.json({ credit, newBalance: user.balance, recycledCount: cards.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/collection/ship — Demander l'envoi
router.post('/ship', auth, async (req, res) => {
  try {
    const { cardIds, address } = req.body;
    if (!cardIds?.length) return res.status(400).json({ error: 'Aucune carte sélectionnée' });
    if (!address?.fullName || !address?.street || !address?.postalCode || !address?.city) {
      return res.status(400).json({ error: 'Adresse incomplète' });
    }

    const user = await User.findById(req.user._id);
    if (user.balance < SHIPPING_FEE) return res.status(400).json({ error: 'Solde insuffisant pour les frais d\'envoi' });

    const cards = await Card.find({ _id: { $in: cardIds }, owner: req.user._id, status: 'stored' });
    if (!cards.length) return res.status(404).json({ error: 'Cartes introuvables' });

    // Débiter les frais
    user.balance -= SHIPPING_FEE;
    await user.save();

    // Créer la commande
    const order = await Order.create({
      user: user._id,
      cards: cards.map(c => c._id),
      shippingFee: SHIPPING_FEE,
      address
    });

    // Marquer les cartes comme expédiées
    await Card.updateMany({ _id: { $in: cards.map(c => c._id) } }, { status: 'shipped' });

    await Transaction.create({
      user: user._id, type: 'shipping', amount: -SHIPPING_FEE,
      description: `📦 Envoi ${cards.length} carte(s)`,
      reference: order._id.toString()
    });

    res.json({ order, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
