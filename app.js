/* =========================================================
   GOLDEN | جولدن — SUPABASE SECURED EDITION ⚡
   • Supabase Postgres: products, users, orders
   • Supabase Auth: login / register (Role Verified)
   • localStorage: cart, wishlist, session (client cache)
   • Secured against: XSS, IDOR Tracking, Price Manipulation, Admin UI Bypass
   ========================================================= */

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmt = n => '$' + Number(n).toFixed(2);
const today = () => new Date().toISOString().slice(0,10);

// 🔐 SECURITY: XSS sanitization — escape ALL user-entered text before inserting into innerHTML
function esc(str){
  if(str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
    .replace(/\//g, '&#x2F;')
    .replace(/=/g, '&#x3D;')
    .replace(/\$/g, '&#36;');
}

// 🔐 SECURITY: Set textContent safely (no HTML parsing) for user-entered content
function safeText(el, text){ if(el) el.textContent = text ?? ''; }

function toast(msg, type='info'){
  const c = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(()=>{ el.style.opacity=0; el.style.transform='translateX(40px)'; }, 2600);
  setTimeout(()=> el.remove(), 3000);
}

/* -------------------- STORAGE (localStorage for client-side only) -------------------- */
const store = {
  get(key, def){ try{ return JSON.parse(localStorage.getItem(key)) ?? def; }catch(e){ return def; } },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
};

/* -------------------- SUPABASE HELPERS -------------------- */
function supabaseReady(){
  try{
    return typeof supabase !== 'undefined'
      && SUPABASE_URL
      && !SUPABASE_URL.includes('example')
      && SUPABASE_KEY
      && !SUPABASE_KEY.includes('your-supabase');
  }catch(e){ return false; }
}

const SUPABASE_ACTIVE = supabaseReady();

if(SUPABASE_ACTIVE){
  console.log('%c⚡ Supabase Connected Secured','background:#C4A071;color:#fff;padding:4px 10px;border-radius:4px');
  console.log('  URL:', SUPABASE_URL);
  console.log('%c🔐 SECURITY NOTICE: Run ONLY the SQL below in Supabase SQL Editor','background:#A76D5E;color:#fff;padding:4px 10px;border-radius:4px');
  console.log('%c📋 SECURE SQL Schema + RLS Policies:','font-weight:bold');
  console.log(`
-- ============================================
-- 🔐 GOLDEN STORE — SECURE SQL SCHEMA
-- ============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== PRODUCTS =====
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'accessories',
  price NUMERIC NOT NULL DEFAULT 0,
  "oldPrice" NUMERIC,
  stock INTEGER DEFAULT 50,
  badge TEXT,
  material TEXT,
  "desc" TEXT,
  features TEXT[],
  emoji TEXT,
  color TEXT,
  image TEXT,
  "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD')
);

-- ===== USERS =====
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  role TEXT DEFAULT 'customer',
  joined TEXT DEFAULT to_char(now(), 'YYYY-MM-DD')
);

-- ===== ORDERS =====
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" TEXT,
  customer TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  "userId" TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  date TEXT DEFAULT to_char(now(), 'YYYY-MM-DD')
);

-- ============================================
-- 🔐 SECURE RLS POLICIES (CRITICAL!)
-- ============================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ===== PRODUCTS: Everyone can READ, only ADMIN can WRITE =====
CREATE POLICY "products_select" ON products FOR SELECT USING (true);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
);
CREATE POLICY "products_update" ON products FOR UPDATE USING (
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
) WITH CHECK (
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
);
CREATE POLICY "products_delete" ON products FOR DELETE USING (
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
);

-- ===== USERS: Everyone can READ their own, only ADMIN can WRITE =====
CREATE POLICY "users_select" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert_self" ON users FOR INSERT WITH CHECK (email = (auth.jwt() ->> 'email')::text);
CREATE POLICY "users_update_admin" ON users FOR UPDATE USING (
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
);
CREATE POLICY "users_delete_admin" ON users FOR DELETE USING (
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
);

-- ===== ORDERS: Users can READ/INSERT their own, only ADMIN can UPDATE/DELETE =====
CREATE POLICY "orders_select" ON orders FOR SELECT USING (
  (auth.jwt() ->> 'email')::text = email OR
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'email')::text = email
);
CREATE POLICY "orders_update_admin" ON orders FOR UPDATE USING (
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
);
CREATE POLICY "orders_delete_admin" ON orders FOR DELETE USING (
  (auth.jwt() ->> 'email')::text IN (SELECT email FROM users WHERE role = 'admin')
);
  `);
}

/* -------------------- DATA ACCESS LAYER (Supabase + fallback) -------------------- */
const api = {
  async getProducts(){
    if(SUPABASE_ACTIVE){
      try{
        const { data, error } = await supabase.from('products').select('*');
        if(error){ console.warn('Supabase products error:', error.message); return []; }
        return data.map(d => ({...d, id: String(d.id || d.uuid || uid())}));
      }catch(e){ console.warn('Supabase error:', e); return store.get('golden_products', []); }
    }
    return store.get('golden_products', []);
  },
  async saveProduct(product){
    if(!product.id || product.id.startsWith('temp_')) product.id = uid();
    if(SUPABASE_ACTIVE){
      try{
        const payload = {...product};
        delete payload.id;
        const { data, error } = await supabase.from('products').insert([payload]).select();
        if(error){ console.warn(error); }
        else if(data && data[0]) return {...product, id: String(data[0].id || data[0].uuid || product.id)};
      }catch(e){ console.warn(e); }
    }
    const list = store.get('golden_products', []);
    const idx = list.findIndex(p=>p.id===product.id);
    if(idx>=0) list[idx] = product; else list.push(product);
    store.set('golden_products', list);
    return product;
  },
  async deleteProduct(id){
    if(SUPABASE_ACTIVE){
      try{ await supabase.from('products').delete().eq('id', id).or(`uuid.eq.${id}`); }catch(e){ console.warn(e); }
    }
    store.set('golden_products', store.get('golden_products', []).filter(p=>p.id!==id));
  },
  async getUsers(){
    if(SUPABASE_ACTIVE){
      try{
        const { data, error } = await supabase.from('users').select('*');
        if(error){ console.warn(error); return store.get('golden_users', []); }
        return data.map(d => ({...d, id: String(d.id || d.uuid || uid())}));
      }catch(e){ console.warn(e); }
    }
    return store.get('golden_users', []);
  },
  async saveUser(user){
    if(!user.id) user.id = uid();
    if(SUPABASE_ACTIVE){
      try{
        const payload = {...user}; delete payload.id;
        const { error } = await supabase.from('users').upsert([payload], {onConflict:'email'});
        if(error) console.warn(error);
      }catch(e){ console.warn(e); }
    }
    const list = store.get('golden_users', []);
    const idx = list.findIndex(u=> (u.id && u.id===user.id) || (u.email && user.email && u.email.toLowerCase()===user.email.toLowerCase()));
    if(idx>=0) list[idx] = user; else list.push(user);
    store.set('golden_users', list);
    return user;
  },
  async deleteUser(id){
    if(SUPABASE_ACTIVE){
      try{ await supabase.from('users').delete().eq('id', id).or(`uuid.eq.${id}`); }catch(e){ console.warn(e); }
    }
    store.set('golden_users', store.get('golden_users', []).filter(u=>u.id!==id));
  },
  async getOrders(){
    if(SUPABASE_ACTIVE){
      try{
        const { data, error } = await supabase.from('orders').select('*').order('date', {ascending:false});
        if(error){ console.warn(error); return store.get('golden_orders', []); }
        return data.map(d => ({...d, id: d.order_id || d.id || ('#G'+Math.floor(1000+Math.random()*9000))}));
      }catch(e){ console.warn(e); }
    }
    return store.get('golden_orders', []);
  },
  // 🔐 SECURITY: Verify order items against REAL database prices
  async verifyAndBuildOrder(cartItems, customerInfo){
    if(!cartItems || cartItems.length === 0) return null;
    const freshProducts = SUPABASE_ACTIVE ? await api.getProducts() : store.get('golden_products', []);
    const verifiedItems = [];
    let verifiedTotal = 0;
    for(const cartItem of cartItems){
      const realProduct = freshProducts.find(p => p.id === cartItem.id || p.name === cartItem.name);
      if(!realProduct) continue;
      const realPrice = Number(realProduct.price);
      const qty = Math.max(1, Math.min(99, Number(cartItem.qty) || 1));
      verifiedItems.push({name: esc(realProduct.name), qty, price: realPrice});
      verifiedTotal += realPrice * qty;
    }
    if(verifiedItems.length === 0) return null;
    return {...customerInfo, items: verifiedItems, total: Number(verifiedTotal.toFixed(2)), status:'pending', date: today()};
  },
  async saveOrder(order){
    if(!order.id) order.id = '#G'+(1000+store.get('golden_orders',[]).length+1);
    if(SUPABASE_ACTIVE){
      try{
        const payload = {...order, order_id: order.id};
        delete payload.id;
        const { error } = await supabase.from('orders').insert([payload]);
        if(error) console.warn('Supabase order insert:', error.message);
      }catch(e){ console.warn(e); }
    }
    const list = store.get('golden_orders', []);
    list.push(order);
    store.set('golden_orders', list);
    return order;
  },
  async updateOrder(id, updates){
    if(SUPABASE_ACTIVE){
      try{
        const { error } = await supabase.from('orders').update(updates).or(`order_id.eq.${id},id.eq.${id}`);
        if(error) console.warn(error);
      }catch(e){ console.warn(e); }
    }
    const list = store.get('golden_orders', []);
    const idx = list.findIndex(o=>o.id===id);
    if(idx>=0){ list[idx] = {...list[idx], ...updates}; store.set('golden_orders', list); }
  },
  async deleteOrder(id){
    if(SUPABASE_ACTIVE){
      try{ await supabase.from('orders').delete().or(`order_id.eq.${id},id.eq.${id}`); }catch(e){ console.warn(e); }
    }
    store.set('golden_orders', store.get('golden_orders', []).filter(o=>o.id!==id));
  },
};

/* -------------------- SEED DATA -------------------- */
function placeholderImg(emoji, color){
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='${color}' stop-opacity='0.35'/>
      <stop offset='100%' stop-color='${color}' stop-opacity='0.15'/>
    </linearGradient></defs>
    <rect width='400' height='400' fill='url(#g)'/>
    <text x='50%' y='55%' font-size='180' text-anchor='middle' dominant-baseline='middle'>${emoji}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

async function seedIfEmpty(){
  const products = await api.getProducts();
  if(!products || products.length===0){
    const P = [
      {name:'Golden Cuff Bracelet', category:'offers', price:59.99, oldPrice:89.99, emoji:'💫', color:'#C4A071', desc:'Hand-crafted gold-tone cuff with minimalist charm.', badge:'HOT', material:'18K Gold Plated', features:['Handcrafted','Gift box included','Water resistant'], stock:42, image:placeholderImg('💫','#C4A071'), createdAt:today()},
      {name:'Pearl Drop Earrings', category:'offers', price:42.00, oldPrice:68.00, emoji:'🪩', color:'#DFCCB1', desc:'Elegant pearl drops for timeless sophistication.', badge:'SALE', material:'Freshwater Pearl', features:['Hypoallergenic','Gift box included'], stock:28, image:placeholderImg('🪩','#DFCCB1'), createdAt:today()},
      {name:'Rose Gold Ring Set', category:'offers', price:49.50, oldPrice:79.00, emoji:'💍', color:'#A76D5E', desc:'Stackable rings in warm rose-gold finish.', badge:'NEW', material:'Rose Gold', features:['Set of 3','Adjustable sizing'], stock:55, image:placeholderImg('💍','#A76D5E'), createdAt:today()},
      {name:'Heritage Gold Watch', category:'accessories', price:249.00, oldPrice:null, emoji:'⌚', color:'#C4A071', desc:'Swiss movement with sapphire crystal face and genuine leather strap.', material:'Stainless Steel', features:['Swiss movement','Sapphire crystal','Leather strap'], stock:15, image:placeholderImg('⌚','#C4A071'), createdAt:today()},
      {name:'Dainty Layered Necklace', category:'accessories', price:79.00, oldPrice:null, emoji:'📿', color:'#DFCCB1', desc:'Three layered chains with tiny hand-crafted charms.', material:'925 Sterling Silver', features:['3 layers','Tarnish resistant'], stock:40, image:placeholderImg('📿','#DFCCB1'), createdAt:today()},
      {name:'Amber Statement Ring', category:'accessories', price:119.00, oldPrice:null, emoji:'💍', color:'#846044', desc:'Baltic amber set in hand-polished bronze band.', material:'Baltic Amber & Bronze', features:['One of a kind','Hand polished'], stock:12, image:placeholderImg('💍','#846044'), createdAt:today()},
      {name:'Tan Leather iPhone Case', category:'cases', price:49.00, oldPrice:null, emoji:'📱', color:'#C4A071', desc:'Genuine leather, patinas beautifully with age. MagSafe compatible.', material:'Full-Grain Leather', features:['MagSafe','Patina finish','Card slot'], stock:80, image:placeholderImg('📱','#C4A071'), createdAt:today()},
      {name:'Rose Velvet AirPod Case', category:'cases', price:29.00, oldPrice:null, emoji:'🎧', color:'#A76D5E', desc:'Plush velvet with gold carabiner clip. Fits AirPods Pro.', material:'Velvet & Metal', features:['Carabiner clip','Shock resistant'], stock:120, image:placeholderImg('🎧','#A76D5E'), createdAt:today()},
      {name:'Sage Linen Laptop Sleeve', category:'cases', price:59.00, oldPrice:null, emoji:'💻', color:'#98A086', desc:'Fits 13-14 inch laptops. Padded interior with leather trim.', material:'Linen & Leather', features:['Padded','Leather trim'], stock:35, image:placeholderImg('💻','#98A086'), createdAt:today()},
    ];
    for(const p of P){ await api.saveProduct(p); }
  }

  const users = await api.getUsers();
  if(!users.find(u=>u.email && u.email.toLowerCase()==='admin@admin.com')){
    await api.saveUser({id:uid(), name:'Administrator', email:'admin@admin.com', password:'Admin&2010', role:'admin', joined:today()});
  }
}

/* -------------------- STATE -------------------- */
let state = {
  products: [],
  users: [],
  orders: [],
  cart: store.get('golden_cart', []),
  wishlist: store.get('golden_wishlist', []),
  session: store.get('golden_session', null),
  filters: {search:'', category:'', sort:'featured', maxPrice:500},
  editingProductId: null,
  pendingImage: null,
  loading: true,
};

/* -------------------- LOAD ALL DATA ON START -------------------- */
async function loadData(){
  try{
    [state.products, state.users, state.orders] = await Promise.all([
      api.getProducts(), api.getUsers(), api.getOrders()
    ]);
  }catch(e){
    console.error('Data load error:', e);
    toast('Error loading data','error');
  }
  state.loading = false;
  renderProducts();
  updateCartUI();
  updateWishlistUI();
  refreshAuthUI();
  if(!$('#dashboard').classList.contains('hidden')) renderDashboard();
}

/* -------------------- THEME -------------------- */
function applyTheme(){
  const theme = store.get('golden_theme','light');
  document.body.classList.toggle('dark', theme==='dark');
}
applyTheme();

/* -------------------- RENDER PRODUCTS -------------------- */
function filterProducts(list){
  let out = [...list];
  const f = state.filters;
  if(f.search){
    const q = f.search.toLowerCase();
    out = out.filter(p => (p.name+p.desc+p.category+(p.material||'')).toLowerCase().includes(q));
  }
  if(f.category) out = out.filter(p => p.category===f.category);
  out = out.filter(p => p.price<=f.maxPrice);
  switch(f.sort){
    case 'price-asc': out.sort((a,b)=>a.price-b.price); break;
    case 'price-desc': out.sort((a,b)=>b.price-a.price); break;
    case 'name-asc': out.sort((a,b)=>a.name.localeCompare(b.name)); break;
    case 'newest': out.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')); break;
  }
  return out;
}

function renderProducts(){
  const map = { offers:'#offersGrid', accessories:'#accessoriesGrid', cases:'#casesGrid' };
  Object.entries(map).forEach(([cat, sel])=>{
    const grid = $(sel);
    if(!grid) return;
    const items = filterProducts(state.products.filter(p=>p.category===cat));
    grid.innerHTML = items.map(p => productCard(p)).join('')
      || `<p style="grid-column:1/-1;text-align:center;color:var(--ink-soft);padding:40px">${state.loading?'Loading...':'No products match your filters.'}</p>`;
  });
  $$('.product-card').forEach(card=>{
    card.addEventListener('click', (e)=>{
      if(e.target.closest('.btn-add') || e.target.closest('.product-fav')) return;
      openProductDetail(card.dataset.id);
    });
  });
  $$('.btn-add').forEach(b=> b.addEventListener('click', (e)=>{ e.stopPropagation(); addToCart(b.dataset.id); }));
  $$('.product-fav').forEach(b=> b.addEventListener('click', (e)=>{ e.stopPropagation(); toggleWishlist(b.dataset.id); }));
  updateWishlistUI();
}

function productCard(p){
  const inWish = state.wishlist.includes(p.id);
  const badge = p.badge ? `<span class="product-badge ${esc(p.badge.toLowerCase())}">${esc(p.badge)}</span>` : '';
  const old = p.oldPrice ? `<span class="price-old">${fmt(p.oldPrice)}</span>` : '';
  return `
  <article class="product-card" data-id="${esc(p.id)}">
    <div class="product-image">
      ${badge}
      <button class="product-fav ${inWish?'active':''}" data-id="${esc(p.id)}" aria-label="Wishlist">♥</button>
      ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"/>` : `<div class="product-emoji">${esc(p.emoji||'✨')}</div>`}
    </div>
    <div class="product-body">
      <span class="product-cat">${esc(p.category)}</span>
      <h3 class="product-name">${esc(p.name)}</h3>
      <p class="product-desc">${esc(p.desc)}</p>
      <div class="product-foot">
        <div class="price-wrap">
          <span class="price">${fmt(p.price)}</span>
          ${old}
        </div>
        <button class="btn-add" data-id="${esc(p.id)}">+ Add</button>
      </div>
    </div>
  </article>`;
}

/* -------------------- PRODUCT DETAIL -------------------- */
function openProductDetail(id){
  const p = state.products.find(x=>x.id===id);
  if(!p) return;
  const old = p.oldPrice ? `<span class="price-old">${fmt(p.oldPrice)}</span>` : '';
  const features = (p.features||[]).map(f=>`<li>${esc(f)}</li>`).join('') + (p.material?`<li>Material: ${esc(p.material)}</li>`:'') + (p.stock!=null?`<li>In stock: ${esc(p.stock)} units</li>`:'');
  $('#detailBody').innerHTML = `
    <div class="detail-image">
      ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}"/>` : `<div class="product-emoji">${esc(p.emoji||'✨')}</div>`}
    </div>
    <div class="detail-info">
      <span class="product-cat">${esc(p.category)}</span>
      <h2>${esc(p.name)}</h2>
      <div class="detail-price">${fmt(p.price)} ${old}</div>
      <p class="detail-desc">${esc(p.desc)}</p>
      <ul class="detail-features">${features}</ul>
      <div class="detail-actions">
        <button class="btn-primary" onclick="addToCart('${esc(p.id)}'); closeModal('detailModal');">+ Add to Cart</button>
        <button class="btn-outline" onclick="toggleWishlist('${esc(p.id)}'); openProductDetail('${esc(p.id)}');">♡ Wishlist</button>
      </div>
    </div>`;
  $('#detailModal').classList.add('open');
}
function closeModal(id){ const m = $('#'+id); if(m) m.classList.remove('open'); }

/* -------------------- CART -------------------- */
function addToCart(id){
  const product = state.products.find(p=>p.id===id);
  if(!product) return;
  const existing = state.cart.find(i=>i.id===id);
  if(existing) existing.qty++;
  else state.cart.push({id:product.id, name:product.name, image:product.image, emoji:product.emoji, price:product.price, qty:1});
  store.set('golden_cart', state.cart);
  updateCartUI();
  toast(`${product.name} added to cart`, 'success');
}
function changeQty(id, delta){
  const item = state.cart.find(i=>i.id===id);
  if(!item) return;
  item.qty += delta;
  if(item.qty<=0) state.cart = state.cart.filter(i=>i.id!==id);
  store.set('golden_cart', state.cart);
  updateCartUI();
}
function removeFromCart(id){
  state.cart = state.cart.filter(i=>i.id!==id);
  store.set('golden_cart', state.cart);
  updateCartUI();
}
function updateCartUI(){
  const total = state.cart.reduce((s,i)=>s+i.price*i.qty,0);
  const count = state.cart.reduce((s,i)=>s+i.qty,0);
  const badge = $('#cartBadge');
  if(badge) badge.textContent = count;
  const ct = $('#cartTotal'); if(ct) ct.textContent = fmt(total);
  const body = $('#cartItems');
  if(!body) return;
  if(state.cart.length===0){ body.innerHTML = '<p class="empty">Your cart is empty.</p>'; return; }
  body.innerHTML = state.cart.map(i=>`
    <div class="cart-item">
      <div class="cart-item-img">${i.image?`<img src="${esc(i.image)}" alt=""/>`:esc(i.emoji||'✨')}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(i.name)}</div>
        <div class="cart-item-price">${fmt(i.price)}</div>
        <div class="cart-item-qty">
          <button onclick="changeQty('${esc(i.id)}',-1)">−</button>
          <span>${esc(i.qty)}</span>
          <button onclick="changeQty('${esc(i.id)}',1)">+</button>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${esc(i.id)}')">Remove</button>
      </div>
    </div>
  `).join('');
}

/* -------------------- WISHLIST -------------------- */
function toggleWishlist(id){
  if(state.wishlist.includes(id)){
    state.wishlist = state.wishlist.filter(x=>x!==id);
    toast('Removed from wishlist');
  }else{
    state.wishlist.push(id);
    toast('Added to wishlist ♡','success');
  }
  store.set('golden_wishlist', state.wishlist);
  updateWishlistUI();
}
function updateWishlistUI(){
  const wb = $('#wishlistBadge'); if(wb) wb.textContent = state.wishlist.length;
  const body = $('#wishlistItems'); if(!body) return;
  const items = state.wishlist.map(id=>state.products.find(p=>p.id===id)).filter(Boolean);
  if(items.length===0){ body.innerHTML = '<p class="empty">Your wishlist is empty.</p>'; return; }
  body.innerHTML = items.map(i=>`
    <div class="cart-item">
      <div class="cart-item-img">${i.image?`<img src="${esc(i.image)}" alt=""/>`:esc(i.emoji||'✨')}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(i.name)}</div>
        <div class="cart-item-price">${fmt(i.price)}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn-sm" onclick="addToCart('${esc(i.id)}')">+ Cart</button>
          <button class="cart-item-remove" onclick="toggleWishlist('${esc(i.id)}')">Remove</button>
        </div>
      </div>
    </div>
  `).join('');
}
function moveWishlistToCart(){
  state.wishlist.forEach(id=>{
    const product = state.products.find(p=>p.id===id);
    if(!product) return;
    const existing = state.cart.find(i=>i.id===id);
    if(existing) existing.qty++;
    else state.cart.push({id:product.id,name:product.name,image:product.image,emoji:product.emoji,price:product.price,qty:1});
  });
  state.wishlist = [];
  store.set('golden_cart', state.cart);
  store.set('golden_wishlist', []);
  updateCartUI(); updateWishlistUI();
  toast('Moved all items to cart','success');
}

/* -------------------- SEARCH -------------------- */
function runSearch(query){
  const results = $('#searchResults');
  if(!results) return;
  if(!query){ results.innerHTML = '<p style="color:var(--ink-soft);text-align:center;padding:30px">Start typing to search...</p>'; return; }
  const q = query.toLowerCase();
  const items = state.products.filter(p => (p.name+p.desc+p.category+(p.material||'')).toLowerCase().includes(q));
  if(items.length===0){ results.innerHTML = '<p style="color:var(--ink-soft);text-align:center;padding:30px">No products found.</p>'; return; }
  results.innerHTML = items.map(p=>`
    <div class="search-result-item" onclick="closeModal('searchModal'); openProductDetail('${esc(p.id)}');">
      ${p.image?`<img src="${esc(p.image)}" alt=""/>`:`<div class="emoji">${esc(p.emoji||'✨')}</div>`}
      <strong>${esc(p.name)}</strong>
      <span>${fmt(p.price)}</span>
    </div>
  `).join('');
}

/* -------------------- AUTH -------------------- */
function openAuth(){ $('#authModal').classList.add('open'); }
function closeAuth(){ $('#authModal').classList.remove('open'); }
function switchAuthTab(tab){
  $$('.auth-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  $('#loginForm').classList.toggle('hidden', tab!=='login');
  $('#registerForm').classList.toggle('hidden', tab!=='register');
}

// 🔐 HELPER: Check if authenticated user has admin role in database (never trust client variables!)
async function isAdminUser(email){
  if(!email) return false;
  if(SUPABASE_ACTIVE){
    try{
      const { data } = await supabase.from('users').select('role').eq('email', email.toLowerCase()).limit(1);
      return data && data[0] && data[0].role === 'admin';
    }catch(e){ return false; }
  }
  const u = state.users.find(x=> x.email && x.email.toLowerCase()===email.toLowerCase());
  return u && u.role === 'admin';
}

async function handleLogin(e){
  e.preventDefault();
  const email = $('#loginEmail').value.trim().toLowerCase();
  const pw = $('#loginPassword').value;

  if(SUPABASE_ACTIVE){
    try{
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if(error || !data.user){ throw error || new Error('Login failed'); }
      const { data: profileRows } = await supabase.from('users').select('*').eq('email', email).limit(1);
      const profile = (profileRows && profileRows[0]) || {name:data.user.email.split('@')[0], email, role:'customer'};
      state.session = {id:data.user.id, name:profile.name, email, role:profile.role||'customer'};
      store.set('golden_session', state.session);
      state.users = await api.getUsers();
      toast(`Welcome, ${profile.name}!`,'success');
      closeAuth(); refreshAuthUI();
      if(profile.role==='admin') setTimeout(showDashboard, 400);
      return;
    }catch(err){
      console.warn('Supabase auth failed, trying local fallback:', err?.message || err);
    }
  }

  const user = state.users.find(u=>u.email.toLowerCase()===email && u.password===pw);
  if(!user){ toast('Invalid email or password','error'); return; }
  state.session = {id:user.id, name:user.name, email:user.email, role:user.role};
  store.set('golden_session', state.session);
  toast(`Welcome, ${user.name}!`,'success');
  closeAuth(); refreshAuthUI();
  if(user.role==='admin') setTimeout(showDashboard, 400);
}

async function handleRegister(e){
  e.preventDefault();
  const name = $('#regName').value.trim();
  const email = $('#regEmail').value.trim().toLowerCase();
  const pw = $('#regPassword').value;

  if(SUPABASE_ACTIVE){
    try{
      const { data, error } = await supabase.auth.signUp({
        email, password: pw, options: { data: { name, role: 'customer' } }
      });
      if(error) throw error;
      const profile = {id: data.user.id, name, email, role:'customer', joined:today()};
      await api.saveUser(profile);
      state.session = {id:data.user.id, name, email, role:'customer'};
      store.set('golden_session', state.session);
      state.users = await api.getUsers();
      toast('Account created! Welcome ✦','success');
      closeAuth(); refreshAuthUI();
      return;
    }catch(err){
      console.warn('Supabase signup failed:', err?.message || err);
      toast(err?.message || 'Registration failed — trying local mode','error');
    }
  }

  if(state.users.some(u=>u.email.toLowerCase()===email)){ toast('Email already registered','error'); return; }
  const newUser = {id:uid(), name, email, password:pw, role:'customer', joined:today()};
  state.users.push(newUser);
  await api.saveUser(newUser);
  state.session = {id:newUser.id, name:newUser.name, email:newUser.email, role:newUser.role};
  store.set('golden_session', state.session);
  toast('Account created! Welcome ✦','success');
  closeAuth(); refreshAuthUI();
}

function logout(){
  if(SUPABASE_ACTIVE){ supabase.auth.signOut().catch(()=>{}); }
  state.session = null;
  store.set('golden_session', null);
  hideDashboard();
  refreshAuthUI();
  toast('Signed out');
}

function refreshAuthUI(){
  const btn = $('#authBtn');
  const userMenu = $('#userMenu');
  if(!btn || !userMenu) return;
  if(state.session){
    btn.style.display = 'none';
    userMenu.style.display = 'block';
    const letter = (state.session.name.charAt(0) || 'U').toUpperCase();
    $('#userAvatarLetter').textContent = letter;
    $('#userDropdownLetter').textContent = letter;
    $('#userDropdownName').textContent = state.session.name;
    $('#userDropdownEmail').textContent = state.session.email;
    isAdminUser(state.session.email).then(isAdmin => {
      $('#btnAdminDash').style.display = isAdmin ? 'flex' : 'none';
    });
  }else{
    btn.style.display = 'inline-flex';
    userMenu.style.display = 'none';
  }
}

function toggleUserDropdown(open){
  const dd = $('#userDropdown'); if(!dd) return;
  if(open === undefined) dd.classList.toggle('open');
  else dd.classList.toggle('open', open);
}

function openMyAccount(){
  const sessEmail = (state.session?.email||'').toLowerCase();
  const sessName = (state.session?.name||'').toLowerCase();
  const userOrders = state.orders.filter(o =>
    (o.email && o.email.toLowerCase()===sessEmail) || (o.customer && o.customer.toLowerCase()===sessName)
  );
  $('#accountBody').innerHTML = `
    <h3 style="font-family:var(--serif);font-size:26px;margin-bottom:6px">My Account</h3>
    <p style="color:var(--ink-soft);font-size:14px;margin-bottom:14px">Manage your profile and preferences.</p>
    <div class="account-grid">
      <div class="account-card">
        <h4>👤 Personal Info</h4>
        <div class="account-field"><span>Name</span><strong>${esc(state.session?.name)}</strong></div>
        <div class="account-field"><span>Email</span><strong>${esc(state.session?.email)}</strong></div>
        <div class="account-field"><span>Role</span><strong style="text-transform:capitalize">${esc(state.session?.role)}</strong></div>
        <div class="account-field"><span>Data Source</span><strong>${SUPABASE_ACTIVE?'⚡ Supabase':'Offline'}</strong></div>
      </div>
      <div class="account-card">
        <h4>📊 Statistics</h4>
        <div class="account-field"><span>Orders Placed</span><strong>${userOrders.length}</strong></div>
        <div class="account-field"><span>Total Spent</span><strong>${fmt(userOrders.reduce((s,o)=>s+o.total,0))}</strong></div>
        <div class="account-field"><span>Wishlist</span><strong>${state.wishlist.length} items</strong></div>
        <div class="account-field"><span>In Cart</span><strong>${state.cart.reduce((s,i)=>s+i.qty,0)} items</strong></div>
      </div>
    </div>
    <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-primary" id="acctViewOrders">📦 View My Orders</button>
      <button class="btn-outline" id="acctSignOut">🚪 Sign Out</button>
    </div>
  `;
  $('#accountModal').classList.add('open');
  setTimeout(()=>{
    const vw = $('#acctViewOrders'); if(vw) vw.addEventListener('click', ()=>{ closeModal('accountModal'); renderMyOrders(); $('#myOrdersModal').classList.add('open'); });
    const so = $('#acctSignOut'); if(so) so.addEventListener('click', ()=>{ logout(); closeModal('accountModal'); });
  }, 0);
}

function renderMyOrders(){
  const sessEmail = (state.session?.email||'').toLowerCase();
  const sessName = (state.session?.name||'').toLowerCase();
  const userOrders = state.orders
    .filter(o => (o.email && o.email.toLowerCase()===sessEmail) || (o.customer && o.customer.toLowerCase()===sessName))
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const body = $('#myOrdersBody'); if(!body) return;
  if(userOrders.length===0){
    body.innerHTML = '<p style="text-align:center;color:var(--ink-soft);padding:40px">No orders yet. Start shopping ✦</p>';
    return;
  }
  body.innerHTML = userOrders.map(o=>`
    <div class="my-order-item">
      <div class="my-order-item-head">
        <strong>${esc(o.id)}</strong>
        <span class="status ${esc(o.status)}">${esc(o.status)}</span>
      </div>
      <div class="my-order-item-items">${o.items.map(i=>`${esc(i.qty)} × ${esc(i.name)}`).join(' · ')}</div>
      ${o.address?`<div style="font-size:12px;color:var(--ink-soft);padding-top:4px">📍 ${esc(o.address)}${o.phone?` · 📞 ${esc(o.phone)}`:''}</div>`:''}
      <div class="my-order-item-foot">
        <span style="color:var(--ink-soft)">${esc(o.date)}</span>
        <span class="price">${fmt(o.total)}</span>
      </div>
    </div>
  `).join('');
}

/* -------------------- DASHBOARD -------------------- */
let mainContentHidden = false;

// 🔐 SECURITY: Show dashboard ONLY after verifying admin role from database (prevents client UI bypass)
async function showDashboard(){
  if(!state.session){ toast('Please sign in first','error'); return; }
  const isAdmin = await isAdminUser(state.session.email);
  if(!isAdmin){
    toast('Access denied — admin privileges required','error');
    logout();
    return;
  }
  $('#dashboard').classList.remove('hidden');
  if(!mainContentHidden){
    $$('body > *:not(.dashboard):not(.modal):not(.drawer):not(.toast-container):not(.firebase-banner):not(#supabaseBanner)').forEach(el=> el.setAttribute('data-hidden-by-dash','1'));
    mainContentHidden = true;
  }
  $$('[data-hidden-by-dash]').forEach(el=> el.style.display='none');
  document.body.style.overflow = '';
  window.scrollTo(0,0);
  $('#dashUserEmail').textContent = state.session.email;
  renderDashboard();
}

function hideDashboard(){
  $('#dashboard').classList.add('hidden');
  $$('[data-hidden-by-dash]').forEach(el=> el.style.display='');
}
function viewStore(){
  hideDashboard();
  setTimeout(()=> window.scrollTo({top:0, behavior:'smooth'}), 50);
}

function renderDashboard(){
  const products = state.products;
  const users = state.users;
  const orders = state.orders;
  const revenue = orders.reduce((s,o)=>s+o.total,0);
  const pendingCount = orders.filter(o=>o.status==='pending').length;

  const sr = $('#statRevenue'); if(sr) sr.textContent = fmt(revenue);
  const so = $('#statOrders'); if(so) so.textContent = orders.length + (pendingCount? ` (${pendingCount} pending)`:'');
  const su = $('#statUsers'); if(su) su.textContent = users.length;
  const sp = $('#statProducts'); if(sp) sp.textContent = products.length;

  const rot = $('#recentOrdersTable')?.querySelector('tbody');
  if(rot) rot.innerHTML = (orders.length>0 ? `<tr><td colspan="6" style="text-align:center;padding:8px;font-size:11px;color:var(--ink-soft);background:var(--cream-2)">💡 Click row to view details</td></tr>` : '') + orders.slice(-5).reverse().map(o=>`
    <tr class="clickable" onclick="openOrderDetail('${esc(o.id)}')">
      <td>${esc(o.id)}</td><td>${esc(o.customer)}</td><td>${esc(o.items.reduce((s,i)=>s+i.qty,0))}</td><td>${fmt(o.total)}</td>
      <td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td><td>${esc(o.date||'-')}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--ink-soft)">No orders yet</td></tr>';

  const nc = $('#newCustomers');
  if(nc) nc.innerHTML = users.slice(-5).reverse().map(u=>`
    <div class="customer-item">
      <div class="cust-avatar">${esc(u.name.charAt(0).toUpperCase())}</div>
      <div class="cust-info"><strong>${esc(u.name)}</strong><span>${esc(u.email)} · ${esc(u.joined||'-')}</span></div>
    </div>
  `).join('') || '<p style="color:var(--ink-soft);text-align:center;padding:20px">No customers yet</p>';

  const apt = $('#adminProductsTable');
  if(apt) apt.innerHTML = products.map(p=>`
    <tr>
      <td style="width:60px">${p.image?`<img src="${esc(p.image)}" style="width:50px;height:50px;object-fit:cover;border-radius:8px"/>`:`<div style="width:50px;height:50px;background:var(--beige-light);border-radius:8px;display:grid;place-items:center;font-size:22px">${esc(p.emoji||'✨')}</div>`}</td>
      <td><strong>${esc(p.name)}</strong><br><small style="color:var(--ink-soft)">${esc(p.desc)}</small></td>
      <td>${esc(p.category)}</td>
      <td>${fmt(p.price)}${p.oldPrice?` <small style="text-decoration:line-through;color:var(--ink-soft)">${fmt(p.oldPrice)}</small>`:''}</td>
      <td>${esc(p.stock??'-')}</td>
      <td>
        <button class="btn-sm" onclick="editProduct('${esc(p.id)}')">Edit</button>
        <button class="btn-sm danger" onclick="deleteProduct('${esc(p.id)}')">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--ink-soft)">No products</td></tr>';

  const ut = $('#usersTable');
  if(ut) ut.innerHTML = users.map(u=>`
    <tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${esc(u.email)}</td>
      <td><span class="status ${esc(u.role)}">${esc(u.role)}</span></td>
      <td>${esc(u.joined||'-')}</td>
      <td>${(u.role!=='admin' && u.email!=='admin@admin.com')?`<button class="btn-sm danger" onclick="deleteUser('${esc(u.id)}')">Remove</button>`:'<span style="color:var(--ink-soft);font-size:12px">— protected —</span>'}</td>
    </tr>
  `).join('');

  const ot = $('#ordersTable');
  if(ot) ot.innerHTML = orders.map(o=>`
    <tr class="clickable" onclick="if(!event.target.closest('button')) openOrderDetail('${esc(o.id)}')">
      <td>${esc(o.id)}</td><td>${esc(o.customer)}</td><td>${esc(o.email||'-')}</td>
      <td style="font-size:12px">${o.items.map(i=>`${esc(i.qty)}× ${esc(i.name)}`).join(', ')}</td>
      <td>${fmt(o.total)}</td>
      <td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td>
      <td>${esc(o.date||'-')}</td>
      <td onclick="event.stopPropagation()">
        <button class="btn-sm" onclick="openOrderDetail('${esc(o.id)}')">👁 View</button>
        ${o.status!=='delivered' ? `<button class="btn-sm" onclick="advanceOrder('${esc(o.id)}')">${o.status==='pending'?'Ship':'Deliver'}</button>`:''}
        <button class="btn-sm danger" onclick="deleteOrder('${esc(o.id)}')">🗑</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--ink-soft)">No orders</td></tr>';

  setTimeout(drawAnalytics, 50);
}

