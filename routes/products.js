const express = require('express');
const { Product } = require('../models/Product');
const router = express.Router();

// ========================
// TCGdex helpers — V9 pricing logic
// ========================
const typeEmojis = {
  'Grass':'🌿','Fire':'🔥','Water':'💧','Lightning':'⚡','Psychic':'🔮',
  'Fighting':'👊','Darkness':'🌙','Metal':'⚙️','Fairy':'🧚','Dragon':'🐉',
  'Colorless':'⭐','Obscurité':'🌙','Fée':'🧚','Feu':'🔥','Eau':'💧',
  'Plante':'🌿','Électrique':'⚡','Psy':'🔮','Combat':'👊','Métal':'⚙️','Incolore':'⭐'
};
const rarMap = {
  'Common':'common','Uncommon':'uncommon','Rare':'rare',
  'Ultra Rare':'ultra','Secret Rare':'secret','Illustration Rare':'ultra',
  'Special Illustration Rare':'secret','Hyper Rare':'secret','Double Rare':'rare',
  'Amazing Rare':'ultra','Shiny Rare':'rare','Shiny Ultra Rare':'ultra',
  'ACE SPEC Rare':'ultra','Commune':'common','Peu Commune':'uncommon',
  'Peu commune':'uncommon','Secrète Rare':'secret'
};
const valByRar = { common: 0.2, uncommon: 1, rare: 5, ultra: 12, secret: 35 };

