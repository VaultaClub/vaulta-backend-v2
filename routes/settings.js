const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ========================
// Generic Settings Model (key-value store)
// ========================
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now }
});
const Setting = mongoose.model('Setting', settingSchema);

// ========================
// Helper: get/set
// ========================
async function getSetting(key, defaultVal = null) {
  const doc = await Setting.findOne({ key });
  return doc ? doc.value : defaultVal;
}
async function setSetting(key, value) {
  return Setting.findOneAndUpdate(
    { key },
    { key, value, updatedAt: new Date() },
    { upsert: true, new: true }
  );
}

// ========================
// GET /api/settings/:key — Get a setting
// ========================
router.get('/:key', async (req, res) => {
  try {
    const val = await getSetting(req.params.key, null);
    res.json({ key: req.params.key, value: val });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================
// PUT /api/settings/:key — Set a setting
// ========================
router.put('/:key', async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: 'Value required' });
    await setSetting(req.params.key, value);
    
    // Broadcast update via Socket.io
    const io = req.app.get('io');
    if (io) io.emit('settings:updated', { key: req.params.key });
    
    res.json({ key: req.params.key, value, ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================
// GET /api/settings — Get ALL settings (for initial load)
// ========================
router.get('/', async (req, res) => {
  try {
    const all = await Setting.find();
    const result = {};
    all.forEach(s => { result[s.key] = s.value; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================
// POST /api/settings/batch — Set multiple settings at once
// ========================
router.post('/batch', async (req, res) => {
  try {
    const { settings } = req.body; // { key1: value1, key2: value2, ... }
    if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'settings object required' });
    
    const ops = Object.entries(settings).map(([key, value]) =>
      Setting.findOneAndUpdate({ key }, { key, value, updatedAt: new Date() }, { upsert: true, new: true })
    );
    await Promise.all(ops);
    
    const io = req.app.get('io');
    if (io) io.emit('settings:batch_updated', { keys: Object.keys(settings) });
    
    res.json({ ok: true, count: Object.keys(settings).length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
