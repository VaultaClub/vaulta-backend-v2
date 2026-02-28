const express = require('express');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/wallet/balance
router.get('/balance', auth, async (req, res) => {
  res.json({ balance: req.user.balance });
});

// GET /api/wallet/transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const total = await Transaction.countDocuments({ user: req.user._id });
    const transactions = await Transaction.find({ user: req.user._id })
      .sort('-createdAt')
      .skip((page - 1) * limit).limit(Number(limit));
    res.json({ transactions, total, pages: Math.ceil(total / limit), page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/wallet/create-payment — Créer une session Stripe
router.post('/create-payment', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Montant minimum 1€' });

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Dépôt Vaulta Club — ${amount}€` },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.SITE_URL}/wallet?success=true&amount=${amount}`,
      cancel_url: `${process.env.SITE_URL}/wallet?cancelled=true`,
      metadata: { userId: req.user._id.toString(), amount: amount.toString() }
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Erreur Stripe:', err);
    res.status(500).json({ error: 'Erreur paiement' });
  }
});

// POST /api/wallet/webhook — Stripe webhook (appelé par Stripe)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata.userId;
      const amount = parseFloat(session.metadata.amount);

      const user = await User.findById(userId);
      if (user) {
        user.balance += amount;
        await user.save();

        await Transaction.create({
          user: userId, type: 'deposit', amount,
          description: `Dépôt ${amount.toFixed(2)}€`,
          reference: session.payment_intent
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(400).json({ error: 'Webhook error' });
  }
});

module.exports = router;