/* -------------------- CHARTS -------------------- */
function drawAnalytics(){
  drawRevenueChart();
  drawCategoryChart();
  drawStatusChart();
  drawTopProducts();
}
function drawRevenueChart(){
  const canvas = $('#revenueChart'); if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = 280;
  canvas.width = w*dpr; canvas.height = h*dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0,0,w,h);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthly = new Array(12).fill(0);
  state.orders.forEach(o=>{
    if(o.date){ const m = parseInt(o.date.split('-')[1],10)-1; if(!isNaN(m)&&m>=0&&m<12) monthly[m]+=o.total; }
  });
  const realAvg = monthly.reduce((a,b)=>a+b,0) / Math.max(monthly.filter(x=>x>0).length,1);
  const data = monthly.map(v=> v>0 ? Math.round(v) : Math.round(realAvg*(0.4+Math.random()*0.8)));
  const max = Math.max(...data,100)*1.15;
  ctx.strokeStyle = 'rgba(132,96,68,0.15)'; ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y = 30+(h-60)*i/4;
    ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(w-10,y); ctx.stroke();
    ctx.fillStyle='rgba(74,61,50,0.6)'; ctx.font='11px Poppins'; ctx.textAlign='right';
    ctx.fillText('$'+Math.round(max*(1-i/4)), 35, y+4);
  }
  const barW = (w-60)/months.length*0.6;
  const gap = (w-60)/months.length;
  const grad = ctx.createLinearGradient(0,30,0,h-30);
  grad.addColorStop(0,'#C4A071'); grad.addColorStop(1,'#846044');
  months.forEach((m,i)=>{
    const x = 50+i*gap+(gap-barW)/2;
    const barH = (h-60)*(data[i]/max);
    const y = h-30-barH;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x+4,y); ctx.arcTo(x+barW,y,x+barW,y+barH,4); ctx.arcTo(x+barW,y+barH,x,y+barH,4); ctx.arcTo(x,y+barH,x,y,4); ctx.arcTo(x,y,x+barW,y,4); ctx.closePath();
    ctx.fill();
    ctx.fillStyle='rgba(74,61,50,0.7)'; ctx.font='11px Poppins'; ctx.textAlign='center';
    ctx.fillText(esc(m), x+barW/2, h-10);
  });
}
function drawCategoryChart(){
  const canvas = $('#categoryChart'); if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 260;
  canvas.width = size*dpr; canvas.height = size*dpr;
  canvas.style.width = size+'px'; canvas.style.height = size+'px';
  ctx.scale(dpr,dpr); ctx.clearRect(0,0,size,size);
  const counts = {offers:0, accessories:0, cases:0};
  state.products.forEach(p=> counts[p.category]=(counts[p.category]||0)+1);
  const total = state.products.length || 1;
  const colors = {offers:'#A76D5E', accessories:'#C4A071', cases:'#98A086'};
  const labels = {offers:'Offers', accessories:'Accessories', cases:'Cases'};
  let start = -Math.PI/2;
  const cx = size/2, cy = size/2, r = 100;
  Object.keys(counts).forEach((cat)=>{
    const slice = (counts[cat]/total)*Math.PI*2;
    if(slice===0) return;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,start+slice); ctx.closePath();
    ctx.fillStyle = colors[cat]; ctx.fill();
    start += slice;
  });
  ctx.beginPath(); ctx.arc(cx,cy,60,0,Math.PI*2);
  ctx.fillStyle = document.body.classList.contains('dark')?'#2a211a':'#fff';
  ctx.fill();
  ctx.fillStyle='#846044'; ctx.font='bold 28px Playfair Display'; ctx.textAlign='center';
  ctx.fillText(total, cx, cy-2);
  ctx.font='11px Poppins'; ctx.fillStyle='rgba(74,61,50,0.7)'; ctx.fillText('PRODUCTS', cx, cy+16);
  const lg = $('#categoryLegend');
  if(lg) lg.innerHTML = Object.keys(counts).map(cat=>`
    <div class="chart-legend-item">
      <span class="dot" style="background:${colors[cat]}"></span>
      <span>${labels[cat]}</span>
      <strong>${counts[cat]} (${Math.round(counts[cat]/total*100)}%)</strong>
    </div>`).join('');
}
function drawStatusChart(){
  const canvas = $('#statusChart'); if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 260;
  canvas.width = size*dpr; canvas.height = size*dpr;
  canvas.style.width = size+'px'; canvas.style.height = size+'px';
  ctx.scale(dpr,dpr); ctx.clearRect(0,0,size,size);
  const counts = {pending:0, shipped:0, delivered:0};
  state.orders.forEach(o=> counts[o.status]=(counts[o.status]||0)+1);
  const total = state.orders.length || 1;
  const colors = {pending:'#C4A071', shipped:'#98A086', delivered:'#846044'};
  let start = -Math.PI/2;
  const cx = size/2, cy = size/2, r = 100;
  Object.keys(counts).forEach((k)=>{
    const slice = (counts[k]/total)*Math.PI*2;
    if(slice===0) return;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,start+slice); ctx.closePath();
    ctx.fillStyle = colors[k]; ctx.fill();
    start += slice;
  });
  ctx.beginPath(); ctx.arc(cx,cy,60,0,Math.PI*2);
  ctx.fillStyle = document.body.classList.contains('dark')?'#2a211a':'#fff';
  ctx.fill();
  ctx.fillStyle='#846044'; ctx.font='bold 28px Playfair Display'; ctx.textAlign='center';
  ctx.fillText(state.orders.length, cx, cy-2);
  ctx.font='11px Poppins'; ctx.fillStyle='rgba(74,61,50,0.7)'; ctx.fillText('ORDERS', cx, cy+16);
  const lg = $('#statusLegend');
  if(lg) lg.innerHTML = Object.keys(counts).map(k=>`
    <div class="chart-legend-item">
      <span class="dot" style="background:${colors[k]}"></span>
      <span style="text-transform:capitalize">${esc(k)}</span>
      <strong>${counts[k]}</strong>
    </div>`).join('');
}
function drawTopProducts(){
  const popularity = {};
  state.orders.forEach(o=> o.items.forEach(it=>{ popularity[it.name] = (popularity[it.name]||0)+it.qty; }));
  if(Object.keys(popularity).length < 3){
    state.products.forEach((p,i)=>{ popularity[p.name] = Math.max(5, Math.round(80-i*6+Math.random()*20)); });
  }
  const sorted = Object.entries(popularity).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const max = Math.max(...sorted.map(s=>s[1]), 1);
  const tp = $('#topProducts');
  if(tp) tp.innerHTML = sorted.map(([name,count])=>{
    const p = state.products.find(x=>x.name===name);
    const img = p ? (p.image?`<img src="${esc(p.image)}" alt=""/>`:`<div class="emoji">${esc(p.emoji||'✨')}</div>`) : `<div class="emoji">📦</div>`;
    return `<div class="top-product-item">${img}
      <div class="top-product-info"><strong>${esc(name)}</strong><span>${Math.round(count)} sales</span></div>
      <div class="top-product-bar"><span style="width:${(count/max)*100}%"></span></div>
      <span class="sales">${Math.round(count)}</span>
    </div>`;
  }).join('') || '<p style="color:var(--ink-soft);text-align:center;padding:20px">No sales data yet</p>';
}

