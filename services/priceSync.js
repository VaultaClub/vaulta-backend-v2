/**
 * Price Sync Service
 * Fetches card prices from cardmarket-api.com (via RapidAPI) and caches them in MongoDB
 * Designed to run once daily via cron to minimize API calls
 */
const { PriceCache } = require('../models/PriceCache');
const { Product } = require('../models/Product');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '5c0ce62fc2msh1082d9839bc9299p1ea31fjsn1a5ca74e5b3d';
const RAPIDAPI_HOST = 'cardmarket-api-tcg.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

// Mapping TCGdex set IDs to cardmarket-api.com episode codes
// This will be auto-populated by fetching /pokemon/episodes
let episodeMap = null; // { 'PAL': { id: 21, name: 'Paldea Evolved', code: 'PAL' }, ... }

async function apiFetch(endpoint) {
  const fetch = (await import('node-fetch')).default;
  const url = `${BASE_URL}${endpoint}`;
  console.log(`  📡 CM-API: GET ${endpoint}`);
  
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CM-API ${res.status}: ${text.slice(0, 200)}`);
  }
  
  return res.json();
}

/**
 * Load all available episodes (sets) from the API
 * This maps set codes to their API IDs
 */
async function loadEpisodes() {
  // Return cache if it has data, otherwise refetch
  if (episodeMap && Object.keys(episodeMap).length > 0) return episodeMap;
  
  console.log('📋 Loading episodes from CM-API...');
  
  episodeMap = {};
  let page = 1;
  let totalPages = 1;
  
  try {
    while (page <= totalPages) {
      const response = await apiFetch(`/pokemon/episodes?page=${page}`);
      
      // API returns { data: [...], paging: { current, total, per_page }, results }
      const episodes = response.data || response;
      if (response.paging) {
        totalPages = response.paging.total || 1;
      }
      
      if (Array.isArray(episodes)) {
        episodes.forEach(ep => {
          const code = ep.code;
          if (code) {
            // Use first occurrence (avoid duplicates like SCR)
            if (!episodeMap[code.toUpperCase()]) {
              episodeMap[code.toUpperCase()] = {
                id: ep.id,
                name: ep.name,
                code: ep.code,
                cardCount: ep.cards_total || ep.cards_printed_total || 0,
                printedTotal: ep.cards_printed_total || 0,
              };
            }
          }
        });
      }
      
      console.log(`  📋 Page ${page}/${totalPages}: ${episodes.length || 0} episodes`);
      page++;
      // Small delay between pages
      if (page <= totalPages) await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`✅ ${Object.keys(episodeMap).length} episodes loaded (${totalPages} pages)`);
    console.log(`  📋 Sample codes:`, Object.keys(episodeMap).slice(0, 10).join(', '));
  } catch (err) {
    console.error('❌ Failed to load episodes:', err.message);
    episodeMap = null; // Reset so next call retries
  }
  
  return episodeMap || {};
}

/**
 * Map TCGdex set ID to CM-API episode code
 * TCGdex uses 'sv02', CM-API uses 'PAL' (Paldea Evolved)
 */
const TCGDEX_TO_CMAPI = {
  // Scarlet & Violet
  'sv01': 'SVI', // Scarlet & Violet base
  'sv02': 'PAL', // Paldea Evolved  
  'sv03': 'OBF', // Obsidian Flames
  'sv03.5': 'MEW', // 151
  'sv04': 'PAR', // Paradox Rift
  'sv04.5': 'PAF', // Paldean Fates
  'sv05': 'TEF', // Temporal Forces
  'sv06': 'TWM', // Twilight Masquerade
  'sv06.5': 'SFA', // Shrouded Fable
  'sv07': 'SCR', // Stellar Crown
  'sv08': 'SSP', // Surging Sparks
  'sv08.5': 'PRE', // Prismatic Evolutions
  'sv09': 'JTG', // Journey Together
  // Sword & Shield
  'swsh1': 'SSH', 'swsh2': 'RCL', 'swsh3': 'DAA', 'swsh4': 'VIV',
  'swsh5': 'BST', 'swsh6': 'CRE', 'swsh7': 'EVS', 'swsh8': 'FST',
  'swsh9': 'BRS', 'swsh10': 'ASR', 'swsh11': 'LOR', 'swsh12': 'SIT',
  'swsh12.5': 'CRZ',
  // XY
  'xy1': 'XY', 'xy2': 'FLF', 'xy3': 'FFI', 'xy4': 'PHF',
  'xy5': 'PRC', 'xy7': 'AOR', 'xy8': 'BKT', 'xy9': 'BKP',
  'xy11': 'STS', 'xy12': 'EVO',
};

/**
 * Fetch all card prices for a specific set from CM-API
 * Returns array of price objects
 */
async function fetchSetPrices(episodeId, setCode) {
  console.log(`💰 Fetching prices for set ${setCode} (episode ${episodeId})...`);
  
  let allCards = [];
  let page = 1;
  let totalPages = 1;
  
  while (page <= totalPages) {
    const endpoint = `/pokemon/episodes/${episodeId}/cards?page=${page}`;
    const response = await apiFetch(endpoint);
    
    // API returns { data: [...], paging: { current, total, per_page }, results }
    const cards = response.data || response;
    if (response.paging) {
      totalPages = response.paging.total || 1;
    }
    
    if (Array.isArray(cards)) {
      allCards = allCards.concat(cards);
    }
    
    page++;
    // Safety + rate limit
    if (page > 20) break;
    if (page <= totalPages) await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`  📦 ${allCards.length} cards retrieved for ${setCode} (${totalPages} pages)`);
  return allCards;
}

/**
 * Process and save prices for a set into MongoDB
 */
async function syncSetPrices(tcgdexSetId) {
  const cmCode = TCGDEX_TO_CMAPI[tcgdexSetId];
  if (!cmCode) {
    console.warn(`⚠️ No CM-API mapping for TCGdex set: ${tcgdexSetId}`);
    return { synced: 0, error: 'No mapping' };
  }
  
  // Load episodes to get the API ID
  const episodes = await loadEpisodes();
  const episode = episodes[cmCode];
  if (!episode) {
    console.warn(`⚠️ Episode ${cmCode} not found in CM-API`);
    return { synced: 0, error: `Episode ${cmCode} not found` };
  }
  
  // Fetch all card prices for this set
  const cards = await fetchSetPrices(episode.id, cmCode);
  
  let synced = 0;
  const bulkOps = [];
  
  for (const card of cards) {
    const cardNumber = String(card.card_number || card.cardNumber || '');
    if (!cardNumber) continue;
    
    // Log first card and high-numbered cards to debug
    if (synced === 0 || parseInt(cardNumber) > 130) {
      console.log(`  🔍 Card #${cardNumber}: ${card.name} (${card.rarity})`);
      const cmSample = (card.prices || {}).cardmarket || {};
      console.log(`     CM prices:`, JSON.stringify(cmSample).slice(0, 400));
    }
    
    const cardKey = `${cmCode}-${cardNumber}`;
    const prices = card.prices || {};
    const cm = prices.cardmarket || {};
    const tcg = prices.tcg_player || prices.tcgplayer || {};
    
    // Handle graded - API returns [] for empty, or object with psa/cgc
    const graded = (Array.isArray(cm.graded) ? {} : cm.graded) || {};
    
    // Extract prices from actual API field names
    const lowestNM = cm.lowest_near_mint || 0;
    const lowestFR = cm.lowest_near_mint_FR || 0;
    const lowestDE = cm.lowest_near_mint_DE || 0;
    const lowestES = cm.lowest_near_mint_ES || 0;
    const lowestIT = cm.lowest_near_mint_IT || 0;
    // These fields may not exist for common cards
    const avg30 = cm['30d_average'] || cm.avg30 || 0;
    const avg7 = cm['7d_average'] || cm.avg7 || 0;
    const avg1 = cm['1d_average'] || cm.avg1 || 0;
    const trend = cm.trend_price || cm.trend || 0;
    
    bulkOps.push({
      updateOne: {
        filter: { cardKey },
        update: {
          $set: {
            cardKey,
            cardName: card.name || card.name_numbered || '',
            cardNumber,
            rarity: card.rarity || '',
            setCode: cmCode,
            setName: episode.name,
            cmApiId: card.id || 0,
            cm: {
              lowestNM,
              lowestNM_FR: lowestFR,
              lowestNM_DE: lowestDE,
              lowestNM_ES: lowestES,
              lowestNM_IT: lowestIT,
              avg30d: avg30,
              avg7d: avg7,
              avg1d: avg1,
              trendPrice: trend,
            },
            cmRaw: JSON.stringify(cm).slice(0, 500),
            tcg: {
              marketPrice: tcg.market_price || tcg.marketPrice || 0,
              midPrice: tcg.mid_price || tcg.midPrice || 0,
            },
            graded: {
              psa10: graded.psa?.psa10 || 0,
              psa9: graded.psa?.psa9 || 0,
              cgc10: graded.cgc?.cgc10 || 0,
            },
            imageUrl: card.image || '',
            // Calculate bestPrice here (bulkWrite skips Mongoose pre-save hooks)
            // Free plan only has lowest_near_mint prices, not averages/trends
            // Priority: FR price > global lowest NM > trend/avg if available
            bestPrice: Math.round((lowestFR || lowestNM || trend || avg7 || avg30 || 0) * 100) / 100,
            lastUpdated: new Date(),
            source: 'cardmarket-api',
          }
        },
        upsert: true
      }
    });
    
    synced++;
  }
  
  if (bulkOps.length > 0) {
    await PriceCache.bulkWrite(bulkOps);
  }
  
  console.log(`✅ ${synced} prices synced for ${cmCode} (${episode.name})`);
  return { synced, setCode: cmCode, setName: episode.name };
}

