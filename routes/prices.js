const express = require('express');
const router = express.Router();
const { syncSetPrices, syncAllProducts, applyPricesToPool, loadEpisodes, getSyncStatus, TCGDEX_TO_CMAPI } = require('../services/priceSync');
const { PriceCache } = require('../models/PriceCache');
const { Product } = require('../models/Product');

// ========================
// PUBLIC: Get sync status
// ========================
router.get('/status', async (req, res) => {
  try {
    const status = await getSyncStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// PUBLIC: Get prices for a set (from cache)
// ========================
router.get('/set/:setCode', async (req, res) => {
  try {
    const prices = await PriceCache.find({ setCode: req.params.setCode.toUpperCase() })
      .select('cardKey cardName cardNumber rarity bestPrice cm.avg7d cm.avg30d cm.lowestNM_FR')
      .lean();
    res.json(prices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// PUBLIC: Get price for a specific card (with raw data for debugging)
// ========================
router.get('/card/:setCode/:cardNumber', async (req, res) => {
  try {
    const price = await PriceCache.getPrice(
      req.params.setCode.toUpperCase(), 
      req.params.cardNumber
    );
    if (!price) return res.status(404).json({ error: 'Prix non trouvé' });
    res.json(price);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// DEBUG: See raw API data for a card
// ========================
router.get('/debug/:setCode/:cardNumber', async (req, res) => {
  try {
    const price = await PriceCache.findOne({ 
      cardKey: `${req.params.setCode.toUpperCase()}-${req.params.cardNumber}` 
    });
    if (!price) return res.status(404).json({ error: 'Prix non trouvé' });
    res.json({
      cardKey: price.cardKey,
      cardName: price.cardName,
      rarity: price.rarity,
      bestPrice: price.bestPrice,
      cm: price.cm,
      cmRaw: price.cmRaw ? JSON.parse(price.cmRaw) : null,
      lastUpdated: price.lastUpdated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// ADMIN: List available episodes from CM-API
// ========================
router.get('/episodes', async (req, res) => {
  try {
    const episodes = await loadEpisodes();
    res.json({ 
      episodes, 
      mappings: TCGDEX_TO_CMAPI,
      totalEpisodes: Object.keys(episodes).length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// ADMIN: Sync prices for a single set
// ========================
router.post('/sync/:tcgdexId', async (req, res) => {
  try {
    const result = await syncSetPrices(req.params.tcgdexId);
    
    // Also apply prices to the product's pool
    const product = await Product.findOne({ tcgdexId: req.params.tcgdexId });
    if (product && product.pool && product.pool.length > 0) {
      const applied = await applyPricesToPool(product);
      await product.save();
      result.appliedToPool = applied;
    }
    
    // Notify via socket
    const io = req.app.get('io');
    if (io) io.emit('prices:synced', result);
    
    res.json(result);
  } catch (err) {
    console.error('Price sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// ADMIN: Sync ALL products (daily cron equivalent)
// ========================
router.post('/sync-all', async (req, res) => {
  try {
    res.json({ message: 'Sync démarré en arrière-plan...' });
    
    // Run in background (don't block the response)
    setImmediate(async () => {
      try {
        const results = await syncAllProducts();
        
        // Apply prices to all product pools
        const products = await Product.find({ active: true, tcgdexId: { $ne: '' } });
        for (const product of products) {
          if (product.pool && product.pool.length > 0) {
            await applyPricesToPool(product);
            await product.save();
          }
        }
        
        const io = req.app.get('io');
        if (io) io.emit('prices:sync-complete', { results });
        
        console.log('🏁 Full price sync + apply complete');
      } catch (e) {
        console.error('Background sync error:', e);
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// ADMIN: Apply cached prices to a product's pool (no API call)
// ========================
router.post('/apply/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    
    const applied = await applyPricesToPool(product);
    if (applied > 0) {
      await product.save();
    }
    
    res.json({ applied, productName: product.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
