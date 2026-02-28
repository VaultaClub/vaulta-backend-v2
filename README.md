# 🃏 VAULTA CLUB — Guide d'Installation Complet

## 📋 C'est quoi tout ça ?

Ton site Vaulta Club a besoin de 3 choses pour tourner :

1. **Un serveur** → c'est le programme qui fait tourner le site (Node.js + Express)
2. **Une base de données** → c'est là où sont stockés les utilisateurs, cartes, commandes... (MongoDB)
3. **Un hébergement** → c'est l'endroit où le serveur tourne 24h/24 (Railway, Render, ou VPS)

Ce guide t'explique TOUT depuis zéro.

---

## 🔧 Étape 1 : Installer Node.js sur ton PC

Node.js c'est le moteur qui fait tourner le serveur en JavaScript.

### Sur Windows :
1. Va sur https://nodejs.org
2. Télécharge la version **LTS** (Long Term Support)
3. Installe-le en laissant tout par défaut
4. Ouvre un **terminal** (tape "cmd" dans la barre de recherche Windows)
5. Vérifie que ça marche :
```bash
node --version
npm --version
```
Tu dois voir des numéros de version (ex: v20.15.0)

### Sur Mac :
```bash
# Installe Homebrew si pas déjà fait
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# Puis installe Node
brew install node
```

---

## 🗄️ Étape 2 : Créer la Base de Données (MongoDB Atlas — Gratuit)

MongoDB c'est où toutes les données sont stockées. Atlas c'est la version cloud (gratuite).