async function fetchTcgdexPool(setId) {
  const fetch = (await import('node-fetch')).default;
  
  console.log(`⏳ TCGdex: Fetching set ${setId}...`);
  const res = await fetch(`https://api.tcgdex.net/v2/fr/sets/${setId}`);
  if (!res.ok) throw new Error(`Set ${setId} not found on TCGdex`);
  const data = await res.json();
  if (!data.cards || !data.cards.length) throw new Error(`No cards for ${setId}`);

  const sPrefix = setId.startsWith('sv') ? 'sv' : setId.startsWith('swsh') ? 'swsh' : 'xy';
  
  // Extract official card count from set-level data
  const setCardCount = data.cardCount || {};
  const officialCount = setCardCount.official || setCardCount.total || data.cards.length;
  const totalCount = setCardCount.total || data.cards.length;
  console.log(`  📊 Set ${setId}: ${data.cards.length} cards, official=${officialCount}, total=${totalCount}`);

  const pool = data.cards.map(c => {
    const imgBase = c.image || `https://assets.tcgdex.net/fr/${sPrefix}/${setId}/${c.localId}`;
    return {
      name: c.name,
      r: 'common',
      e: '🃏',
      v: valByRar.common,
      img: imgBase + '/high.png',
      imgLow: imgBase + '/low.png',
      localId: String(c.localId),
      tcgId: c.id || `${setId}-${c.localId}`,
      cardNum: String(c.localId),
      setTotal: totalCount,
      setOfficial: officialCount
    };
  }).filter(c => c.name);

  // Fetch individual card details in batches
  const BATCH = 40;
  const DELAY = 30;
  let loaded = 0;

  for (let b = 0; b < pool.length; b += BATCH) {
    const batch = pool.slice(b, b + BATCH);
    await Promise.all(batch.map(async (c, i) => {
      try {
        await new Promise(r => setTimeout(r, i * DELAY));
        const dRes = await fetch(`https://api.tcgdex.net/v2/fr/sets/${setId}/${c.localId}`);
        if (!dRes.ok) return;
        const d = await dRes.json();

        // Basic info
        if (d.rarity) { c.r = rarMap[d.rarity] || 'common'; c.rarityName = d.rarity; }
        if (d.types && d.types[0]) c.e = typeEmojis[d.types[0]] || '🃏';
        if (d.category) c.category = d.category;
        if (d.category === 'Trainer') c.e = '📋';
        if (d.category === 'Energy') c.e = '⚡';
        if (d.name) c.name = d.name;
        if (d.variants) c.variants = d.variants;

        // Card numbering — already set from initial mapping, but individual card may have more precise data
        if (d.set && d.set.cardCount) {
          c.setTotal = d.set.cardCount.total || c.setTotal;
          c.setOfficial = d.set.cardCount.official || d.set.cardCount.total || c.setOfficial;
        }

        // ====== V9+ PRICING LOGIC ======
        const cm = d.cardmarket || (d.pricing && d.pricing.cardmarket) || (d.pricing && d.pricing['cardmarket']) || null;
        const tp = d.tcgplayer || (d.pricing && d.pricing.tcgplayer) || (d.pricing && d.pricing['tcgplayer']) || null;

        // Detect if this card is beyond official set count (secret/illustration rare)
        const numId = parseInt(c.localId);
        const isBeyondOfficial = !isNaN(numId) && officialCount > 0 && numId > officialCount;

        if (cm) {
          const trendNorm = cm.trend || 0;
          const trendHolo = cm['trend-holo'] || 0;
          const avgNorm = cm.avg || 0;
          const avgHolo = cm['avg-holo'] || 0;
          const lowNorm = cm.low || 0;
          const lowHolo = cm['low-holo'] || 0;
          const avg1 = cm['avg1'] || 0;
          const avg7 = cm['avg7'] || 0;
          const avg1Holo = cm['avg1-holo'] || 0;
          const avg7Holo = cm['avg7-holo'] || 0;

          // Determine if this card should use holo/special prices
          let isHoloVariant = false;
          if (['common', 'uncommon'].includes(c.r) && !isBeyondOfficial) {
            isHoloVariant = false; // Never holo for regular commons/uncommons
          } else if (isBeyondOfficial || ['secret'].includes(c.r)) {
            isHoloVariant = true; // Cards beyond official count are always special
          } else if (['ultra', 'rare'].includes(c.r)) {
            isHoloVariant = (d.variants && d.variants.holo === true && d.variants.normal === false) ||
              (trendHolo > trendNorm * 3 && trendHolo > 2);
          }

          const bestTrend = isHoloVariant ? Math.max(trendNorm, trendHolo) : (trendNorm || trendHolo);
          const bestAvg = isHoloVariant ? Math.max(avgNorm, avgHolo) : (avgNorm || avgHolo);
          const bestRecent = isHoloVariant
            ? Math.max(avg1, avg1Holo) || Math.max(avg7, avg7Holo)
            : (avg1 || avg7);

          c.cmPrice = bestRecent || bestTrend || bestAvg || cm['avg30'] || 0;
          c.cmTrend = bestTrend || 0;
          c.cmLow = isHoloVariant ? Math.max(lowNorm, lowHolo) : (lowNorm || lowHolo);
          c.cmAvg1 = isHoloVariant ? Math.max(avg1, avg1Holo) : (avg1 || 0);
          c.cmAvg7 = isHoloVariant ? Math.max(avg7, avg7Holo) : (avg7 || 0);
          c.cmAvg30 = cm['avg30'] || (isHoloVariant ? cm['avg30-holo'] : 0) || 0;
          c.cmUpdated = cm.updated || cm.updatedAt || '';
          c.cmSource = 'cardmarket';

          c.priceNormal = avg1 || avg7 || trendNorm || 0;
          c.priceHolo = avg1Holo || avg7Holo || trendHolo || 0;
          c.lowNormal = lowNorm;
          c.lowHolo = lowHolo;

          // Sanity check: if price is suspiciously low for the rarity, use rarity fallback
          const minExpected = { common: 0, uncommon: 0.2, rare: 0.5, ultra: 2, secret: 5 };
          if (c.cmPrice < (minExpected[c.r] || 0) && isBeyondOfficial) {
            // TCGdex probably returned wrong price for this special card
            c.v = valByRar[c.r] || 5;
            c.cmPrice = 0; // Mark as unreliable
            c.cmSource = 'fallback';
          } else {
            c.v = c.cmPrice > 0 ? Math.round(c.cmPrice * 100) / 100 : valByRar[c.r] || 0.2;
          }
        } else if (tp) {
          const usd = tp.mid || tp.low || tp.market || 0;
          const eur = Math.round(usd * 0.92 * 100) / 100;
          c.cmPrice = eur;
          c.cmTrend = eur;
          c.cmLow = Math.round((tp.low || 0) * 0.92 * 100) / 100;
          c.cmSource = 'tcgplayer';
          c.v = eur > 0 ? eur : valByRar[c.r] || 0.2;
        } else {
          c.v = Math.round((valByRar[c.r] + Math.random() * valByRar[c.r] * 0.3) * 100) / 100;
        }

        loaded++;
      } catch (e) { /* skip card */ }
    }));

    const progress = Math.round((b + batch.length) / pool.length * 100);
    console.log(`  ⏳ ${setId}: ${loaded}/${pool.length} cards (${progress}%)`);
  }

  const withPrices = pool.filter(c => c.cmPrice > 0).length;
  console.log(`✅ TCGdex: ${pool.length} cards loaded for ${setId} (${withPrices} with prices)`);
  return pool;
}

