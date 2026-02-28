/**
 * 🗄️ VAULTA CLUB — Shared Data Store
 * Pont de données entre admin.html et index.html via localStorage
 */
const VaultaStore=(function(){
const KEYS={products:'vc_store_products',tcgs:'vc_store_tcgs',series:'vc_store_series',settings:'vc_store_settings',tickets:'vc_store_tickets',orders:'vc_store_orders',listings:'vc_store_listings',activity:'vc_store_activity'};

const DEFAULT_TCGS=[
  {id:'pokemon',name:'Pokémon',slug:'pokemon',active:true,order:1},
  {id:'onepiece',name:'One Piece',slug:'onepiece',active:true,order:2},
  {id:'yugioh',name:'Yu-Gi-Oh!',slug:'yugioh',active:false,order:3},
  {id:'dragonball',name:'Dragon Ball',slug:'dragonball',active:false,order:4},
  {id:'magic',name:'Magic: The Gathering',slug:'magic',active:false,order:5},
];
const DEFAULT_SERIES=[
  {id:'sv',name:'Écarlate & Violet',tcgId:'pokemon',active:true,order:1},
  {id:'swsh',name:'Épée & Bouclier',tcgId:'pokemon',active:true,order:2},
  {id:'op1',name:'Romance Dawn',tcgId:'onepiece',active:true,order:1},
];
const DEFAULT_PRODUCTS=[
  {id:1,tcgId:'pokemon',seriesId:'sv',fr:'pokemon',name:'Flammes Obsidiennes',sub:'Écarlate & Violet',series:'Écarlate & Violet',price:5.50,cards:10,badge:'hot',badgeText:'POPULAIRE',stock:24,grad:'linear-gradient(135deg,#dc2626,#ea580c,#f59e0b)',emoji:'🔥',boosterImg:'https://images.pokemontcg.io/sv3/logo.png',active:true,
  pool:[{name:'Charizard ex',r:'secret',e:'🔥',v:45,img:'https://images.pokemontcg.io/sv3/183.png'},{name:'Dragonite ex',r:'ultra',e:'🐉',v:15,img:'https://images.pokemontcg.io/sv3/159.png'},{name:'Tyranitar ex',r:'ultra',e:'🦖',v:12,img:'https://images.pokemontcg.io/sv3/170.png'},{name:'Eevee',r:'common',e:'🦊',v:0.5,img:'https://images.pokemontcg.io/sv3/130.png'},{name:'Pidgey',r:'common',e:'🐦',v:0.2,img:'https://images.pokemontcg.io/sv3/131.png'},{name:'Vespiquen ex',r:'rare',e:'🐝',v:6,img:'https://images.pokemontcg.io/sv3/6.png'},{name:'Greedent ex',r:'rare',e:'🐿️',v:5,img:'https://images.pokemontcg.io/sv3/134.png'},{name:'Revavroom ex',r:'rare',e:'🏎️',v:4,img:'https://images.pokemontcg.io/sv3/84.png'},{name:'Absol',r:'uncommon',e:'🌙',v:1.5,img:'https://images.pokemontcg.io/sv3/81.png'},{name:'Houndoom',r:'uncommon',e:'🐕',v:1,img:'https://images.pokemontcg.io/sv3/64.png'},{name:'Palafin',r:'common',e:'🐬',v:0.3,img:'https://images.pokemontcg.io/sv3/51.png'},{name:'Melmetal ex',r:'rare',e:'⚙️',v:7,img:'https://images.pokemontcg.io/sv3/93.png'}]},
  {id:2,tcgId:'pokemon',seriesId:'sv',fr:'pokemon',name:'Évolutions à Paldea',sub:'Écarlate & Violet',series:'Écarlate & Violet',price:5.50,cards:10,badge:null,stock:15,grad:'linear-gradient(135deg,#059669,#0891b2,#2563eb)',emoji:'🌿',boosterImg:'https://images.pokemontcg.io/sv2/logo.png',active:true,
  pool:[{name:'Chien-Pao ex',r:'secret',e:'❄️',v:40,img:'https://images.pokemontcg.io/sv2/176.png'},{name:'Ting-Lu ex',r:'ultra',e:'🦌',v:10,img:'https://images.pokemontcg.io/sv2/127.png'},{name:'Dedenne ex',r:'rare',e:'⚡',v:6,img:'https://images.pokemontcg.io/sv2/93.png'},{name:'Forretress ex',r:'rare',e:'💣',v:5,img:'https://images.pokemontcg.io/sv2/5.png'},{name:'Squawkabilly ex',r:'ultra',e:'🦜',v:16,img:'https://images.pokemontcg.io/sv2/169.png'},{name:'Slowpoke',r:'common',e:'🐚',v:0.3,img:'https://images.pokemontcg.io/sv2/46.png'},{name:'Nacli',r:'common',e:'🧂',v:0.3,img:'https://images.pokemontcg.io/sv2/103.png'},{name:'Dondozo',r:'uncommon',e:'🐟',v:1,img:'https://images.pokemontcg.io/sv2/57.png'},{name:'Varoom',r:'common',e:'🔩',v:0.2,img:'https://images.pokemontcg.io/sv2/117.png'}]},
  {id:3,tcgId:'pokemon',seriesId:'sv',fr:'pokemon',name:'151',sub:'Écarlate & Violet',series:'Écarlate & Violet',price:6.90,cards:10,badge:'new',badgeText:'NOUVEAU',stock:12,grad:'linear-gradient(135deg,#7c3aed,#db2777,#ec4899)',emoji:'🎴',boosterImg:'https://images.pokemontcg.io/sv3pt5/logo.png',active:true,
  pool:[{name:'Mew ex',r:'secret',e:'🧬',v:55,img:'https://images.pokemontcg.io/sv3pt5/205.png'},{name:'Alakazam ex',r:'ultra',e:'🥄',v:14,img:'https://images.pokemontcg.io/sv3pt5/65.png'},{name:'Venusaur ex',r:'rare',e:'🌺',v:8,img:'https://images.pokemontcg.io/sv3pt5/182.png'},{name:'Pikachu',r:'common',e:'⚡',v:1,img:'https://images.pokemontcg.io/sv3pt5/25.png'},{name:'Bulbasaur',r:'common',e:'🌱',v:0.5,img:'https://images.pokemontcg.io/sv3pt5/1.png'},{name:'Charmander',r:'common',e:'🦎',v:0.5,img:'https://images.pokemontcg.io/sv3pt5/4.png'},{name:'Squirtle',r:'common',e:'💧',v:0.4,img:'https://images.pokemontcg.io/sv3pt5/7.png'},{name:'Eevee',r:'uncommon',e:'🦊',v:1.5,img:'https://images.pokemontcg.io/sv3pt5/133.png'},{name:'Gengar ex',r:'rare',e:'👻',v:6,img:'https://images.pokemontcg.io/sv3pt5/94.png'},{name:'Zapdos ex',r:'ultra',e:'⚡',v:12,img:'https://images.pokemontcg.io/sv3pt5/145.png'}]},
  {id:4,tcgId:'pokemon',seriesId:'sv',fr:'pokemon',name:'Faille Paradoxe',sub:'Écarlate & Violet',series:'Écarlate & Violet',price:5.50,cards:10,badge:null,stock:20,grad:'linear-gradient(135deg,#6d28d9,#4f46e5,#2563eb)',emoji:'⏳',boosterImg:'https://images.pokemontcg.io/sv4/logo.png',active:true,
  pool:[{name:'Iron Valiant ex',r:'secret',e:'⚔️',v:38,img:'https://images.pokemontcg.io/sv4/205.png'},{name:'Roaring Moon ex',r:'ultra',e:'🌙',v:16,img:'https://images.pokemontcg.io/sv4/109.png'},{name:'Iron Hands ex',r:'ultra',e:'🤖',v:14,img:'https://images.pokemontcg.io/sv4/166.png'},{name:'Gholdengo ex',r:'rare',e:'💰',v:7,img:'https://images.pokemontcg.io/sv4/91.png'},{name:'Tinkatuff',r:'uncommon',e:'🔨',v:1,img:'https://images.pokemontcg.io/sv4/96.png'},{name:'Flamigo',r:'common',e:'🦩',v:0.3,img:'https://images.pokemontcg.io/sv4/128.png'},{name:'Ditto',r:'uncommon',e:'🟣',v:1.5,img:'https://images.pokemontcg.io/sv4/132.png'},{name:'Glimmet',r:'common',e:'💎',v:0.2,img:'https://images.pokemontcg.io/sv4/88.png'}]},
  {id:5,tcgId:'pokemon',seriesId:'sv',fr:'pokemon',name:'Forces Temporelles',sub:'Écarlate & Violet',series:'Écarlate & Violet',price:5.50,cards:10,badge:'ltd',badgeText:'LIMITÉ',stock:6,grad:'linear-gradient(135deg,#ea580c,#f59e0b,#eab308)',emoji:'⏰',boosterImg:'https://images.pokemontcg.io/sv5/logo.png',active:true,
  pool:[{name:'Walking Wake ex',r:'secret',e:'🌊',v:42,img:'https://images.pokemontcg.io/sv5/24.png'},{name:'Iron Leaves ex',r:'ultra',e:'🍃',v:15,img:'https://images.pokemontcg.io/sv5/23.png'},{name:'Flygon ex',r:'rare',e:'🐉',v:6,img:'https://images.pokemontcg.io/sv5/91.png'},{name:'Raikou',r:'rare',e:'⚡',v:5,img:'https://images.pokemontcg.io/sv5/33.png'},{name:'Ralts',r:'common',e:'💚',v:0.3,img:'https://images.pokemontcg.io/sv5/60.png'},{name:'Teddiursa',r:'common',e:'🧸',v:0.2,img:'https://images.pokemontcg.io/sv5/127.png'},{name:'Magikarp',r:'common',e:'🐟',v:0.1,img:'https://images.pokemontcg.io/sv5/29.png'}]},
  {id:6,tcgId:'pokemon',seriesId:'sv',fr:'pokemon',name:'Masque Crépusculaire',sub:'Écarlate & Violet',series:'Écarlate & Violet',price:5.50,cards:10,badge:'new',badgeText:'NOUVEAU',stock:30,grad:'linear-gradient(135deg,#14532d,#166534,#15803d)',emoji:'🎭',boosterImg:'https://images.pokemontcg.io/sv6/logo.png',active:true,
  pool:[{name:'Terapagos ex',r:'secret',e:'✨',v:48,img:'https://images.pokemontcg.io/sv6/171.png'},{name:'Sinistcha ex',r:'rare',e:'🍵',v:6,img:'https://images.pokemontcg.io/sv6/28.png'},{name:'Dipplin',r:'uncommon',e:'🍎',v:2,img:'https://images.pokemontcg.io/sv6/14.png'},{name:'Poltchageist',r:'common',e:'🫖',v:0.5,img:'https://images.pokemontcg.io/sv6/26.png'},{name:'Applin',r:'common',e:'🍏',v:0.3,img:'https://images.pokemontcg.io/sv6/12.png'},{name:'Phantump',r:'common',e:'🌳',v:0.2,img:'https://images.pokemontcg.io/sv6/24.png'},{name:'Lombre',r:'uncommon',e:'🌿',v:1,img:'https://images.pokemontcg.io/sv6/5.png'}]}
];
const DEFAULT_SETTINGS={siteName:'Vaulta Club',domain:'vaultaclub.com',contactEmail:'contact@vaultaclub.com',supportEmail:'support@vaultaclub.com',commission:8,featuredPrice:2.50,shippingFee:4.99,freeShippingMin:0,recycleRate:40,recycleEnabled:true,registrationOpen:true,emailVerification:true,maintenance:false,maintenanceMsg:'',welcomeBonus:45,stripeMode:'test',currency:'EUR'};

function _g(k,d){try{const r=localStorage.getItem(k);if(r)return JSON.parse(r)}catch(e){}return d}
function _s(k,d){try{localStorage.setItem(k,JSON.stringify(d))}catch(e){}}

return{
  getTCGs(){return _g(KEYS.tcgs,DEFAULT_TCGS)},
  saveTCGs(d){_s(KEYS.tcgs,d)},
  addTCG(t){const l=this.getTCGs();t.id=t.id||t.slug||('tcg_'+Date.now());t.order=l.length+1;l.push(t);this.saveTCGs(l);return t},
  updateTCG(id,u){const l=this.getTCGs();const i=l.findIndex(t=>t.id===id);if(i>=0){Object.assign(l[i],u);this.saveTCGs(l)}return l[i]},
  deleteTCG(id){let l=this.getTCGs();const i=l.findIndex(t=>t.id===id);if(i>=0){l[i].active=false;this.saveTCGs(l)}},

  getSeries(){return _g(KEYS.series,DEFAULT_SERIES)},
  saveSeries(d){_s(KEYS.series,d)},
  addSeries(s){const l=this.getSeries();s.id=s.id||('ser_'+Date.now());s.order=l.filter(x=>x.tcgId===s.tcgId).length+1;l.push(s);this.saveSeries(l);return s},
  updateSeries(id,u){const l=this.getSeries();const i=l.findIndex(s=>s.id===id);if(i>=0){Object.assign(l[i],u);this.saveSeries(l)}return l[i]},
  deleteSeries(id){let l=this.getSeries();l=l.filter(s=>s.id!==id);this.saveSeries(l)},

  getProducts(){return _g(KEYS.products,DEFAULT_PRODUCTS)},
  saveProducts(d){_s(KEYS.products,d)},
  getActiveProducts(){return this.getProducts().filter(p=>p.active!==false)},
  addProduct(p){const l=this.getProducts();p.id=p.id||(Math.max(0,...l.map(x=>x.id))+1);p.active=true;l.push(p);this.saveProducts(l);return p},
  updateProduct(id,u){const l=this.getProducts();const i=l.findIndex(p=>p.id===id);if(i>=0){Object.assign(l[i],u);this.saveProducts(l)}return l[i]},
  adjustStock(id,d){const l=this.getProducts();const p=l.find(x=>x.id===id);if(p){p.stock=Math.max(0,p.stock+d);this.saveProducts(l)}return p},
  setPrice(id,pr){const l=this.getProducts();const p=l.find(x=>x.id===id);if(p){p.price=pr;this.saveProducts(l)}return p},
  deleteProduct(id){const l=this.getProducts();const i=l.findIndex(p=>p.id===id);if(i>=0){l[i].active=false;this.saveProducts(l)}},
  nextProductId(){return Math.max(0,...this.getProducts().map(x=>x.id))+1},

  getSettings(){return _g(KEYS.settings,DEFAULT_SETTINGS)},
  saveSettings(d){_s(KEYS.settings,d)},
  getSetting(k){return this.getSettings()[k]},
  setSetting(k,v){const s=this.getSettings();s[k]=v;this.saveSettings(s)},

  getAllUsers(){
    const users=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k.startsWith('vc_data_')){
        const uid=k.replace('vc_data_','');
        try{const d=JSON.parse(localStorage.getItem(k));
          users.push({id:uid,bal:d.bal||0,cards:d.coll?d.coll.length:0,collValue:d.coll?d.coll.reduce((s,c)=>s+(c.v||0),0):0,txCount:d.txHistory?d.txHistory.length:0,lastTx:d.txHistory&&d.txHistory.length?d.txHistory[0]:null,txHistory:d.txHistory||[]})
        }catch(e){}
      }
    }
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k.startsWith('vc_user_meta_')){
        const uid=k.replace('vc_user_meta_','');
        try{const m=JSON.parse(localStorage.getItem(k));const ex=users.find(u=>u.id===uid);if(ex)Object.assign(ex,m);else users.push({id:uid,bal:0,cards:0,collValue:0,txCount:0,...m})}catch(e){}
      }
    }
    return users;
  },
  getUserData(uid){try{const r=localStorage.getItem('vc_data_'+uid);return r?JSON.parse(r):null}catch(e){return null}},
  setUserData(uid,d){_s('vc_data_'+uid,d)},
  getUserMeta(uid){return _g('vc_user_meta_'+uid,{})},
  setUserMeta(uid,m){_s('vc_user_meta_'+uid,m)},
  updateUserBalance(uid,b){const d=this.getUserData(uid);if(d){d.bal=b;this.setUserData(uid,d)}},
  banUser(uid){this.setUserMeta(uid,{...this.getUserMeta(uid),status:'banned'})},
  unbanUser(uid){this.setUserMeta(uid,{...this.getUserMeta(uid),status:'active'})},

  getTickets(){return _g(KEYS.tickets,[])},
  saveTickets(d){_s(KEYS.tickets,d)},
  addTicket(t){const l=this.getTickets();t.id=t.id||('TK-'+(1000+l.length));t.createdAt=t.createdAt||new Date().toISOString();t.status=t.status||'open';t.messages=t.messages||[];l.push(t);this.saveTickets(l);return t},
  respondTicket(id,msg,st){const l=this.getTickets();const t=l.find(x=>x.id===id);if(t){if(msg)t.messages.push({sender:'admin',content:msg,date:new Date().toISOString()});if(st)t.status=st;this.saveTickets(l)}return t},

  getOrders(){return _g(KEYS.orders,[])},
  saveOrders(d){_s(KEYS.orders,d)},
  addOrder(o){const l=this.getOrders();o.id=o.id||('CMD-'+(3000+l.length));o.createdAt=o.createdAt||new Date().toISOString();o.status=o.status||'pending';l.push(o);this.saveOrders(l);return o},
  updateOrderStatus(id,st,tr){const l=this.getOrders();const o=l.find(x=>x.id===id);if(o){o.status=st;if(tr)o.tracking=tr;if(st==='shipped')o.shippedAt=new Date().toISOString();if(st==='delivered')o.deliveredAt=new Date().toISOString();this.saveOrders(l)}return o},

  getListings(){return _g(KEYS.listings,[])},
  saveListings(d){_s(KEYS.listings,d)},

  getActivity(){return _g(KEYS.activity,[])},
  logActivity(a){const l=this.getActivity();l.unshift({...a,time:new Date().toISOString()});if(l.length>200)l.length=200;_s(KEYS.activity,l)},

  getStats(){
    const p=this.getProducts(),u=this.getAllUsers(),o=this.getOrders(),t=this.getTickets();
    return{totalUsers:u.length,totalStock:p.reduce((s,x)=>s+(x.stock||0),0),stockValue:p.reduce((s,x)=>s+(x.stock||0)*(x.price||0),0),totalCardsOpened:u.reduce((s,x)=>s+(x.cards||0),0),totalCollValue:u.reduce((s,x)=>s+(x.collValue||0),0),pendingOrders:o.filter(x=>x.status==='pending').length,openTickets:t.filter(x=>x.status==='open'||x.status==='in_progress').length,activeProducts:p.filter(x=>x.active!==false).length,lowStock:p.filter(x=>x.active!==false&&x.stock>0&&x.stock<=5).length}
  },

  init(){
    if(!localStorage.getItem(KEYS.products))this.saveProducts(DEFAULT_PRODUCTS);
    if(!localStorage.getItem(KEYS.tcgs))this.saveTCGs(DEFAULT_TCGS);
    if(!localStorage.getItem(KEYS.series))this.saveSeries(DEFAULT_SERIES);
    if(!localStorage.getItem(KEYS.settings))this.saveSettings(DEFAULT_SETTINGS);
  },
  reset(){this.saveProducts(DEFAULT_PRODUCTS);this.saveTCGs(DEFAULT_TCGS);this.saveSeries(DEFAULT_SERIES);this.saveSettings(DEFAULT_SETTINGS)}
};
})();
VaultaStore.init();
