import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'omnimart.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      postal_code TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      shop_name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      commission_rate REAL NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'active',
      balance REAL NOT NULL DEFAULT 0,
      total_earnings REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      sku TEXT NOT NULL UNIQUE,
      product_type TEXT NOT NULL DEFAULT 'physical',
      price REAL NOT NULL,
      compare_at_price REAL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL,
      short_description TEXT DEFAULT '',
      description TEXT DEFAULT '',
      attributes_json TEXT NOT NULL DEFAULT '[]',
      digital_file_url TEXT DEFAULT '',
      license_key_template TEXT DEFAULT '',
      affiliate_url TEXT DEFAULT '',
      is_featured INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      rating REAL NOT NULL DEFAULT 4.8,
      review_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT DEFAULT '',
      shipping_address TEXT DEFAULT '',
      shipping_city TEXT DEFAULT '',
      shipping_postal TEXT DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT 'cod',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      order_status TEXT NOT NULL DEFAULT 'pending',
      subtotal REAL NOT NULL,
      discount_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      shipping_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      coupon_code TEXT DEFAULT '',
      source TEXT NOT NULL DEFAULT 'storefront',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      vendor_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      sku TEXT NOT NULL,
      variant_label TEXT DEFAULT '',
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      vendor_payout REAL NOT NULL DEFAULT 0,
      platform_commission REAL NOT NULL DEFAULT 0,
      license_key TEXT DEFAULT '',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'percent',
      value REAL NOT NULL,
      min_spend REAL NOT NULL DEFAULT 0,
      usage_limit INTEGER NOT NULL DEFAULT 100,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT DEFAULT '2027-12-31',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      parent_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      target_view TEXT NOT NULL DEFAULT 'catalog',
      is_visible INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS homepage_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      section_type TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_visible INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS cms_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      meta_title TEXT DEFAULT '',
      meta_description TEXT DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER,
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'Bank Transfer',
      account_details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wishlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (userCount.cnt === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const adminHash = bcrypt.hashSync('admin123', 10);
  const vendorHash = bcrypt.hashSync('vendor123', 10);
  const customerHash = bcrypt.hashSync('customer123', 10);

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, phone, address, city, postal_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const adminId = insertUser.run('Marcus Vance', 'admin@omnimart.com', adminHash, 'admin', '+1 415 890 2200', '500 Howard Street', 'San Francisco', '94105').lastInsertRowid;
  const vendor1UserId = insertUser.run('Elena Rostova', 'vendor@omnimart.com', vendorHash, 'vendor', '+1 415 555 0144', '210 Mission Ave', 'San Francisco', '94105').lastInsertRowid;
  const vendor2UserId = insertUser.run('Henrik Lindqvist', 'atelier@omnimart.com', vendorHash, 'vendor', '+1 212 555 0198', '88 Crosby Street', 'New York', '10012').lastInsertRowid;
  const customerId = insertUser.run('Claire Mercer', 'customer@omnimart.com', customerHash, 'customer', '+1 312 555 0172', '742 Evergreen Terrace', 'Chicago', '60611').lastInsertRowid;

  void adminId;

  const insertVendor = db.prepare(
    `INSERT INTO vendors (user_id, shop_name, slug, description, commission_rate, status, balance, total_earnings)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const vendor1Id = insertVendor.run(
    vendor1UserId,
    'Aether Audio & Precision',
    'aether-audio',
    'Studio-grade acoustic hardware, mechanical keyboards, and horological instruments.',
    10,
    'active',
    1840.50,
    6420.00
  ).lastInsertRowid;

  const vendor2Id = insertVendor.run(
    vendor2UserId,
    'Nordic Atelier & Goods',
    'nordic-atelier',
    'Architectural home appliances, sculpted ceramics, full-grain leather carry, and footwear.',
    12,
    'active',
    1295.00,
    4180.00
  ).lastInsertRowid;

  const insertCat = db.prepare(
    `INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES (?, ?, ?, ?, 1)`
  );

  const catAudioId = insertCat.run('Audio & Tech', 'audio-tech', 'Headphones, keyboards, and desktop hardware', 1).lastInsertRowid;
  const catWatchesId = insertCat.run('Timepieces', 'timepieces', 'Precision mechanical and chronograph watches', 2).lastInsertRowid;
  const catBagsId = insertCat.run('Bags & Carry', 'bags-carry', 'Full-grain leather packs and everyday carry', 3).lastInsertRowid;
  const catHomeId = insertCat.run('Home & Kitchen', 'home-kitchen', 'Espresso machines and architectural lighting', 4).lastInsertRowid;
  const catFootwearId = insertCat.run('Footwear & Digital', 'footwear-digital', 'Technical running footwear and software kits', 5).lastInsertRowid;

  const insertProduct = db.prepare(
    `INSERT INTO products (
      vendor_id, category_id, title, slug, sku, product_type, price, compare_at_price,
      stock, image_url, short_description, description, attributes_json,
      digital_file_url, license_key_template, affiliate_url, is_featured, status, rating, review_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`
  );

  const p1 = insertProduct.run(
    vendor1Id,
    catAudioId,
    'Studio Reference Wireless ANC Headphones',
    'studio-reference-wireless-anc-headphones',
    'OM-AUD-001',
    'physical',
    349.00,
    399.00,
    42,
    '/src/assets/images/product_wireless_headphones_1794763519971.jpg',
    'Machined aluminum hinges, 40-hour ANC battery, lossless USB-C audio.',
    'Engineered for mastering rooms and quiet transit alike. Features 45mm beryllium drivers, hybrid adaptive noise cancellation, lambskin memory foam earcups, and dual-device multipoint pairing.',
    JSON.stringify([
      {
        name: 'Finish',
        options: [
          { label: 'Matte Charcoal', priceDelta: 0, stock: 26 },
          { label: 'Brushed Titanium', priceDelta: 30, stock: 16 }
        ]
      }
    ]),
    '', '', '', 1, 4.9, 28
  ).lastInsertRowid;

  const p2 = insertProduct.run(
    vendor1Id,
    catWatchesId,
    'Aeterna Slate Chronograph 40mm',
    'aeterna-slate-chronograph-40mm',
    'OM-WTC-002',
    'physical',
    680.00,
    750.00,
    18,
    '/src/assets/images/product_chronograph_watch_1794763521133.jpg',
    'Brushed 316L stainless steel case, sapphire crystal, 100m water resistance.',
    'Assembled with a precision Swiss bi-compax chronograph movement housed in a 40mm brushed steel case. Sunburst slate dial with Super-LumiNova indices and solid-link integrated bracelet.',
    JSON.stringify([
      {
        name: 'Strap',
        options: [
          { label: 'Integrated Steel Bracelet', priceDelta: 0, stock: 12 },
          { label: 'Italian Calfskin Strap', priceDelta: -40, stock: 6 }
        ]
      }
    ]),
    '', '', '', 1, 4.9, 19
  ).lastInsertRowid;

  const p3 = insertProduct.run(
    vendor2Id,
    catBagsId,
    'Aegis Heritage Leather Commuter Pack',
    'aegis-heritage-leather-commuter-pack',
    'OM-BAG-003',
    'physical',
    295.00,
    340.00,
    29,
    '/src/assets/images/product_leather_backpack_1794763521421.jpg',
    'Vegetable-tanned full-grain leather with padded 16-inch laptop sleeve.',
    'Hand-stitched from full-grain cognac bridle leather with solid brass roller buckles, hidden quick-access passport pocket, and weather-sealed YKK Excella zippers.',
    JSON.stringify([
      {
        name: 'Capacity',
        options: [
          { label: '18L Standard', priceDelta: 0, stock: 19 },
          { label: '24L Weekender', priceDelta: 45, stock: 10 }
        ]
      }
    ]),
    '', '', '', 1, 4.8, 34
  ).lastInsertRowid;

  const p4 = insertProduct.run(
    vendor2Id,
    catHomeId,
    'Aura Precision Home Espresso Machine',
    'aura-precision-home-espresso-machine',
    'OM-HOM-004',
    'physical',
    890.00,
    990.00,
    14,
    '/src/assets/images/product_espresso_machine_1794763521156.jpg',
    'Dual PID temperature control, 58mm commercial portafilter, walnut accents.',
    'Compact architectural footprint built with brushed 304 stainless steel, analog brew pressure gauge, commercial 58mm E61-inspired group head, and articulating cool-touch steam wand.',
    JSON.stringify([
      {
        name: 'Voltage',
        options: [
          { label: '110V North America', priceDelta: 0, stock: 9 },
          { label: '220V EU / UK', priceDelta: 0, stock: 5 }
        ]
      }
    ]),
    '', '', '', 1, 4.9, 22
  ).lastInsertRowid;

  const p5 = insertProduct.run(
    vendor1Id,
    catAudioId,
    'Tactile 75% Anodized Mechanical Keyboard',
    'tactile-75-anodized-mechanical-keyboard',
    'OM-KEY-005',
    'physical',
    219.00,
    249.00,
    53,
    '/src/assets/images/product_mechanical_keyboard_1794763521199.jpg',
    'CNC aluminum chassis, gasket mount, hot-swappable PCB, PBT dye-sub keycaps.',
    'Precision milled from a solid block of 6063 aluminum with internal silicone acoustic dampening, tri-mode wireless + USB-C connectivity, and QMK/VIA programmability.',
    JSON.stringify([
      {
        name: 'Switch Profile',
        options: [
          { label: 'Linear Cream 45g', priceDelta: 0, stock: 31 },
          { label: 'Tactile Mocha 58g', priceDelta: 10, stock: 22 }
        ]
      }
    ]),
    '', '', '', 1, 4.7, 41
  ).lastInsertRowid;

  const p6 = insertProduct.run(
    vendor2Id,
    catHomeId,
    'Nordic Dome Ceramic Table Lamp',
    'nordic-dome-ceramic-table-lamp',
    'OM-LMP-006',
    'physical',
    185.00,
    215.00,
    37,
    '/src/assets/images/product_ceramic_lamp_1794763522525.jpg',
    'Hand-thrown matte stoneware diffuser with dimmable 2700K warm LED core.',
    'Sculptural ceramic table luminaire crafted in small kiln batches. Casts a diffused downward glow across desks and bedside plinths with a braided linen cord and rotary brass dimmer.',
    JSON.stringify([]),
    '', '', '', 1, 4.8, 16
  ).lastInsertRowid;

  const p7 = insertProduct.run(
    vendor2Id,
    catFootwearId,
    'AeroKnit Pro Marathon Runners',
    'aeroknit-pro-marathon-runners',
    'OM-FTW-007',
    'physical',
    195.00,
    220.00,
    64,
    '/src/assets/images/product_running_sneakers_1794763522645.jpg',
    'Dual-density nitrogen midsole, carbon propulsion plate, breathable knit upper.',
    'Built for high-mileage tempo training and race day efficiency. Seamless engineered knit upper locks down the midfoot while responsive dual-pod cushioning absorbs road impact.',
    JSON.stringify([
      {
        name: 'Size',
        options: [
          { label: 'US 9 / EU 42', priceDelta: 0, stock: 20 },
          { label: 'US 10 / EU 43', priceDelta: 0, stock: 24 },
          { label: 'US 11 / EU 44', priceDelta: 0, stock: 20 }
        ]
      }
    ]),
    '', '', '', 0, 4.7, 30
  ).lastInsertRowid;

  const p8 = insertProduct.run(
    vendor1Id,
    catFootwearId,
    'OmniStudio Pro Acoustic & Firmware Suite',
    'omnistudio-pro-acoustic-firmware-suite',
    'OM-LIC-008',
    'license',
    79.00,
    99.00,
    999,
    '/src/assets/images/hero_omnimart_showcase_1794763520340.jpg',
    'Instant digital license key for studio EQ profiles and hardware calibration.',
    'Instant-delivery software license providing parametric studio room correction, custom keyboard macro libraries, and lossless DAC presets. License key is generated immediately upon checkout.',
    JSON.stringify([]),
    'https://omnimart.local/downloads/omnistudio-suite-v2.zip',
    'OMNI-PRO-XXXX-XXXX',
    '', 0, 4.9, 12
  ).lastInsertRowid;

  // Seed Orders
  const insertOrder = db.prepare(
    `INSERT INTO orders (
      order_number, user_id, customer_name, customer_email, customer_phone,
      shipping_address, shipping_city, shipping_postal, payment_method,
      payment_status, order_status, subtotal, discount_total, tax_total,
      shipping_total, total, coupon_code, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertOrderItem = db.prepare(
    `INSERT INTO order_items (
      order_id, product_id, vendor_id, title, sku, variant_label,
      quantity, unit_price, total_price, vendor_payout, platform_commission, license_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const o1 = insertOrder.run(
    'OM-10041', customerId, 'Claire Mercer', 'customer@omnimart.com', '+1 312 555 0172',
    '742 Evergreen Terrace', 'Chicago', '60611', 'stripe', 'paid', 'delivered',
    349.00, 0, 27.92, 0, 376.92, '', 'storefront', '2026-11-10 14:22:00'
  ).lastInsertRowid;
  insertOrderItem.run(o1, p1, vendor1Id, 'Studio Reference Wireless ANC Headphones', 'OM-AUD-001', 'Matte Charcoal', 1, 349.00, 349.00, 314.10, 34.90, '');

  const o2 = insertOrder.run(
    'OM-10042', customerId, 'Claire Mercer', 'customer@omnimart.com', '+1 312 555 0172',
    '742 Evergreen Terrace', 'Chicago', '60611', 'cod', 'pending', 'shipped',
    295.00, 0, 23.60, 0, 318.60, '', 'storefront', '2026-11-12 09:45:00'
  ).lastInsertRowid;
  insertOrderItem.run(o2, p3, vendor2Id, 'Aegis Heritage Leather Commuter Pack', 'OM-BAG-003', '18L Standard', 1, 295.00, 295.00, 259.60, 35.40, '');

  const o3 = insertOrder.run(
    'OM-10043', null, 'Julian Vance', 'julian.v@studio.io', '+1 206 555 0181',
    '1420 Fifth Ave', 'Seattle', '98101', 'paypal', 'paid', 'processing',
    899.00, 134.85, 61.13, 0, 825.28, 'OMNI15', 'storefront', '2026-11-13 18:10:00'
  ).lastInsertRowid;
  insertOrderItem.run(o3, p2, vendor1Id, 'Aeterna Slate Chronograph 40mm', 'OM-WTC-002', 'Integrated Steel Bracelet', 1, 680.00, 680.00, 612.00, 68.00, '');
  insertOrderItem.run(o3, p5, vendor1Id, 'Tactile 75% Anodized Mechanical Keyboard', 'OM-KEY-005', 'Linear Cream 45g', 1, 219.00, 219.00, 197.10, 21.90, '');

  const o4 = insertOrder.run(
    'OM-10044', null, 'Nadia Sterling', 'nadia@atelierhome.co', '+1 646 555 0123',
    '95 Mercer Street', 'New York', '10012', 'cod', 'pending', 'pending',
    1075.00, 0, 86.00, 0, 1161.00, '', 'storefront', '2026-11-14 11:05:00'
  ).lastInsertRowid;
  insertOrderItem.run(o4, p4, vendor2Id, 'Aura Precision Home Espresso Machine', 'OM-HOM-004', '110V North America', 1, 890.00, 890.00, 783.20, 106.80, '');
  insertOrderItem.run(o4, p6, vendor2Id, 'Nordic Dome Ceramic Table Lamp', 'OM-LMP-006', '', 1, 185.00, 185.00, 162.80, 22.20, '');

  const o5 = insertOrder.run(
    'OM-10045', null, 'Walk-in POS Guest', 'pos@omnimart.com', '',
    'In-Store Register #1', 'San Francisco', '94105', 'pos_card', 'paid', 'delivered',
    195.00, 0, 15.60, 0, 210.60, '', 'pos', '2026-11-15 08:30:00'
  ).lastInsertRowid;
  insertOrderItem.run(o5, p7, vendor2Id, 'AeroKnit Pro Marathon Runners', 'OM-FTW-007', 'US 10 / EU 43', 1, 195.00, 195.00, 171.60, 23.40, '');

  void p8;

  // Coupons
  const insertCoupon = db.prepare(
    `INSERT INTO coupons (code, type, value, min_spend, usage_limit, used_count, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  insertCoupon.run('OMNI15', 'percent', 15, 100, 500, 14, '2027-12-31');
  insertCoupon.run('WELCOME25', 'fixed', 25, 150, 200, 6, '2027-12-31');

  // Drag & Drop Menu Items
  const insertMenu = db.prepare(
    `INSERT INTO menu_items (label, href, parent_id, sort_order, target_view, is_visible) VALUES (?, ?, ?, ?, ?, 1)`
  );
  const mShop = insertMenu.run('Shop All', '#catalog', null, 1, 'catalog').lastInsertRowid;
  insertMenu.run('Audio & Tech', '#category-audio-tech', mShop, 1, 'category:audio-tech');
  insertMenu.run('Timepieces', '#category-timepieces', mShop, 2, 'category:timepieces');
  insertMenu.run('Bags & Carry', '#category-bags-carry', mShop, 3, 'category:bags-carry');
  insertMenu.run('Electronics', '#category-audio-tech', null, 2, 'category:audio-tech');
  insertMenu.run('Home & Living', '#category-home-kitchen', null, 3, 'category:home-kitchen');
  insertMenu.run('Track Order', '#track-order', null, 4, 'track');

  // Drag & Drop Homepage Layout Sections
  const insertSection = db.prepare(
    `INSERT INTO homepage_sections (section_key, title, subtitle, section_type, sort_order, is_visible, config_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertSection.run(
    'hero_banner',
    'Precision Objects for Daily Rituals',
    'Curated acoustic instruments, Swiss chronographs, and architectural home goods from independent makers.',
    'hero',
    1,
    1,
    JSON.stringify({ ctaLabel: 'Explore Collection', badgeText: 'Autumn / Winter Edition' })
  );
  insertSection.run(
    'featured_collection',
    'Featured Collection',
    'Verified multi-vendor catalog with transparent stock, variant pricing, and instant license delivery.',
    'featured_grid',
    2,
    1,
    JSON.stringify({ columns: 3 })
  );
  insertSection.run(
    'craft_editorial',
    'Engineered Materials, Independent Vendors',
    'Every vendor on OmniMart ships directly from their studio with unified checkout, buyer protection, and live order tracking.',
    'craft_editorial',
    3,
    1,
    JSON.stringify({ metric1: '48h Dispatch', metric2: '2-Year Warranty', metric3: 'Direct Makers' })
  );

  // CMS Pages
  const insertCms = db.prepare(
    `INSERT INTO cms_pages (title, slug, content, meta_title, meta_description, is_published) VALUES (?, ?, ?, ?, ?, 1)`
  );
  insertCms.run(
    'Shipping & Buyer Protection',
    'shipping-policy',
    'Orders over $150 qualify for complimentary express courier shipping. Cash on Delivery (COD) is available with phone and postal verification.',
    'Shipping & Protection | OmniMart',
    'Learn about OmniMart shipping thresholds, express delivery, and Cash on Delivery policies.',
  );
  insertCms.run(
    'Vendor Marketplace Terms',
    'vendor-terms',
    'Independent studios retain 88% to 90% of every sale. Payouts are settled on demand via the Vendor Portal.',
    'Become a Vendor | OmniMart',
    'Commission rates, payout schedules, and studio requirements for OmniMart sellers.'
  );

  // Reviews
  const insertReview = db.prepare(
    `INSERT INTO reviews (product_id, user_id, author_name, rating, comment) VALUES (?, ?, ?, ?, ?)`
  );
  insertReview.run(p1, customerId, 'Claire Mercer', 5, 'Remarkable acoustic clarity and the machined hinges feel indestructible.');
  insertReview.run(p3, customerId, 'David K.', 5, 'Full-grain leather patina looks even better after three weeks of commuting.');

  // Payouts
  const insertPayout = db.prepare(
    `INSERT INTO payouts (vendor_id, amount, method, account_details, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertPayout.run(vendor1Id, 1200.00, 'ACH Bank Transfer', 'Silicon Valley Commercial •••• 4821', 'paid', '2026-11-05 10:00:00');
  insertPayout.run(vendor2Id, 650.00, 'Wire Transfer', 'Nordic Clearing •••• 9104', 'pending', '2026-11-14 15:30:00');

  // Store Settings
  const insertSetting = db.prepare(`INSERT INTO store_settings (key, value) VALUES (?, ?)`);
  insertSetting.run('store_name', 'OmniMart');
  insertSetting.run('support_email', 'support@omnimart.com');
  insertSetting.run('currency_default', 'USD');
  insertSetting.run('tax_rate', '8');
  insertSetting.run('free_shipping_threshold', '150');
  insertSetting.run('shipping_flat_rate', '15');
  insertSetting.run('announcement_text', 'Complimentary express shipping on orders over $150 · Use code OMNI15 for 15% off');
  insertSetting.run('announcement_enabled', '1');
}