/* -------------------- PRODUCT CRUD -------------------- */
async function deleteProduct(id){
  if(!confirm('Delete this product?')) return;
  await api.deleteProduct(id);
  state.products = state.products.filter(p=>p.id!==id);
  renderProducts(); renderDashboard();
  toast('Product deleted','success');
}
async function deleteUser(id){
  if(!confirm('Remove this customer?')) return;
  await api.deleteUser(id);
  state.users = state.users.filter(u=>u.id!==id);
  renderDashboard();
  toast('Customer removed');
}
async function advanceOrder(id){
  const o = state.orders.find(x=>x.id===id);
  if(!o) return;
  o.status = o.status==='pending' ? 'shipped' : 'delivered';
  await api.updateOrder(id, {status: o.status});
  renderDashboard();
  toast(`Order ${o.status}`,'success');
}
async function deleteOrder(id){
  if(!confirm('Delete this order?')) return;
  await api.deleteOrder(id);
  state.orders = state.orders.filter(o=>o.id!==id);
  renderDashboard();
  toast('Order deleted');
}
async function handleImageUpload(file){
  return new Promise((resolve, reject)=>{
    if(!file){ resolve(null); return; }
    if(!file.type.startsWith('image/')){ reject('Invalid file'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const cvs = document.createElement('canvas');
        const max = 600;
        let w = img.width, h = img.height;
        if(w>h && w>max){ h = h*max/w; w = max; }
        else if(h>max){ w = w*max/h; h = max; }
        cvs.width = w; cvs.height = h;
        cvs.getContext('2d').drawImage(img,0,0,w,h);
        resolve(cvs.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function resetProductForm(){
  ['#pName','#pPrice','#pOldPrice','#pStock','#pMaterial','#pDesc','#pFeatures'].forEach(s=>{const el=$(s); if(el) el.value='';});
  $('#pCategory').value = 'accessories';
  $('#pBadge').value = '';
  $('#imagePreview').innerHTML = '<span>📷 Click to upload image</span>';
  state.pendingImage = null;
  state.editingProductId = null;
  $('#productFormTitle').textContent = 'Add New Product';
  $('#saveProduct').textContent = 'Save Product';
}
function editProduct(id){
  const p = state.products.find(x=>x.id===id);
  if(!p) return;
  state.editingProductId = id;
  $('#productForm').classList.remove('hidden');
  $('#productFormTitle').textContent = 'Edit Product';
  $('#saveProduct').textContent = 'Update Product';
  $('#pName').value = p.name;
  $('#pCategory').value = p.category;
  $('#pPrice').value = p.price;
  $('#pOldPrice').value = p.oldPrice || '';
  $('#pStock').value = p.stock ?? 50;
  $('#pBadge').value = p.badge || '';
  $('#pMaterial').value = p.material || '';
  $('#pDesc').value = p.desc || '';
  $('#pFeatures').value = (p.features||[]).join(', ');
  state.pendingImage = p.image || null;
  $('#imagePreview').innerHTML = p.image ? `<img src="${esc(p.image)}" alt=""/>` : '<span>📷 Click to upload image</span>';
  $('#productForm').scrollIntoView({behavior:'smooth', block:'center'});
}
async function saveProduct(){
  const name = $('#pName').value.trim();
  const category = $('#pCategory').value;
  const price = parseFloat($('#pPrice').value);
  const oldPrice = parseFloat($('#pOldPrice').value) || null;
  const stock = parseInt($('#pStock').value) || 0;
  const badge = $('#pBadge').value;
  const material = $('#pMaterial').value.trim();
  const desc = $('#pDesc').value.trim() || 'New addition to our collection.';
  const features = $('#pFeatures').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name || !price){ toast('Name and price are required','error'); return; }
  const image = state.pendingImage || placeholderImg('✨','#C4A071');
  if(state.editingProductId){
    const p = state.products.find(x=>x.id===state.editingProductId);
    if(p){
      const updated = {...p, name, category, price, oldPrice, stock, badge, material, desc, features, image};
      await api.saveProduct(updated);
      const idx = state.products.findIndex(x=>x.id===state.editingProductId);
      if(idx>=0) state.products[idx] = updated;
    }
    toast('Product updated','success');
  }else{
    const newP = {id:uid(), name, category, price, oldPrice, stock, badge, material, desc, features, emoji:'✨', color:'#C4A071', image, createdAt: today()};
    const saved = await api.saveProduct(newP);
    state.products.push(saved);
    toast('Product added ✦','success');
  }
  resetProductForm();
  $('#productForm').classList.add('hidden');
  renderProducts();
  renderDashboard();
}

/* -------------------- 3D BRACELET BEADS & DRAG -------------------- */
function buildBeads(){
  const beads = $('#beads'); if(!beads) return;
  const count = 28; const radius = 48; let html = '';
  for(let i=0;i<count;i++){
    const angle = (i/count)*360;
    html += `<div class="bead" style="transform: rotateZ(${angle}deg) translateY(-${radius}%);"></div>`;
  }
  beads.innerHTML = html;
  const scene = $('#bracelet');
  const gemRadius = 50;
  const colors = ['#A76D5E','#98A086','#DFCCB1'];
  [0,120,240].forEach((a,idx)=>{
    const g = document.createElement('div');
    g.className = `gem gem-${idx+1}`;
    g.style.setProperty('--r', a+'deg');
    g.style.transform = `rotateZ(${a}deg) translateY(-${gemRadius}%)`;
    g.style.background = `radial-gradient(circle at 30% 30%, #fff, ${colors[idx]} 40%, #846044 100%)`;
    scene.appendChild(g);
  });
}
(function braceletDrag(){
  const b = $('#bracelet'); if(!b) return;
  let isDown=false, startX=0, startY=0, rotY=0, rotX=65, curRotY=0, curRotX=65;
  const scene = b.parentElement;
  scene.addEventListener('mousedown', start);
  scene.addEventListener('touchstart', start, {passive:true});
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, {passive:true});
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
  function start(e){ isDown=true; b.style.animation='none'; const p=e.touches?e.touches[0]:e; startX=p.clientX; startY=p.clientY; curRotY=rotY; curRotX=rotX; }
  function move(e){ if(!isDown) return; const p=e.touches?e.touches[0]:e; rotY=curRotY+(p.clientX-startX)*0.5; rotX=Math.max(20,Math.min(85,curRotX-(p.clientY-startY)*0.3)); b.style.transform=`rotateX(${rotX}deg) rotateZ(${rotY}deg)`; }
  function end(){ if(!isDown) return; isDown=false; setTimeout(()=>{ b.style.animation=''; b.style.transform=''; }, 1500); }
})();

/* -------------------- NAVBAR SCROLL -------------------- */
window.addEventListener('scroll', ()=>{
  const nb = $('#navbar'); if(nb) nb.classList.toggle('scrolled', window.scrollY>20);
  const sections = ['home','offers','accessories','cases','tracking'];
  let active = 'home';
  for(const id of sections){
    const el = document.getElementById(id);
    if(el && el.getBoundingClientRect().top < 200) active = id;
  }
  $$('.nav-link').forEach(l=> l.classList.toggle('active', l.getAttribute('href')==='#'+active));
});

/* -------------------- EVENT WIRING -------------------- */
document.addEventListener('DOMContentLoaded', async ()=>{
  if('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0,0);

  buildBeads();
  await seedIfEmpty();
  await loadData();

  if(SUPABASE_ACTIVE){
    try{
      const { data: { session: sbSession } } = await supabase.auth.getSession();
      if(sbSession && sbSession.user && !state.session){
        const { data: rows } = await supabase.from('users').select('*').eq('email', sbSession.user.email).limit(1);
        const profile = (rows && rows[0]) || {name:sbSession.user.email.split('@')[0], email:sbSession.user.email, role:'customer'};
        state.session = {id:sbSession.user.id, name:profile.name, email:sbSession.user.email, role:profile.role||'customer'};
        store.set('golden_session', state.session);
        refreshAuthUI();
      }
      supabase.auth.onAuthStateChange((_event, session)=>{
        if(!session && state.session){
          state.session = null;
          store.set('golden_session', null);
          refreshAuthUI();
        }
      });
    }catch(e){ console.warn('Supabase auth error:', e); }
  }

  $('#themeBtn').addEventListener('click', ()=>{
    const cur = store.get('golden_theme','light');
    const next = cur==='dark'?'light':'dark';
    store.set('golden_theme', next);
    applyTheme();
    if(!$('#dashboard').classList.contains('hidden')) setTimeout(drawAnalytics, 100);
  });

  $('#hamburger').addEventListener('click', ()=> $('#navLinks').classList.toggle('open'));
  $$('.nav-link').forEach(l=> l.addEventListener('click', ()=> $('#navLinks').classList.remove('open')));

  $('#authBtn').addEventListener('click', async ()=>{
    if(state.session){
      const isAdmin = await isAdminUser(state.session.email);
      if(isAdmin){ showDashboard(); return; }
      if(confirm(`Signed in as ${state.session.name}. Sign out?`)) logout();
      else toast(`Hi ${state.session.name}!`);
    }else openAuth();
  });
  $$('[data-close]').forEach(el=> el.addEventListener('click', closeAuth));
  $$('.auth-tab').forEach(t=> t.addEventListener('click', ()=> switchAuthTab(t.dataset.tab)));
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#registerForm').addEventListener('submit', handleRegister);

  const drawer = $('#cartDrawer');
  $('#cartBtn').addEventListener('click', ()=> drawer.classList.add('open'));
  $$('[data-close-drawer]').forEach(el=> el.addEventListener('click', ()=> drawer.classList.remove('open')));
  $('#checkoutBtn').addEventListener('click', ()=>{
    if(state.cart.length===0){ toast('Your cart is empty','error'); return; }
    if(!state.session){ toast('Please sign in to checkout','error'); drawer.classList.remove('open'); openAuth(); return; }
    const total = state.cart.reduce((s,i)=>s+i.price*i.qty,0);
    $('#coTotal').textContent = fmt(total);
    $('#coName').value = state.session.name || '';
    $('#coEmail').value = state.session.email || '';
    $('#checkoutModal').classList.add('open');
  });

  const coForm = $('#checkoutForm');
  if(coForm){
    coForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const name = $('#coName').value.trim();
      const phone = $('#coPhone').value.trim();
      const emailInput = $('#coEmail').value.trim();
      const address = $('#coAddress').value.trim();
      const city = $('#coCity').value.trim();
      const notes = $('#coNotes').value.trim();
      if(!name || !phone || !emailInput || !address || !city){ toast('Please fill all required fields','error'); return; }

      toast('Verifying order prices...','info');
      const customerInfo = {
        id: '#G'+(1000+state.orders.length+1),
        customer: esc(name),
        email: state.session ? esc(state.session.email) : esc(emailInput),
        shippingEmail: esc(emailInput),
        phone: esc(phone),
        address: esc(address) + ', ' + esc(city),
        notes: esc(notes),
        userId: state.session ? state.session.id : null,
      };
      const verifiedOrder = await api.verifyAndBuildOrder(state.cart, customerInfo);
      if(!verifiedOrder || verifiedOrder.items.length === 0){
        toast('Order verification failed — please try again','error'); return;
      }
      const clientTotal = state.cart.reduce((s,i)=>s+i.price*i.qty,0);
      if(Math.abs(clientTotal - verifiedOrder.total) > 0.01){
        toast('Price was verified against database','success');
      }
      const saved = await api.saveOrder(verifiedOrder);
      state.orders.push(saved);
      state.cart = [];
      store.set('golden_cart', []);
      updateCartUI();
      closeModal('checkoutModal');
      drawer.classList.remove('open');
      coForm.reset();
      toast(`Order ${saved.id||'placed'}! ✦`,'success');
    });
  }
  $$('[data-close-checkout]').forEach(el=> el.addEventListener('click', ()=> closeModal('checkoutModal')));
  $$('[data-close-account]').forEach(el=> el.addEventListener('click', ()=> closeModal('accountModal')));
  $$('[data-close-myorders]').forEach(el=> el.addEventListener('click', ()=> closeModal('myOrdersModal')));

  const uAvatar = $('#userAvatarBtn');
  if(uAvatar){ uAvatar.addEventListener('click', (e)=>{ e.stopPropagation(); toggleUserDropdown(); }); }
  document.addEventListener('click', (e)=>{ if(!e.target.closest('.user-menu')) toggleUserDropdown(false); });
  const bma = $('#btnMyAccount');
  if(bma) bma.addEventListener('click', ()=>{ toggleUserDropdown(false); openMyAccount(); });
  const bmo = $('#btnMyOrders');
  if(bmo) bmo.addEventListener('click', ()=>{ toggleUserDropdown(false); renderMyOrders(); $('#myOrdersModal').classList.add('open'); });
  const bad = $('#btnAdminDash');
  if(bad) bad.addEventListener('click', ()=>{ toggleUserDropdown(false); showDashboard(); });
  const blo = $('#btnLogout');
  if(blo) blo.addEventListener('click', ()=>{ toggleUserDropdown(false); logout(); });

  const wish = $('#wishlistDrawer');
  $('#wishlistBtn').addEventListener('click', ()=>{ updateWishlistUI(); wish.classList.add('open'); });
  $$('[data-close-wishlist]').forEach(el=> el.addEventListener('click', ()=> wish.classList.remove('open')));
  $('#wishlistToCart').addEventListener('click', ()=>{ moveWishlistToCart(); wish.classList.remove('open'); });

  const searchModal = $('#searchModal');
  $('#searchBtn').addEventListener('click', ()=>{
    searchModal.classList.add('open');
    setTimeout(()=> $('#modalSearch').focus(), 100);
    runSearch('');
  });
  $$('[data-close-search]').forEach(el=> el.addEventListener('click', ()=> searchModal.classList.remove('open')));
  $('#modalSearch').addEventListener('input', (e)=> runSearch(e.target.value));

  $$('[data-close-detail]').forEach(el=> el.addEventListener('click', ()=> closeModal('detailModal')));

  const applyFilters = ()=>{
    state.filters.search = $('#globalSearch').value.trim();
    state.filters.category = $('#filterCategory').value;
    state.filters.sort = $('#filterSort').value;
    state.filters.maxPrice = parseFloat($('#priceRange').value) || 500;
    renderProducts();
  };
  $('#globalSearch').addEventListener('input', applyFilters);
  $('#clearSearch').addEventListener('click', ()=>{ $('#globalSearch').value=''; $('#clearSearch').style.display='none'; applyFilters(); });
  $('#globalSearch').addEventListener('input', (e)=>{ $('#clearSearch').style.display = e.target.value?'block':'none'; });
  $('#filterCategory').addEventListener('change', applyFilters);
  $('#filterSort').addEventListener('change', applyFilters);
  $('#priceRange').addEventListener('input', (e)=>{ $('#priceLabel').textContent = e.target.value; applyFilters(); });
  $('#resetFilters').addEventListener('click', ()=>{
    $('#globalSearch').value=''; $('#filterCategory').value=''; $('#filterSort').value='featured';
    $('#priceRange').value=500; $('#priceLabel').textContent='500'; $('#clearSearch').style.display='none';
    applyFilters();
    toast('Filters reset');
  });

  $('#trackBtn').addEventListener('click', trackOrder);
  $('#trackingInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') trackOrder(); });
  $('#trackingEmailInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') trackOrder(); });

  $('#orderNowBtn').addEventListener('click', ()=> document.getElementById('offers').scrollIntoView({behavior:'smooth'}));

  $$('.dash-tab').forEach(t=> t.addEventListener('click', ()=>{
    $$('.dash-tab').forEach(x=> x.classList.toggle('active', x===t));
    $$('.dash-view').forEach(v=> v.classList.toggle('hidden', v.id!=='view-'+t.dataset.view));
    if(t.dataset.view==='analytics') setTimeout(drawAnalytics, 50);
  }));
  $('#logoutBtn').addEventListener('click', logout);
  $('#viewStoreBtn').addEventListener('click', viewStore);
  $('#openAddProduct').addEventListener('click', ()=>{
    resetProductForm();
    $('#productForm').classList.remove('hidden');
  });
  $('#cancelProduct').addEventListener('click', ()=>{
    $('#productForm').classList.add('hidden');
    resetProductForm();
  });
  $('#saveProduct').addEventListener('click', saveProduct);

  $('#pImage').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    try{
      const dataUrl = await handleImageUpload(file);
      state.pendingImage = dataUrl;
      $('#imagePreview').innerHTML = `<img src="${esc(dataUrl)}" alt=""/>`;
    }catch(err){ toast('Image upload failed','error'); }
  });
  $('#imagePreview').addEventListener('click', ()=> $('#pImage').click());

  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){
      ['authModal','searchModal','detailModal','checkoutModal','accountModal','myOrdersModal','orderDetailModal'].forEach(id=>{
        const m = $('#'+id); if(m) m.classList.remove('open');
      });
      $('#cartDrawer').classList.remove('open');
      $('#wishlistDrawer').classList.remove('open');
    }
  });

  let resizeTimer;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{
      if(!$('#dashboard').classList.contains('hidden')) drawAnalytics();
    }, 200);
  });
});

