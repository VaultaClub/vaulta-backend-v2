/**
 * 🌱 VAULTA CLUB — Script d'initialisation de la base de données
 *
 * Lance avec: node seed.js
 *
 * Ce script crée :
 * - 1 compte admin
 * - Les franchises TCG
 * - Les séries Pokémon
 * - Les produits (boosters) avec leurs pools de cartes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const { TCG, Series, Product } = require('./models/Product');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connecté');

    // Nettoyer (attention en prod!)
    if (process.env.NODE_ENV !== 'production') {
      await User.deleteMany({});
      await TCG.deleteMany({});
      await Series.deleteMany({});
      await Product.deleteMany({});
      console.log('🗑️  Base nettoyée');
    }

    // ========================
    // ADMIN
    // ========================
    const admin = await User.create({
      username: 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@vaultaclub.com',
      password: process.env.ADMIN_PASSWORD || 'Admin123!',
      role: 'admin',
      balance: 9999,
      emailVerified: true
    });
    console.log(`👤 Admin créé: ${admin.email}`);

    // Compte test
    const testUser = await User.create({
      username: 'testeur',
      email: 'test@vaultaclub.com',
      password: 'Test123!',
      role: 'user',
      balance: 100,
      emailVerified: true
    });
    console.log(`👤 Testeur créé: ${testUser.email}`);

    // ========================
    // TCG FRANCHISES
    // ========================
    const pokemon = await TCG.create({ name: 'Pokémon', slug: 'pokemon', description: 'Jeu de cartes Pokémon', order: 1 });
    const onepiece = await TCG.create({ name: 'One Piece', slug: 'onepiece', description: 'One Piece Card Game', order: 2 });
    const yugioh = await TCG.create({ name: 'Yu-Gi-Oh!', slug: 'yugioh', description: 'Yu-Gi-Oh! Trading Cards', order: 3, active: false });
    console.log('🎴 TCG créés');

    // ========================
    // SÉRIES POKÉMON
    // ========================
    const sv = await Series.create({ name: 'Écarlate & Violet', tcg: pokemon._id, order: 1 });
    const swsh = await Series.create({ name: 'Épée & Bouclier', tcg: pokemon._id, order: 2 });
    const op1 = await Series.create({ name: 'Romance Dawn', tcg: onepiece._id, order: 1 });
    console.log('📚 Séries créées');

    // ========================
    // CARTES POOL (exemples)
    // ========================
    const pokemonCards = [
      { name: 'Pikachu', rarity: 'common', value: 0.50, emoji: '⚡' },
      { name: 'Salamèche', rarity: 'common', value: 0.50, emoji: '🔥' },
      { name: 'Carapuce', rarity: 'common', value: 0.50, emoji: '💧' },
      { name: 'Bulbizarre', rarity: 'common', value: 0.50, emoji: '🌿' },
      { name: 'Rondoudou', rarity: 'common', value: 0.30, emoji: '🎵' },
      { name: 'Évoli', rarity: 'common', value: 0.60, emoji: '🦊' },
      { name: 'Magicarpe', rarity: 'common', value: 0.20, emoji: '🐟' },
      { name: 'Rattata', rarity: 'common', value: 0.20, emoji: '🐀' },
      { name: 'Raichu', rarity: 'uncommon', value: 1.50, emoji: '⚡' },
      { name: 'Dracaufeu', rarity: 'uncommon', value: 2.00, emoji: '🔥' },
      { name: 'Tortank', rarity: 'uncommon', value: 1.80, emoji: '💧' },
      { name: 'Florizarre', rarity: 'uncommon', value: 1.80, emoji: '🌿' },
      { name: 'Noctali', rarity: 'uncommon', value: 2.50, emoji: '🌙' },
      { name: 'Léviator', rarity: 'rare', value: 5.00, emoji: '🐉' },
      { name: 'Mewtwo', rarity: 'rare', value: 8.00, emoji: '🧠' },
      { name: 'Lucario', rarity: 'rare', value: 6.00, emoji: '💪' },
      { name: 'Rayquaza', rarity: 'rare', value: 7.50, emoji: '🐲' },
      { name: 'Dracaufeu VMAX', rarity: 'ultra', value: 25.00, emoji: '🔥' },
      { name: 'Pikachu VMAX', rarity: 'ultra', value: 20.00, emoji: '⚡' },
      { name: 'Mewtwo GX', rarity: 'ultra', value: 22.00, emoji: '🧠' },
      { name: 'Dracaufeu Alt Art', rarity: 'secret', value: 120.00, emoji: '✨' },
      { name: 'Pikachu Gold', rarity: 'secret', value: 80.00, emoji: '👑' },
    ];

    const opCards = [
      { name: 'Luffy', rarity: 'common', value: 0.50, emoji: '🏴‍☠️' },
      { name: 'Zoro', rarity: 'common', value: 0.50, emoji: '⚔️' },
      { name: 'Nami', rarity: 'common', value: 0.40, emoji: '🗺️' },
      { name: 'Sanji', rarity: 'uncommon', value: 1.50, emoji: '🍳' },
      { name: 'Robin', rarity: 'uncommon', value: 2.00, emoji: '📖' },
      { name: 'Luffy Gear 5', rarity: 'rare', value: 8.00, emoji: '☀️' },
      { name: 'Shanks', rarity: 'ultra', value: 25.00, emoji: '🔴' },
      { name: 'Luffy Gear 5 Alt Art', rarity: 'secret', value: 150.00, emoji: '✨' },
    ];

    // ========================
    // PRODUITS
    // ========================
    await Product.create({
      name: 'Booster Écarlate & Violet',
      tcg: pokemon._id, series: sv._id,
      price: 5.90, cardsPerPack: 10, stock: 50,
      badge: 'hot', badgeText: '🔥 Populaire',
      gradient: 'linear-gradient(135deg, #dc2626, #7c3aed)',
      emoji: '🔥', cardPool: pokemonCards
    });

    await Product.create({
      name: 'Booster Mascarade Crépusculaire',
      tcg: pokemon._id, series: sv._id,
      price: 5.90, cardsPerPack: 10, stock: 35,
      badge: 'new', badgeText: '✨ Nouveau',
      gradient: 'linear-gradient(135deg, #7c3aed, #1e1b4b)',
      emoji: '🌙', cardPool: pokemonCards
    });

    await Product.create({
      name: 'Booster Flammes Obsidiennes',
      tcg: pokemon._id, series: sv._id,
      price: 5.90, cardsPerPack: 10, stock: 20,
      badge: 'ltd', badgeText: '⚡ Limité',
      gradient: 'linear-gradient(135deg, #ea580c, #1a1a2e)',
      emoji: '🌋', cardPool: pokemonCards
    });

    await Product.create({
      name: 'Booster Épée & Bouclier Base',
      tcg: pokemon._id, series: swsh._id,
      price: 4.50, cardsPerPack: 10, stock: 15,
      gradient: 'linear-gradient(135deg, #2563eb, #dc2626)',
      emoji: '⚔️', cardPool: pokemonCards
    });

    await Product.create({
      name: 'Booster Romance Dawn',
      tcg: onepiece._id, series: op1._id,
      price: 5.50, cardsPerPack: 12, stock: 40,
      badge: 'hot', badgeText: '🏴‍☠️ Populaire',
      gradient: 'linear-gradient(135deg, #dc2626, #fbbf24)',
      emoji: '🏴‍☠️', cardPool: opCards
    });

    console.log('📦 Produits créés');
    console.log('\n✅ Seed terminé avec succès!\n');
    console.log('📋 Comptes disponibles:');
    console.log(`   Admin: ${admin.email} / ${process.env.ADMIN_PASSWORD || 'Admin123!'}`);
    console.log(`   Test:  ${testUser.email} / Test123!`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur seed:', err);
    process.exit(1);
  }
};

seed();