1. Va sur https://www.mongodb.com/atlas
2. Crée un compte (c'est gratuit)
3. Clique **"Build a Database"**
4. Choisis **M0 Free** (gratuit, 512 Mo — largement suffisant pour commencer)
5. Choisis la région la plus proche (ex: Paris pour la France)
6. Crée un **Database User** :
   - Username : `vaultaclub`
   - Password : choisis un mot de passe FORT (note-le !)
7. Dans **Network Access**, ajoute `0.0.0.0/0` (permet l'accès depuis partout)
8. Clique **Connect** → **Connect your application**
9. Copie l'URL qui ressemble à :
```
mongodb+srv://vaultaclub:TON_MDP@cluster0.abc123.mongodb.net/vaultaclub?retryWrites=true&w=majority
```

---

## 💳 Étape 3 : Créer un Compte Stripe (Paiements)

Stripe c'est ce qui gère les paiements par carte bancaire.

1. Va sur https://stripe.com/fr
2. Crée un compte
3. Dans le **Dashboard**, tu es en mode **Test** par défaut (parfait pour commencer)
4. Va dans **Developers** → **API Keys**
5. Note ta **Publishable key** (`pk_test_...`) et ta **Secret key** (`sk_test_...`)
6. Pour le webhook (plus tard), va dans **Developers** → **Webhooks** → **Add endpoint**
   - URL : `https://ton-site.com/api/wallet/webhook`
   - Events : `checkout.session.completed`

---

## 📁 Étape 4 : Configurer le Projet

1. Copie tout le dossier `vaulta-backend` sur ton PC
2. Ouvre un terminal dans ce dossier
3. Copie le fichier de config :
```bash
cp .env.example .env
```
4. Ouvre `.env` avec un éditeur (Notepad++, VS Code...) et remplis :
```env
MONGO_URI=mongodb+srv://vaultaclub:TON_MDP@cluster0.abc123.mongodb.net/vaultaclub?retryWrites=true&w=majority
JWT_SECRET=une_longue_chaine_aleatoire_de_64_caracteres_minimum
SESSION_SECRET=une_autre_chaine_aleatoire
STRIPE_SECRET_KEY=sk_test_ta_cle_stripe
STRIPE_PUBLISHABLE_KEY=pk_test_ta_cle_publique
ADMIN_EMAIL=ton.email@gmail.com
ADMIN_PASSWORD=TonMotDePasseAdmin123!
```

5. Installe les dépendances :
```bash
npm install
```

6. Ajoute aussi cookie-parser (utilisé dans le serveur) :
```bash
npm install cookie-parser
```

7. Remplis la base de données avec les données de départ :
```bash
npm run seed
```
Tu dois voir :
```
✅ MongoDB connecté
🗑️  Base nettoyée
👤 Admin créé: ton.email@gmail.com
👤 Testeur créé: test@vaultaclub.com
🎴 TCG créés
📚 Séries créées
📦 Produits créés
✅ Seed terminé avec succès!
```

8. Lance le serveur :
```bash
npm run dev
```
Tu dois voir :
```
🃏 VAULTA CLUB — Serveur actif
Port: 3000
```

9. Ouvre http://localhost:3000 dans ton navigateur 🎉

---

## 📂 Structure du Projet

```
vaulta-backend/
├── server.js              ← Point d'entrée (démarre tout)
├── seed.js                ← Remplit la BDD au départ
├── package.json           ← Liste des dépendances
├── .env                   ← Tes secrets (NE JAMAIS PARTAGER)
├── .env.example           ← Modèle du .env
├── config/
│   └── db.js              ← Connexion MongoDB
├── models/                ← Structure des données
│   ├── User.js            ← Utilisateurs
│   ├── Product.js         ← TCG, Séries, Boosters
│   ├── Card.js            ← Cartes obtenues
│   ├── Listing.js         ← Annonces marketplace
│   ├── Order.js           ← Commandes d'envoi
│   ├── Transaction.js     ← Mouvements financiers
│   ├── Ticket.js          ← Support client
│   └── Notification.js    ← Notifications
├── routes/                ← Les "portes" de l'API
│   ├── auth.js            ← Inscription, connexion
│   ├── shop.js            ← Boutique, achat boosters
│   ├── collection.js      ← Collection, recyclage, envoi
│   ├── marketplace.js     ← Marché, vente, négo
│   ├── wallet.js          ← Portefeuille, Stripe
│   ├── admin.js           ← Panel admin
│   └── support.js         ← Tickets support
├── middleware/
│   └── auth.js            ← Vérification connexion + rôles
└── public/                ← Tes fichiers HTML/CSS/JS
    ├── index.html         ← Le site principal (vaulta-club.html)
    └── admin.html         ← Le panel admin (vaulta-admin.html)
```

---

## 🔗 Les Routes de l'API (comment ça communique)

### Auth (Comptes)
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/auth/register` | Inscription |
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/logout` | Déconnexion |
| GET | `/api/auth/me` | Mon profil |

### Shop (Boutique)
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/shop/products` | Liste des boosters |
| GET | `/api/shop/tcgs` | Liste des TCG |
| GET | `/api/shop/series/:tcgId` | Séries d'un TCG |
| POST | `/api/shop/buy` | Acheter un booster |

### Collection
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/collection` | Mes cartes |
| POST | `/api/collection/recycle` | Recycler des cartes |
| POST | `/api/collection/ship` | Demander un envoi |

### Marketplace
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/marketplace` | Annonces en vente |
| POST | `/api/marketplace/sell` | Mettre en vente |
| POST | `/api/marketplace/buy/:id` | Acheter |
| POST | `/api/marketplace/negotiate/:id` | Faire une offre |

### Wallet (Portefeuille)
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/wallet/balance` | Mon solde |
| GET | `/api/wallet/transactions` | Historique |
| POST | `/api/wallet/create-payment` | Payer via Stripe |

### Admin (Panel)
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/admin/dashboard` | Stats générales |
| GET | `/api/admin/products` | Gestion stocks |
| PUT | `/api/admin/products/:id/stock` | +1/-1 stock |
| PUT | `/api/admin/products/:id/price` | Changer prix |
| GET | `/api/admin/users` | Liste utilisateurs |
| GET | `/api/admin/orders` | Commandes |
| GET | `/api/admin/tickets` | Support |
| GET | `/api/admin/finance` | Finance |

---

## 🚀 Étape 5 : Mettre en Ligne (Déploiement)

### Option A : Railway (Le plus simple, gratuit pour commencer)

1. Va sur https://railway.app
2. Connecte-toi avec GitHub
3. New Project → Deploy from GitHub repo
4. Ajoute tes variables d'environnement (.env) dans les Settings
5. Railway te donne une URL genre `vaulta-club.up.railway.app`
6. C'est en ligne ! 🎉

### Option B : Render (Gratuit aussi)

1. Va sur https://render.com
2. New → Web Service
3. Connecte ton repo GitHub
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Ajoute les variables .env dans Environment
7. Render te donne une URL

### Option C : VPS (Plus avancé, plus de contrôle)

Si tu veux un serveur dédié (OVH, Hetzner, DigitalOcean...) :
```bash
# Sur le serveur
sudo apt update && sudo apt install -y nodejs npm
git clone ton-repo
cd vaulta-backend
npm install
cp .env.example .env
nano .env  # remplis les valeurs
npm run seed
# Utilise PM2 pour garder le serveur actif
npm install -g pm2
pm2 start server.js --name vaulta
pm2 startup  # démarre auto au reboot
```

---

## 🔄 Prochaine Étape : Connecter le Frontend

Le frontend (vaulta-club.html) doit être modifié pour appeler les vraies routes API au lieu d'utiliser des données fictives. Par exemple :

```javascript
// AVANT (données fictives)
const products = [...]; // tableau codé en dur

// APRÈS (données du serveur)
const res = await fetch('/api/shop/products');
const products = await res.json();
```

Copie `vaulta-club.html` dans `public/index.html` et `vaulta-admin.html` dans `public/admin.html`.

---

## ❓ FAQ

**Q: C'est quoi JWT ?**
C'est un "badge" que le serveur donne à l'utilisateur quand il se connecte. Le badge prouve qu'il est connecté sans redemander le mot de passe à chaque page.

**Q: C'est quoi MongoDB ?**
C'est une base de données qui stocke les informations sous forme de "documents" (comme des fichiers JSON). Chaque utilisateur, carte, commande est un document.

**Q: Pourquoi Stripe ?**
C'est le service de paiement le plus utilisé. Il gère les cartes bancaires de façon sécurisée pour que tu n'aies jamais à stocker des numéros de carte.

**Q: C'est gratuit ?**
MongoDB Atlas M0 = gratuit (512 Mo). Railway/Render = gratuit pour les petits projets. Stripe = 1.4% + 0.25€ par transaction. Ton seul coût réel c'est Stripe quand les gens paient.

**Q: Comment changer le design ?**
Modifie les fichiers dans le dossier `public/`. Le HTML/CSS/JS du frontend sont là.

---

## 🛡️ Sécurité — Important !

- **NE JAMAIS** partager ton fichier `.env`
- **NE JAMAIS** commiter `.env` sur GitHub (le `.gitignore` est déjà configuré)
- Change les mots de passe par défaut IMMÉDIATEMENT
- En production, mets `NODE_ENV=production` dans `.env`
- Active le HTTPS (Railway et Render le font automatiquement)