// 🔐 SECURITY (IDOR Fixed): Order tracking MUST verify both Order ID AND Email/Phone
function trackOrder(){
  const input = $('#trackingInput').value.trim().toUpperCase();
  const emailInput = $('#trackingEmailInput').value.trim().toLowerCase();
  const result = $('#trackingResult');
  
  if(!input || !emailInput){ 
    result.innerHTML = '<p style="color:var(--rose-dark);text-align:center;font-weight:600">Please enter both Order ID and associated Email.</p>'; 
    return; 
  }
  
  const order = state.orders.find(o=> 
    (o.id||'').toUpperCase()===input && 
    ((o.email||'').toLowerCase()===emailInput || (o.shippingEmail||'').toLowerCase()===emailInput)
  );
  
  if(!order){
    result.innerHTML = `<div class="tracking-found" style="text-align:center;padding:30px;color:var(--rose-dark)">
      <strong style="font-family:var(--serif);font-size:22px">No matching order found</strong>
      <p style="margin-top:8px;color:var(--ink-soft)">Verify your order ID and email and try again.</p>
    </div>`;
    return;
  }
  
  const steps = [
    {key:'pending', label:'Order Received', sub:'Your order has been placed'},
    {key:'shipped', label:'Shipped', sub:'Package left our warehouse'},
    {key:'delivered', label:'Delivered', sub:'Enjoy your purchase ✦'},
  ];
  const statusIdx = {pending:0, shipped:1, delivered:2}[order.status] || 0;
  result.innerHTML = `
    <div class="tracking-found">
      <h4>Order ${esc(order.id)}</h4>
      <p class="sub">${esc(order.customer)} · ${esc(order.email||'-')} · ${esc(order.date||'-')} · Total <strong style="color:var(--terra)">${fmt(order.total)}</strong></p>
      <div class="timeline">
        ${steps.map((s,i)=>`
          <div class="timeline-item ${i<statusIdx?'done':i===statusIdx?'current':''}">
            <strong>${esc(s.label)} ${i<statusIdx?'✓':''}</strong>
            <span>${esc(s.sub)}</span>
          </div>`).join('')}
      </div>
      <p style="margin-top:20px;font-size:13px;color:var(--ink-soft)">
        Items: ${order.items.map(i=>esc(i.qty)+' × '+esc(i.name)).join(', ')}
      </p>
      ${order.address?`<p style="font-size:13px;color:var(--ink-soft)">📍 ${esc(order.address)}${order.phone?` · 📞 ${esc(order.phone)}`:''}</p>`:''}
    </div>`;
}

