const express = require('express');
const Ticket = require('../models/Ticket');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/support — Mes tickets
router.get('/', auth, async (req, res) => {
  try {
    const tickets = await Ticket.find({ user: req.user._id }).sort('-createdAt');
    res.json(tickets);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/support — Créer un ticket
router.post('/', auth, async (req, res) => {
  try {
    const { subject, category, priority, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'Sujet et message requis' });
    const ticket = await Ticket.create({
      user: req.user._id, subject, category: category || 'other', priority: priority || 'medium',
      messages: [{ sender: 'user', senderName: req.user.username, content: message }]
    });
    res.status(201).json(ticket);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/support/:id/reply — Répondre à un ticket
router.post('/:id/reply', auth, async (req, res) => {
  try {
    const { message } = req.body;
    const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
    ticket.messages.push({ sender: 'user', senderName: req.user.username, content: message });
    if (ticket.status === 'waiting_user') ticket.status = 'in_progress';
    await ticket.save();
    res.json(ticket);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/support/notifications — Mes notifs
router.get('/notifications', auth, async (req, res) => {
  try {
    const notifs = await Notification.find({ user: req.user._id }).sort('-createdAt').limit(20);
    res.json(notifs);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/support/notifications/read — Marquer comme lues
router.put('/notifications/read', auth, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: 'ok' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