// ========================
// PUBLIC: GET all products (for shop listing — lightweight, no pool)
// ========================
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({ active: true }).sort('order name');
    
    const result = products.map(p => {
      const obj = p.toObject();
      // Include pool count but not full pool data (too heavy for listing)
      obj.poolCount = (obj.pool && obj.pool.length) || 0;
      obj.poolReady = p.poolLoaded;
      delete obj.pool; // Remove heavy pool data from listing
      return obj;
    });
    
    res.json(result);
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================
// PUBLIC: GET single product with full pool
// ========================
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================
// PUBLIC: GET pool only (lazy load when opening booster)
// ========================
router.get('/:id/pool', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('pool poolLoaded name tcgdexId');
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    
    // Check if pool needs refresh: not loaded, OR loaded but missing cardNum (old format)
    const needsRefresh = !product.poolLoaded || 
      (product.pool && product.pool.length > 0 && !product.pool[0].cardNum);
    
    if (needsRefresh && product.tcgdexId) {
      try {
        console.log(`🔄 Auto-refresh pool for ${product.name} (missing cardNum)`);
        const pool = await fetchTcgdexPool(product.tcgdexId);
        product.pool = pool;
        product.poolLoaded = true;
        product.poolLoadedAt = new Date();
        await product.save();
      } catch (e) {
        console.error(`Failed to load pool for ${product.name}:`, e.message);
        // If we have an old pool, still return it
        if (product.pool && product.pool.length > 0) {
          return res.json({ pool: product.pool, poolLoaded: true });
        }
        return res.status(503).json({ error: 'Chargement en cours, réessayez' });
      }
    }
    
    res.json({ pool: product.pool, poolLoaded: product.poolLoaded });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================
// ADMIN: Create product
// ========================
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    if (product.tcgdexId) {
      try {
        const pool = await fetchTcgdexPool(product.tcgdexId);
        product.pool = pool;
        product.poolLoaded = true;
        product.poolLoadedAt = new Date();
      } catch (e) {
        console.error(`TCGdex fetch failed for ${product.tcgdexId}:`, e.message);
      }
    }
    await product.save();
    const io = req.app.get('io');
    if (io) io.emit('product:created', { id: product._id, name: product.name });
    res.status(201).json(product);
  } catch (err) {
    console.error('POST /products error:', err);
    res.status(500).json({ error: 'Erreur création produit' });
  }
});

// ========================
// ADMIN: Update product
// ========================
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    const oldTcgdexId = product.tcgdexId;
    Object.assign(product, req.body);
    if (req.body.tcgdexId && req.body.tcgdexId !== oldTcgdexId) {
      try {
        const pool = await fetchTcgdexPool(req.body.tcgdexId);
        product.pool = pool;
        product.poolLoaded = true;
        product.poolLoadedAt = new Date();
      } catch (e) {
        console.error(`TCGdex fetch failed for ${req.body.tcgdexId}:`, e.message);
      }
    }
    await product.save();
    const io = req.app.get('io');
    if (io) io.emit('product:updated', { id: product._id, name: product.name });
    res.json(product);
  } catch (err) {
    console.error('PUT /products error:', err);
    res.status(500).json({ error: 'Erreur modification produit' });
  }
});

// ========================
// ADMIN: Delete product
// ========================
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    const io = req.app.get('io');
    if (io) io.emit('product:deleted', { id: req.params.id });
    res.json({ message: 'Produit supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

// ========================
// ADMIN: Force refresh TCGdex pool
// ========================
router.post('/:id/refresh-pool', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    if (!product.tcgdexId) return res.status(400).json({ error: 'Pas de tcgdexId' });
    const pool = await fetchTcgdexPool(product.tcgdexId);
    product.pool = pool;
    product.poolLoaded = true;
    product.poolLoadedAt = new Date();
    await product.save();
    res.json({ message: `${pool.length} cartes chargées`, poolCount: pool.length });
  } catch (err) {
    console.error('Refresh pool error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
