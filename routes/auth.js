const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { generateOTP, sendOTP, sendWelcome } = require('../services/emailService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const genToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
const gen2FAToken = (userId) => jwt.sign({ userId, pending2FA: true }, process.env.JWT_SECRET, { expiresIn: '5m' });

// In-memory OTP store (code -> { email, code, type, userId, username, password, expires })
// For production, use Redis
const otpStore = new Map();
function cleanExpired() { const now = Date.now(); for (const [k,v] of otpStore) { if (v.expires < now) otpStore.delete(k); } }
setInterval(cleanExpired, 60000);

// Avatar upload config
const avatarDir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarDir,
    filename: (req, file, cb) => cb(null, `av-${req.user._id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['.jpg','.jpeg','.png','.webp','.gif'].includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Format non supporté (JPG, PNG, WebP, GIF)'));
  }
});

// POST /api/auth/register — Step 1: validate + send OTP
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, password2 } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Pseudo : 3 à 20 caractères' });
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return res.status(400).json({ error: 'Pseudo : lettres, chiffres, - et _ uniquement' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
    
    const pwdErrors = User.validatePassword(password);
    if (pwdErrors.length > 0) return res.status(400).json({ error: 'Mot de passe trop faible', details: pwdErrors });
    if (password2 && password !== password2) return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
    
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    if (await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } })) return res.status(400).json({ error: 'Ce pseudo est déjà pris' });
    
    // Generate OTP and store pending registration
    const code = generateOTP();
    const otpKey = `reg_${email.toLowerCase()}`;
    otpStore.set(otpKey, {
      email: email.toLowerCase(),
      username,
      password, // Will be hashed when user is created
      code,
      type: 'register',
      expires: Date.now() + 10 * 60 * 1000, // 10 min
    });
    
    // Send OTP email
    const sent = await sendOTP(email, code, 'register', username);
    if (!sent) {
      // SMTP fallback: create user directly without email verification
      console.warn('⚠️ SMTP failed for register OTP, creating user directly:', email);
      const user = new User({ username, email: email.toLowerCase(), password, emailVerified: false });
      await user.save();
      const token = genToken(user._id);
      return res.json({ token, user: User.safeUser(user), message: 'Compte créé (vérification email indisponible)' });
    }
    
    res.json({ requiresOTP: true, email: email.toLowerCase(), message: 'Code envoyé par email' });
  } catch (err) {
    console.error('Register error:', err.message);
    if (err.code === 11000) return res.status(400).json({ error: 'Email ou pseudo déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/verify-register — Step 2: verify OTP + create account
router.post('/verify-register', async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    if (!email || !otpCode) return res.status(400).json({ error: 'Code requis' });
    
    const otpKey = `reg_${email.toLowerCase()}`;
    const pending = otpStore.get(otpKey);
    
    if (!pending) return res.status(400).json({ error: 'Code expiré. Réinscrivez-vous.' });
    if (pending.expires < Date.now()) { otpStore.delete(otpKey); return res.status(400).json({ error: 'Code expiré. Réinscrivez-vous.' }); }
    if (pending.code !== otpCode) return res.status(401).json({ error: 'Code incorrect' });
    
    // OTP valid — create user
    otpStore.delete(otpKey);
    
    const user = await User.create({
      username: pending.username,
      email: pending.email,
      password: pending.password,
      balance: 45,
      emailVerified: true,
    });
    
    user.lastLogin = new Date();
    user.lastLoginIP = req.ip;
    user.addLoginHistory(req.ip, req.get('User-Agent'), true);
    await user.save();
    
    const token = genToken(user._id);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    
    // Send welcome email (async, don't wait)
    sendWelcome(user.email, user.username).catch(() => {});
    
    res.status(201).json({ user: User.safeUser(user), token });
  } catch (err) {
    console.error('Verify register error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/resend-otp — Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email, type } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    
    const otpKey = `${type || 'reg'}_${email.toLowerCase()}`;
    const pending = otpStore.get(otpKey);
    if (!pending) return res.status(400).json({ error: 'Aucune vérification en cours pour cet email' });
    
    // Generate new code
    const code = generateOTP();
    pending.code = code;
    pending.expires = Date.now() + 10 * 60 * 1000;
    otpStore.set(otpKey, pending);
    
    const sent = await sendOTP(email, code, type || 'register', pending.username);
    if (!sent) return res.status(500).json({ error: 'Erreur d\'envoi' });
    
    res.json({ message: 'Nouveau code envoyé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/login — Step 1: verify password + send OTP
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
    
    if (user.isLocked()) {
      const min = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ error: `Compte verrouillé. Réessayez dans ${min} min.`, locked: true, remainingMinutes: min });
    }
    if (user.status === 'banned') return res.status(403).json({ error: 'Compte banni' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Compte suspendu' });
    
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      await user.incLoginAttempts();
      user.addLoginHistory(req.ip, req.get('User-Agent'), false);
      await user.save();
      const rem = 5 - (user.loginAttempts + 1);
      return res.status(401).json({ error: rem > 0 && rem <= 2 ? `Identifiants incorrects. ${rem} tentative(s) restante(s).` : 'Identifiants incorrects' });
    }
    
    // Password OK — send OTP
    const code = generateOTP();
    const otpKey = `login_${email.toLowerCase()}`;
    otpStore.set(otpKey, {
      email: email.toLowerCase(),
      userId: user._id.toString(),
      username: user.username,
      code,
      type: 'login',
      expires: Date.now() + 10 * 60 * 1000,
    });
    
    const sent = await sendOTP(email, code, 'login', user.username);
    if (!sent) {
      // SMTP fallback: if email fails, login directly (skip OTP)
      console.warn('⚠️ SMTP failed for login OTP, falling back to direct login for:', email);
      await user.resetLoginAttempts();
      user.addLoginHistory(req.ip, req.get('User-Agent'), true);
      user.lastLogin = new Date();
      await user.save();
      
      if (user.twoFA && user.twoFA.enabled) {
        return res.json({ requires2FA: true, tempToken: gen2FAToken(user._id) });
      }
      
      const token = genToken(user._id);
      return res.json({ token, user: User.safeUser(user) });
    }
    
    res.json({ requiresOTP: true, email: email.toLowerCase(), message: 'Code envoyé par email' });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/verify-login — Step 2: verify OTP + login
router.post('/verify-login', async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    if (!email || !otpCode) return res.status(400).json({ error: 'Code requis' });
    
    const otpKey = `login_${email.toLowerCase()}`;
    const pending = otpStore.get(otpKey);
    
    if (!pending) return res.status(400).json({ error: 'Code expiré. Reconnectez-vous.' });
    if (pending.expires < Date.now()) { otpStore.delete(otpKey); return res.status(400).json({ error: 'Code expiré. Reconnectez-vous.' }); }
    if (pending.code !== otpCode) return res.status(401).json({ error: 'Code incorrect' });
    
    otpStore.delete(otpKey);
    
    const user = await User.findById(pending.userId);
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    
    // Check TOTP 2FA (if enabled, requires additional step)
    if (user.twoFA?.enabled) {
      return res.json({ requires2FA: true, tempToken: gen2FAToken(user._id) });
    }
    
    await user.resetLoginAttempts();
    user.lastLogin = new Date();
    user.lastLoginIP = req.ip;
    user.addLoginHistory(req.ip, req.get('User-Agent'), true);
    await user.save();
    
    const token = genToken(user._id);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ user: User.safeUser(user), token });
  } catch (err) {
    console.error('Verify login error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/verify-2fa
router.post('/verify-2fa', async (req, res) => {
  try {
    const { tempToken, totpCode } = req.body;
    if (!tempToken || !totpCode) return res.status(400).json({ error: 'Code requis' });
    
    let decoded;
    try { decoded = jwt.verify(tempToken, process.env.JWT_SECRET); } catch(e) { return res.status(401).json({ error: 'Session expirée' }); }
    if (!decoded.pending2FA) return res.status(401).json({ error: 'Token invalide' });
    
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    
    let speakeasy;
    try { speakeasy = require('speakeasy'); } catch(e) { return res.status(500).json({ error: '2FA non disponible' }); }
    
    const verified = speakeasy.totp.verify({ secret: user.twoFA.secret, encoding: 'base32', token: totpCode, window: 1 });
    if (!verified) {
      const hashed = crypto.createHash('sha256').update(totpCode).digest('hex');
      const idx = (user.twoFA.backupCodes || []).indexOf(hashed);
      if (idx === -1) { await user.incLoginAttempts(); return res.status(401).json({ error: 'Code invalide' }); }
      user.twoFA.backupCodes.splice(idx, 1);
    }
    
    await user.resetLoginAttempts();
    user.lastLogin = new Date();
    user.lastLoginIP = req.ip;
    user.addLoginHistory(req.ip, req.get('User-Agent'), true);
    await user.save();
    
    const token = genToken(user._id);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ user: User.safeUser(user), token });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/2fa/setup
router.post('/2fa/setup', auth, async (req, res) => {
  try {
    let speakeasy, QRCode;
    try { speakeasy = require('speakeasy'); QRCode = require('qrcode'); } catch(e) {
      return res.status(500).json({ error: 'npm install speakeasy qrcode' });
    }
    const secret = speakeasy.generateSecret({ name: `VaultaClub (${req.user.email})`, issuer: 'VaultaClub', length: 20 });
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    
    const backupCodes = [], hashedCodes = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
      hashedCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
    }
    
    req.user.twoFA = { enabled: false, secret: secret.base32, backupCodes: hashedCodes };
    await req.user.save();
    
    res.json({ secret: secret.base32, qrCode, backupCodes });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/2fa/verify — Enable 2FA
router.post('/2fa/verify', auth, async (req, res) => {
  try {
    const { totpCode } = req.body;
    if (!totpCode) return res.status(400).json({ error: 'Code requis' });
    let speakeasy;
    try { speakeasy = require('speakeasy'); } catch(e) { return res.status(500).json({ error: '2FA non disponible' }); }
    if (!req.user.twoFA?.secret) return res.status(400).json({ error: 'Faites /2fa/setup d\'abord' });
    
    const verified = speakeasy.totp.verify({ secret: req.user.twoFA.secret, encoding: 'base32', token: totpCode, window: 1 });
    if (!verified) return res.status(401).json({ error: 'Code invalide' });
    
    req.user.twoFA.enabled = true;
    req.user.twoFA.verifiedAt = new Date();
    await req.user.save();
    res.json({ success: true, message: '2FA activée !' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/2fa/disable
router.post('/2fa/disable', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Mot de passe requis' });
    const user = await User.findById(req.user._id);
    if (!await user.comparePassword(password)) return res.status(401).json({ error: 'Mot de passe incorrect' });
    user.twoFA = { enabled: false, secret: '', backupCodes: [] };
    await user.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ message: 'Déconnecté' }); });

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json(User.safeUser(req.user)));

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { username, bio } = req.body;
    if (username && username !== req.user.username) {
      if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(username)) return res.status(400).json({ error: 'Pseudo invalide' });
      if (await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') }, _id: { $ne: req.user._id } })) return res.status(400).json({ error: 'Pseudo déjà pris' });
      req.user.username = username;
    }
    if (bio !== undefined) req.user.bio = (bio || '').slice(0, 200);
    await req.user.save();
    res.json(User.safeUser(req.user));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/avatar
router.post('/avatar', auth, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
    if (req.user.avatar) {
      const old = path.join(__dirname, '..', 'public', req.user.avatar);
      if (fs.existsSync(old)) try { fs.unlinkSync(old); } catch(e) {}
    }
    req.user.avatar = `/uploads/avatars/${req.file.filename}`;
    await req.user.save();
    res.json({ avatar: req.user.avatar });
  });
});

// PUT /api/auth/password
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Tous les champs requis' });
    const user = await User.findById(req.user._id);
    if (!await user.comparePassword(currentPassword)) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    const errs = User.validatePassword(newPassword);
    if (errs.length) return res.status(400).json({ error: 'Mot de passe faible', details: errs });
    user.password = newPassword;
    await user.save();
    const token = genToken(user._id);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true, token });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/auth/sessions
router.get('/sessions', auth, (req, res) => res.json({ sessions: req.user.loginHistory || [] }));

module.exports = router;
