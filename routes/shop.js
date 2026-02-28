const express = require('express');
const { Product, TCG, Series } = require('../models/Product');
const Card = require('../models/Card');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Générer une réf unique de booster
const genBoosterRef = () => 'VLT-' + Math.random().toString(36).substr(2, 4).toUpperCase() + '-' + Math.floor(Math.random() * 9000 + 1000);

// Tirage aléatoire d'une carte selon les poids de rareté
const drawCard = (pool) => {
  const weights = { common: 50, uncommon: 25, rare: 15, ultra: 7, secret: 3 };
  const weighted = pool.flatMap(c => Array(weights[c.rarity] || 10).fill(c));
  return weighted[Math.floor(Math.random() * weighted.length)];
};

// GET /api/shop/products — Liste des produits
router.get('/products', async (req, res) => {
  try {
    const { tcg, series } = req.query;
    const filter = { active: true };
    if (tcg) filter.tcg = tcg;
    if (series) filter.series = series;
    const products = await Product.find(filter).populate('tcg series').sort('name');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/shop/tcgs — Liste des franchises
router.get('/tcgs', async (req, res) => {
  try {
    const tcgs = await TCG.find({ active: true }).sort('order');
    res.json(tcgs);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/shop/series/:tcgId — Séries d'un TCG
router.get('/series/:tcgId', async (req, res) => {
  try {
    const series = await Series.find({ tcg: req.params.tcgId, active: true }).sort('order');
    res.json(series);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/shop/buy — Acheter & ouvrir des boosters
router.post('/buy', auth, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    if (quantity < 1 || quantity > 10) return res.status(400).json({ error: 'Quantité entre 1 et 10' });

    const product = await Product.findById(productId).populate('tcg series');
    if (!product || !product.active) return res.status(404).json({ error: 'Produit introuvable' });
    if (product.stock < quantity) return res.status(400).json({ error: 'Stock insuffisant' });

    const totalCost = product.price * quantity;
    const user = await User.findById(req.user._id);
    if (user.balance < totalCost) return res.status(400).json({ error: 'Solde insuffisant' });

    // Débit
    user.balance -= totalCost;
    user.xp += quantity * 10;
    user.updateLevel();
    product.stock -= quantity;

    // Tirage des cartes
    const cards = [];
    const openedAt = new Date();

    for (let b = 0; b < quantity; b++) {
      const boosterRef = genBoosterRef();
      for (let c = 0; c < product.cardsPerPack; c++) {
        const drawn = drawCard(product.cardPool);
        cards.push({
          owner: user._id,
          name: drawn.name,
          rarity: drawn.rarity,
          value: drawn.value,
          imageUrl: drawn.imageUrl,
          emoji: drawn.emoji,
          product: product._id,
          productName: product.name,
          tcgName: product.tcg.name,
          seriesName: product.series.name,
          boosterRef,
          videoUrl: '', // À remplir par l'admin avec la vraie vidéo
          openedAt
        });
      }
    }

    const savedCards = await Card.insertMany(cards);
    await user.save();
    await product.save();

    // Transaction
    await Transaction.create({
      user: user._id,
      type: 'purchase',
      amount: -totalCost,
      description: `${quantity}x Booster ${product.name}`,
      metadata: { productId: product._id, quantity, boosterRefs: [...new Set(cards.map(c => c.boosterRef))] }
    });

    // Trier par rareté (communes d'abord)
    const rarityOrder = { common: 0, uncommon: 1, rare: 2, ultra: 3, secret: 4 };
    savedCards.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

    res.json({
      cards: savedCards,
      newBalance: user.balance,
      xp: user.xp,
      level: user.level
    });
  } catch (err) {
    console.error('Erreur achat:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