/**
 * Apply cached prices to a product's pool
 * Called after pool is loaded from TCGdex
 */
async function applyPricesToPool(product) {
  if (!product.tcgdexId || !product.pool || !product.pool.length) return;
  
  const cmCode = TCGDEX_TO_CMAPI[product.tcgdexId];
  if (!cmCode) return;
  
  // Get all cached prices for this set
  const prices = await PriceCache.getSetPrices(cmCode);
  if (!prices.length) {
    console.log(`⚠️ No cached prices for ${cmCode}, skipping price apply`);
    return;
  }
  
  // Build a lookup by card number
  const priceMap = {};
  prices.forEach(p => {
    priceMap[p.cardNumber] = p;
  });
  
  let applied = 0;
  
  product.pool.forEach(card => {
    const num = card.cardNum || card.localId || '';
    // Try exact match, then numeric match (pool has "001", API has "1")
    const numParsed = String(parseInt(num));
    const cached = priceMap[num] || priceMap[numParsed] || priceMap[num.replace(/^0+/, '')] || null;
    
    if (cached && cached.bestPrice > 0) {
      card.cmPrice = cached.bestPrice;
      card.cmTrend = cached.cm.trendPrice || cached.cm.avg7d || cached.bestPrice;
      card.cmLow = cached.cm.lowestNM_FR || cached.cm.lowestNM || 0;
      card.cmAvg1 = cached.cm.avg1d || 0;
      card.cmAvg7 = cached.cm.avg7d || 0;
      card.cmAvg30 = cached.cm.avg30d || 0;
      card.cmUpdated = cached.lastUpdated ? new Date(cached.lastUpdated).toLocaleDateString('fr-FR') : '';
      card.cmSource = 'cardmarket-api';
      card.v = cached.bestPrice;
      
      // Store FR-specific price if available
      if (cached.cm.lowestNM_FR > 0) {
        card.priceFR = cached.cm.lowestNM_FR;
      }
      
      // Store graded prices
      if (cached.graded && cached.graded.psa10 > 0) {
        card.gradedPSA10 = cached.graded.psa10;
        card.gradedPSA9 = cached.graded.psa9;
      }
      
      // Update rarity from CM-API (more reliable)
      if (cached.rarity) {
        card.rarityName = cached.rarity;
      }
      
      applied++;
    }
  });
  
  console.log(`💰 Applied ${applied}/${product.pool.length} prices from cache to "${product.name}"`);
  return applied;
}