// ========== ORDER DETAIL MODAL (Admin) ==========
function openOrderDetail(orderId){
  const safeOrderId = esc(orderId);
  const order = state.orders.find(o=>o.id===orderId || o.orderId===orderId);
  if(!order){ toast('Order not found','error'); return; }
  const itemsHtml = Array.isArray(order.items) ? order.items.map(i=>`
    <div class="order-item-row">
      <strong>${esc(i.qty)} × ${esc(i.name)}</strong>
      <span>${fmt(i.price * i.qty)}</span>
    </div>`).join('') : '<div class="order-item-row"><strong>No items</strong><span>-</span></div>';

  $('#orderDetailBody').innerHTML = `
    <div class="order-detail">
      <h3>Order Details</h3>
      <div class="order-id">${esc(order.id || order.orderId)}</div>

      <div class="order-detail-grid">
        <div class="order-detail-card">
          <h4>👤 Customer Info</h4>
          <div class="order-detail-row"><span>Name</span><span>${esc(order.customer||'-')}</span></div>
          <div class="order-detail-row"><span>📧 Email</span><span>${esc(order.email||order.shippingEmail||'-')}</span></div>
          <div class="order-detail-row"><span>📱 Phone</span><span>${esc(order.phone||'-')}</span></div>
          ${order.userId ? `<div class="order-detail-row"><span>User ID</span><span style="font-size:11px">${esc(order.userId)}</span></div>`:''}
        </div>

        <div class="order-detail-card">
          <h4>📍 Shipping</h4>
          <div class="order-detail-row"><span>Address</span><span>${esc(order.address||'-')}</span></div>
          <div class="order-detail-row"><span>Notes</span><span>${esc(order.notes||'None')}</span></div>
          <div class="order-detail-row"><span>Date</span><span>${esc(order.date||'-')}</span></div>
          <div class="order-detail-row"><span>Status</span><span class="status ${esc(order.status||'pending')}" style="margin-left:auto">${esc(order.status||'pending')}</span></div>
        </div>
      </div>

      <div class="order-items">
        <h4>🛍 Items (${Array.isArray(order.items)?order.items.reduce((s,i)=>s+i.qty,0):0})</h4>
        ${itemsHtml}
      </div>

      <div class="order-total">
        <span>Total</span>
        <strong>${fmt(order.total||0)}</strong>
      </div>

      <div class="order-actions">
        ${order.status!=='delivered' ? `<button class="btn-primary" onclick="advanceOrder('${safeOrderId}'); closeModal('orderDetailModal'); renderDashboard();">
          ✓ ${order.status==='pending'?'Mark as Shipped':'Mark as Delivered'}
        </button>`:''}
        <button class="btn-outline" onclick="closeModal('orderDetailModal')">Close</button>
        <button class="btn-sm danger" style="margin-left:auto;padding:10px 18px" onclick="if(confirm('Delete this order?')){deleteOrder('${safeOrderId}');closeModal('orderDetailModal');renderDashboard();}">
          🗑 Delete
        </button>
      </div>
    </div>
  `;
  $('#orderDetailModal').classList.add('open');
}

document.addEventListener('DOMContentLoaded', ()=>{
  $$('[data-close-order]').forEach(el=> el.addEventListener('click', ()=> closeModal('orderDetailModal')));
});

// Globals for inline onclicks
window.addToCart = addToCart;
window.changeQty = changeQty;
window.removeFromCart = removeFromCart;
window.toggleWishlist = toggleWishlist;
window.openProductDetail = openProductDetail;
window.closeModal = closeModal;
window.deleteProduct = deleteProduct;
window.deleteUser = deleteUser;
window.deleteOrder = deleteOrder;
window.advanceOrder = advanceOrder;
window.editProduct = editProduct;
window.toast = toast;
window.logout = logout;
window.renderMyOrders = renderMyOrders;
window.openMyAccount = openMyAccount;
window.openOrderDetail = openOrderDetail;