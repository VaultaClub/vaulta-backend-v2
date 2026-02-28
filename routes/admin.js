const express = require('express');
const User = require('../models/User');
const { Product, TCG, Series } = require('../models/Product');
const Card = require('../models/Card');
const Listing = require('../models/Listing');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Ticket = require('../models/Ticket');
const { auth, adminOnly } = require('../middleware/auth');
const router = express.Router();

// Tout admin requiert auth + adminOnly
router.use(auth, adminOnly);

// ========================
// DASHBOARD
// ========================
router.get('/dashboard', async (req, res) => {
  try {
    const [userCount, cardCount, orderCount, ticketOpen, revenue, listings] = await Promise.all([
      User.countDocuments(),
      Card.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Ticket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      Transaction.aggregate([{ $match: { type: 'purchase', amount: { $lt: 0 } } }, { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }]),
      Listing.countDocuments({ status: 'active' })
    ]);

    // Ventes des 7 derniers jours
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dailySales = await Transaction.aggregate([
      { $match: { type: 'purchase', amount: { $lt: 0 }, createdAt: { $gte: weekAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: { $abs: '$amount' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Activité récente
    const recentActivity = await Transaction.find().sort('-createdAt').limit(10).populate('user', 'username');

    res.json({
      stats: { users: userCount, cardsOpened: cardCount, revenue: revenue[0]?.total || 0, openTickets: ticketOpen, pendingOrders: orderCount, activeListings: listings },
      dailySales,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================
// STOCKS & PRODUITS
// ========================
router.get('/products', async (req, res) => {
  try {
    const { tcg } = req.query;
    const filter = {};
    if (tcg && tcg !== 'all') filter.tcg = tcg;
    const products = await Product.find(filter).populate('tcg series').sort('name');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/products/:id/stock', async (req, res) => {
  try {
    const { delta } = req.body; // +1, -1, +10, -5
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    product.stock = Math.max(0, product.stock + delta);
    await product.save();
    res.json({ stock: product.stock, name: product.name });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/products/:id/price', async (req, res) => {
  try {
    const { price } = req.body;
    if (!price || price <= 0) return res.status(400).json({ error: 'Prix invalide' });
    const product = await Product.findByIdAndUpdate(req.params.id, { price }, { new: true });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/products', async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création produit' });
  }
});

// ========================
// TCG & SÉRIES
// ========================
router.get('/tcgs', async (req, res) => {
  try {
    const tcgs = await TCG.find().sort('order');
    res.json(tcgs);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/tcgs', async (req, res) => {
  try {
    const tcg = await TCG.create(req.body);
    res.status(201).json(tcg);
  } catch (err) { res.status(500).json({ error: 'Erreur création TCG' }); }
});

router.post('/series', async (req, res) => {
  try {
    const series = await Series.create(req.body);
    res.status(201).json(series);
  } catch (err) { res.status(500).json({ error: 'Erreur création série' }); }
});

// ========================
// COMMANDES
// ========================
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const orders = await Order.find(filter).populate('user', 'username email').populate('cards').sort('-createdAt');
    res.json(orders);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/orders/:id/ship', async (req, res) => {
  try {
    const { trackingNumber } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    order.status = 'shipped';
    order.trackingNumber = trackingNumber || '';
    order.shippedAt = new Date();
    await order.save();
    res.json(order);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/orders/:id/deliver', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    order.status = 'delivered';
    order.deliveredAt = new Date();
    await order.save();
    await Card.updateMany({ _id: { $in: order.cards } }, { status: 'shipped' });
    res.json(order);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ========================
// UTILISATEURS
// ========================
router.get('/users', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [{ username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const total = await User.countDocuments(filter);
    const users = await User.find(filter).select('-password').sort('-createdAt').skip((page - 1) * limit).limit(Number(limit));
    res.json({ users, total, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { role, status, balance, xp, adminNote } = req.body;
    const updates = {};
    if (role) updates.role = role;
    if (status) updates.status = status;
    if (balance !== undefined) updates.balance = balance;
    if (xp !== undefined) updates.xp = xp;
    if (adminNote !== undefined) updates.adminNote = adminNote;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ========================
// SUPPORT
// ========================
router.get('/tickets', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const tickets = await Ticket.find(filter).populate('user', 'username email').sort('-createdAt');
    res.json(tickets);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/tickets/:id/respond', async (req, res) => {
  try {
    const { message, status } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
    if (message) ticket.messages.push({ sender: 'admin', senderName: req.user.username, content: message });
    if (status) ticket.status = status;
    if (status === 'resolved') ticket.resolvedAt = new Date();
    await ticket.save();
    res.json(ticket);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ========================
// FINANCE
// ========================
router.get('/finance', async (req, res) => {
  try {
    const [revenue, commissions, shipping] = await Promise.all([
      Transaction.aggregate([{ $match: { type: 'purchase', amount: { $lt: 0 } } }, { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }]),
      Transaction.aggregate([{ $match: { type: 'commission' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { type: 'shipping' } }, { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }])
    ]);

    const recentTransactions = await Transaction.find().sort('-createdAt').limit(20).populate('user', 'username');

    res.json({
      revenue: revenue[0]?.total || 0,
      commissions: commissions[0]?.total || 0,
      shippingRevenue: shipping[0]?.total || 0,
      recentTransactions
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ========================
// MARKETPLACE ADMIN
// ========================
router.get('/listings', async (req, res) => {
  try {
    const listings = await Listing.find().populate('card seller', 'username name rarity value').sort('-createdAt');
    res.json(listings);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/listings/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Annonce introuvable' });
    const card = await Card.findById(listing.card);
    if (card) { card.status = 'stored'; await card.save(); }
    listing.status = 'cancelled';
    await listing.save();
    res.json({ message: 'Annonce supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
