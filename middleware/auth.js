const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Vérifier que l'utilisateur est connecté
const auth = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Accès non autorisé' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Compte banni' });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// Vérifier le rôle admin
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès admin requis' });
  next();
};

// Vérifier le rôle modérateur ou admin
const modOrAdmin = (req, res, next) => {
  if (!['admin', 'moderator'].includes(req.user.role)) return res.status(403).json({ error: 'Accès modérateur requis' });
  next();
};

module.exports = { auth, adminOnly, modOrAdmin };