/**
 * Sync all products that have a tcgdexId
 * Call this from a daily cron
 */
async function syncAllProducts() {
  const products = await Product.find({ active: true, tcgdexId: { $ne: '' } }).select('name tcgdexId');
  
  console.log(`🔄 Starting daily price sync for ${products.length} products...`);
  
  const results = [];
  const seenSets = new Set();
  
  for (const product of products) {
    const cmCode = TCGDEX_TO_CMAPI[product.tcgdexId];
    if (!cmCode || seenSets.has(cmCode)) continue;
    seenSets.add(cmCode);
    
    try {
      const result = await syncSetPrices(product.tcgdexId);
      results.push(result);
      
      // Small delay to respect rate limits
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`❌ Failed to sync ${product.name} (${product.tcgdexId}):`, e.message);
      results.push({ synced: 0, error: e.message, setCode: cmCode });
    }
  }
  
  console.log(`🏁 Price sync complete: ${results.filter(r => r.synced > 0).length} sets synced`);
  return results;
}

/**
 * Get sync status
 */
async function getSyncStatus() {
  const totalPrices = await PriceCache.countDocuments();
  const setsWithPrices = await PriceCache.distinct('setCode');
  const lastUpdate = await PriceCache.findOne().sort({ lastUpdated: -1 }).select('lastUpdated setCode');
  
  return {
    totalPrices,
    setsWithPrices: setsWithPrices.length,
    sets: setsWithPrices,
    lastUpdate: lastUpdate?.lastUpdated || null,
    lastSet: lastUpdate?.setCode || null,
  };
}

module.exports = {
  syncSetPrices,
  syncAllProducts,
  applyPricesToPool,
  loadEpisodes,
  getSyncStatus,
  TCGDEX_TO_CMAPI
};
