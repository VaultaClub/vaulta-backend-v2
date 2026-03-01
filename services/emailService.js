/**
 * Email Service — IONOS SMTP + OTP
 * Sends verification codes for registration and login
 */
const nodemailer = require('nodemailer');

// Create reusable transporter
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ionos.fr',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
  return transporter;
}

// Verify SMTP connection on startup
async function verifyConnection() {
  try {
    await getTransporter().verify();
    console.log('✅ SMTP connecté (' + (process.env.SMTP_HOST || 'smtp.ionos.fr') + ')');
    return true;
  } catch (err) {
    console.error('❌ SMTP erreur:', err.message);
    return false;
  }
}

// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// HTML email template
function otpTemplate(code, type, username) {
  const isLogin = type === 'login';
  const title = isLogin ? 'Code de connexion' : 'Vérification de votre email';
  const subtitle = isLogin 
    ? 'Entrez ce code pour vous connecter à votre compte Vaulta Club.' 
    : 'Bienvenue ! Entrez ce code pour valider votre inscription.';
  
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:40px 20px">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#12121e;border-radius:16px;border:1px solid rgba(99,102,241,.2);overflow:hidden">
  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,rgba(99,102,241,.2),rgba(139,92,246,.2));padding:30px 30px 20px;text-align:center">
    <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;margin-bottom:12px">V</div>
    <div style="font-size:22px;font-weight:800;color:#e2e8f0;letter-spacing:.5px">VAULTA CLUB</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:4px">Ouvre. Collectionne. Échange.</div>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:30px">
    <div style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:8px">${title}</div>
    ${username ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">Bonjour <strong style="color:#c4b5fd">${username}</strong>,</div>` : ''}
    <div style="font-size:13px;color:#94a3b8;margin-bottom:24px;line-height:1.6">${subtitle}</div>
    <!-- OTP Code -->
    <div style="background:rgba(99,102,241,.08);border:2px solid rgba(99,102,241,.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">Votre code</div>
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#c4b5fd;font-family:'Courier New',monospace">${code}</div>
    </div>
    <div style="font-size:12px;color:#64748b;line-height:1.5">
      ⏱️ Ce code expire dans <strong style="color:#f59e0b">10 minutes</strong>.<br>
      🔒 Ne partagez jamais ce code avec personne.<br>
      ${isLogin ? '📍 Si vous n\'avez pas tenté de vous connecter, ignorez cet email.' : ''}
    </div>
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:20px 30px;border-top:1px solid rgba(99,102,241,.1)">
    <div style="font-size:11px;color:#475569;text-align:center;line-height:1.5">
      © ${new Date().getFullYear()} Vaulta Club — Tous droits réservés<br>
      Cet email a été envoyé automatiquement, ne pas répondre.
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// Send OTP email
async function sendOTP(email, code, type, username) {
  try {
    const info = await getTransporter().sendMail({
      from: `"Vaulta Club" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: type === 'login' 
        ? `🔐 Code de connexion : ${code}` 
        : `✉️ Vérification email : ${code}`,
      html: otpTemplate(code, type, username),
    });
    console.log(`📧 OTP envoyé à ${email} (${type}) — ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ Email failed to ${email}:`, err.message);
    return false;
  }
}

// Welcome email after verification
async function sendWelcome(email, username) {
  try {
    await getTransporter().sendMail({
      from: `"Vaulta Club" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: `🎉 Bienvenue sur Vaulta Club, ${username} !`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:40px 20px">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#12121e;border-radius:16px;border:1px solid rgba(99,102,241,.2);overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,rgba(99,102,241,.2),rgba(139,92,246,.2));padding:30px;text-align:center">
    <div style="font-size:48px;margin-bottom:12px">🎉</div>
    <div style="font-size:22px;font-weight:800;color:#e2e8f0">Bienvenue ${username} !</div>
  </td></tr>
  <tr><td style="padding:30px;font-size:14px;color:#94a3b8;line-height:1.7">
    <p>Votre compte <strong style="color:#c4b5fd">Vaulta Club</strong> est prêt.</p>
    <p>🎁 <strong style="color:#f59e0b">45,00€ de bonus</strong> vous attendent pour ouvrir vos premiers boosters !</p>
    <p>Ouvrez de vrais boosters Pokémon scannés, collectionnez des cartes uniques et échangez-les sur le marché.</p>
    <p style="margin-top:20px;text-align:center">
      <a href="${process.env.SITE_URL || 'https://vaultaclub.com'}" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">Commencer à ouvrir</a>
    </p>
  </td></tr>
  <tr><td style="padding:16px 30px;border-top:1px solid rgba(99,102,241,.1);text-align:center">
    <div style="font-size:11px;color:#475569">© ${new Date().getFullYear()} Vaulta Club</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
    });
    console.log(`📧 Welcome email sent to ${email}`);
  } catch (err) {
    console.error('Welcome email failed:', err.message);
  }
}

module.exports = { generateOTP, sendOTP, sendWelcome, verifyConnection };
