const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, required: true, unique: true, trim: true, 
    minlength: 3, maxlength: 20,
    match: [/^[a-zA-Z0-9_-]+$/, 'Pseudo: lettres, chiffres, - et _ uniquement']
  },
  email: { 
    type: String, required: true, unique: true, lowercase: true, trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email invalide']
  },
  password: { type: String, required: true, minlength: 8 },
  role: { type: String, enum: ['user', 'moderator', 'admin'], default: 'user' },
  
  balance: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  
  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  emailVerified: { type: Boolean, default: false },
  
  // 2FA (TOTP)
  twoFA: {
    enabled: { type: Boolean, default: false },
    secret: { type: String, default: '' },
    backupCodes: [{ type: String }],
    verifiedAt: { type: Date },
  },
  
  // Login security
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLogin: { type: Date },
  lastLoginIP: { type: String, default: '' },
  loginHistory: [{
    date: { type: Date, default: Date.now },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    success: { type: Boolean, default: true },
  }],
  
  avatar: { type: String, default: '' },
  bio: { type: String, default: '', maxlength: 200 },
  adminNote: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function() {
  return this.lockUntil && this.lockUntil > Date.now();
};

userSchema.methods.incLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 30 * 60 * 1000 };
  }
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({ $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } });
};

userSchema.methods.addLoginHistory = function(ip, ua, success) {
  this.loginHistory.unshift({ ip, userAgent: ua || '', success, date: new Date() });
  if (this.loginHistory.length > 20) this.loginHistory = this.loginHistory.slice(0, 20);
};

userSchema.methods.updateLevel = function() {
  this.level = Math.floor(this.xp / 100) + 1;
};

userSchema.statics.validatePassword = function(password) {
  const errors = [];
  if (password.length < 8) errors.push('8 caractères minimum');
  if (!/[A-Z]/.test(password)) errors.push('1 majuscule');
  if (!/[a-z]/.test(password)) errors.push('1 minuscule');
  if (!/[0-9]/.test(password)) errors.push('1 chiffre');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('1 caractère spécial');
  return errors;
};

userSchema.statics.safeUser = function(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: user.balance,
    xp: user.xp,
    level: user.level,
    status: user.status,
    avatar: user.avatar,
    bio: user.bio || '',
    emailVerified: user.emailVerified,
    twoFAEnabled: user.twoFA?.enabled || false,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  };
};

module.exports = mongoose.model('User', userSchema);
