import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'omnimart-dev-secret-change-in-production';

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'vendor' | 'customer';
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

function getTokenFromReq(req: Request): string | null {
  const cookieToken = req.cookies?.omnimart_token;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = getTokenFromReq(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
      req.user = decoded;
    } catch {
      req.user = undefined;
    }
  }
  next();
}

function requireAuth(roles?: Array<'admin' | 'vendor' | 'customer'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = getTokenFromReq(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
      req.user = decoded;
      if (roles && !roles.includes(decoded.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired session' });
    }
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `item-${Date.now()}`;
}

function generateLicenseKey(template: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const base = template && template.includes('X') ? template : 'OMNI-XXXX-XXXX-XXXX';
  return base.replace(/X/g, () => chars[Math.floor(Math.random() * chars.length)]);
}

function getSettingsMap(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM store_settings').all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email) as {
    id: number;
    name: string;
    email: string;
    password_hash: string;
    role: 'admin' | 'vendor' | 'customer';
    phone: string;
    address: string;
    city: string;
    postal_code: string;
  } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const payload: AuthUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = signToken(payload);

  res.cookie('omnimart_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  const vendor = user.role === 'vendor'
    ? db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(user.id)
    : null;

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      city: user.city,
      postal_code: user.postal_code,
    },
    vendor,
  });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { name, email, password, role, shopName } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    shopName?: string;
  };

  if (!name || !email || !password) {
    res.status(400).json({ error: 'Name, email, and password are required' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const assignedRole: 'customer' | 'vendor' = role === 'vendor' ? 'vendor' : 'customer';
  const hash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), email.trim().toLowerCase(), hash, assignedRole);

    const userId = Number(result.lastInsertRowid);
    let vendor = null;
    if (assignedRole === 'vendor') {
      const sName = (shopName || `${name.trim()} Studio`).trim();
      const sSlug = `${slugify(sName)}-${userId}`;
      const vRes = db.prepare(
        `INSERT INTO vendors (user_id, shop_name, slug, description, commission_rate, status)
         VALUES (?, ?, ?, ?, 10, 'active', ?)`
      );
      void vRes;
      const vInserted = db.prepare(
        `INSERT INTO vendors (user_id, shop_name, slug, description, commission_rate, status)
         VALUES (?, ?, ?, ?, 10, 'active')`
      ).run(userId, sName, sSlug, 'Independent seller on OmniMart.');
      vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vInserted.lastInsertRowid);
    }
    return { userId, vendor };
  });

  const { userId, vendor } = tx();
  const payload: AuthUser = { id: userId, name: name.trim(), email: email.trim().toLowerCase(), role: assignedRole };
  const token = signToken(payload);

  res.cookie('omnimart_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    token,
    user: { id: userId, name: payload.name, email: payload.email, role: assignedRole },
    vendor,
  });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('omnimart_token');
  res.json({ ok: true });
});

app.get('/api/auth/me', optionalAuth, (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    res.json({ user: null, vendor: null });
    return;
  }
  const user = db.prepare(
    'SELECT id, name, email, role, phone, address, city, postal_code FROM users WHERE id = ?'
  ).get(req.user.id) as Record<string, unknown> | undefined;

  if (!user) {
    res.json({ user: null, vendor: null });
    return;
  }
  const vendor = user.role === 'vendor'
    ? db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(user.id)
    : null;
  res.json({ user, vendor });
});

// ==========================================
// PUBLIC STOREFRONT & CATALOG ROUTES
// ==========================================
app.get('/api/storefront/bootstrap', (_req: Request, res: Response) => {
  const categories = db.prepare(
    'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
  ).all();

  const products = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug,
           v.shop_name as vendor_name, v.slug as vendor_slug
    FROM products p
    JOIN categories c ON p.category_id = c.id
    JOIN vendors v ON p.vendor_id = v.id
    WHERE p.status = 'published' AND v.status = 'active'
    ORDER BY p.is_featured DESC, p.id ASC
  `).all();

  const menuItems = db.prepare(
    'SELECT * FROM menu_items WHERE is_visible = 1 ORDER BY sort_order ASC, id ASC'
  ).all();

  const sections = db.prepare(
    'SELECT * FROM homepage_sections WHERE is_visible = 1 ORDER BY sort_order ASC, id ASC'
  ).all();

  const cmsPages = db.prepare(
    'SELECT id, title, slug, content, meta_title, meta_description, updated_at FROM cms_pages WHERE is_published = 1 ORDER BY id ASC'
  ).all();

  const vendors = db.prepare(
    "SELECT id, shop_name, slug, description, created_at FROM vendors WHERE status = 'active' ORDER BY id ASC"
  ).all();

  const settings = getSettingsMap();

  res.json({
    categories,
    products,
    menuItems,
    sections,
    cmsPages,
    vendors,
    settings,
  });
});

app.get('/api/products/:slug', (req: Request, res: Response) => {
  const product = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug,
           v.shop_name as vendor_name, v.slug as vendor_slug, v.description as vendor_description
    FROM products p
    JOIN categories c ON p.category_id = c.id
    JOIN vendors v ON p.vendor_id = v.id
    WHERE p.slug = ? OR p.id = ?
  `).get(req.params.slug, req.params.slug) as { id: number } | undefined;

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const reviews = db.prepare(
    'SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC, id DESC'
  ).all(product.id);

  res.json({ product, reviews });
});

app.post('/api/products/:id/reviews', optionalAuth, (req: AuthedRequest, res: Response) => {
  const { authorName, rating, comment } = req.body as {
    authorName?: string;
    rating?: number;
    comment?: string;
  };
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const rVal = Math.min(5, Math.max(1, Number(rating || 5)));
  const author = (req.user?.name || authorName || 'Verified Buyer').trim();
  if (!comment || !comment.trim()) {
    res.status(400).json({ error: 'Review comment is required' });
    return;
  }

  db.prepare(
    'INSERT INTO reviews (product_id, user_id, author_name, rating, comment) VALUES (?, ?, ?, ?, ?)'
  ).run(productId, req.user?.id || null, author, rVal, comment.trim());

  const stats = db.prepare(
    'SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ?'
  ).get(productId) as { avg_rating: number; cnt: number };

  db.prepare('UPDATE products SET rating = ?, review_count = ? WHERE id = ?').run(
    Number((stats.avg_rating || 5).toFixed(1)),
    stats.cnt,
    productId
  );

  const reviews = db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC').all(productId);
  res.status(201).json({ reviews, rating: Number((stats.avg_rating || 5).toFixed(1)), review_count: stats.cnt });
});

app.post('/api/coupons/validate', (req: Request, res: Response) => {
  const { code, subtotal } = req.body as { code?: string; subtotal?: number };
  if (!code) {
    res.status(400).json({ error: 'Coupon code is required' });
    return;
  }
  const coupon = db.prepare(
    'SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND is_active = 1'
  ).get(code.trim()) as {
    id: number;
    code: string;
    type: 'percent' | 'fixed';
    value: number;
    min_spend: number;
    usage_limit: number;
    used_count: number;
    expires_at: string;
  } | undefined;

  if (!coupon) {
    res.status(404).json({ error: 'Coupon code not found or inactive' });
    return;
  }
  if (coupon.used_count >= coupon.usage_limit) {
    res.status(400).json({ error: 'Coupon usage limit reached' });
    return;
  }
  const sub = Number(subtotal || 0);
  if (sub < coupon.min_spend) {
    res.status(400).json({ error: `Minimum spend of $${coupon.min_spend.toFixed(2)} required` });
    return;
  }
  const discount = coupon.type === 'percent'
    ? Number(((sub * coupon.value) / 100).toFixed(2))
    : Math.min(sub, coupon.value);

  res.json({
    valid: true,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discount,
  });
});

// ==========================================
// ORDER PLACEMENT (STOREFRONT & POS)
// ==========================================
app.post('/api/orders', optionalAuth, (req: AuthedRequest, res: Response) => {
  const {
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    shippingCity,
    shippingPostal,
    paymentMethod,
    couponCode,
    source,
    posDiscount,
    items,
  } = req.body as {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    shippingAddress?: string;
    shippingCity?: string;
    shippingPostal?: string;
    paymentMethod?: string;
    couponCode?: string;
    source?: 'storefront' | 'pos';
    posDiscount?: number;
    items?: Array<{ productId: number; quantity: number; variantLabel?: string; unitPrice?: number }>;
  };

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Order must contain at least one item' });
    return;
  }

  const isPos = source === 'pos';
  if (!isPos && (!customerName || !customerEmail || !shippingAddress)) {
    res.status(400).json({ error: 'Customer name, email, and shipping address are required' });
    return;
  }

  const settings = getSettingsMap();
  const taxRate = Number(settings.tax_rate || 8) / 100;
  const freeThreshold = Number(settings.free_shipping_threshold || 150);
  const flatShipping = Number(settings.shipping_flat_rate || 15);

  try {
    const createdOrder = db.transaction(() => {
      let subtotal = 0;
      const lineItems: Array<{
        productId: number;
        vendorId: number;
        title: string;
        sku: string;
        variantLabel: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        vendorPayout: number;
        platformCommission: number;
        licenseKey: string;
      }> = [];

      for (const reqItem of items) {
        const prod = db.prepare(`
          SELECT p.*, v.commission_rate
          FROM products p
          JOIN vendors v ON p.vendor_id = v.id
          WHERE p.id = ?
        `).get(reqItem.productId) as {
          id: number;
          vendor_id: number;
          title: string;
          sku: string;
          product_type: string;
          price: number;
          stock: number;
          attributes_json: string;
          license_key_template: string;
          commission_rate: number;
        } | undefined;

        if (!prod) {
          throw new Error(`Product ID ${reqItem.productId} not found`);
        }
        const qty = Math.max(1, Number(reqItem.quantity || 1));
        if (prod.product_type === 'physical' && prod.stock < qty) {
          throw new Error(`Insufficient stock for ${prod.title} (${prod.stock} left)`);
        }

        let unitPrice = prod.price;
        if (reqItem.variantLabel && prod.attributes_json) {
          try {
            const attrs = JSON.parse(prod.attributes_json) as Array<{
              name: string;
              options: Array<{ label: string; priceDelta: number }>;
            }>;
            for (const attr of attrs) {
              const found = attr.options?.find((o) => o.label === reqItem.variantLabel);
              if (found) {
                unitPrice = Math.max(0, prod.price + Number(found.priceDelta || 0));
              }
            }
          } catch {
            // fallback to base price
          }
        }

        const totalPrice = Number((unitPrice * qty).toFixed(2));
        subtotal += totalPrice;

        const commRate = Number(prod.commission_rate || 10) / 100;
        const platformCommission = Number((totalPrice * commRate).toFixed(2));
        const vendorPayout = Number((totalPrice - platformCommission).toFixed(2));
        const licenseKey = prod.product_type === 'license'
          ? generateLicenseKey(prod.license_key_template)
          : '';

        lineItems.push({
          productId: prod.id,
          vendorId: prod.vendor_id,
          title: prod.title,
          sku: prod.sku,
          variantLabel: reqItem.variantLabel || '',
          quantity: qty,
          unitPrice,
          totalPrice,
          vendorPayout,
          platformCommission,
          licenseKey,
        });

        if (prod.product_type === 'physical') {
          db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, prod.id);
        }

        db.prepare(
          'UPDATE vendors SET balance = balance + ?, total_earnings = total_earnings + ? WHERE id = ?'
        ).run(vendorPayout, vendorPayout, prod.vendor_id);
      }

      let discountTotal = 0;
      let appliedCoupon = '';
      if (couponCode && couponCode.trim()) {
        const coupon = db.prepare(
          'SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND is_active = 1'
        ).get(couponCode.trim()) as {
          id: number;
          code: string;
          type: 'percent' | 'fixed';
          value: number;
          min_spend: number;
          usage_limit: number;
          used_count: number;
        } | undefined;

        if (coupon && coupon.used_count < coupon.usage_limit && subtotal >= coupon.min_spend) {
          discountTotal = coupon.type === 'percent'
            ? Number(((subtotal * coupon.value) / 100).toFixed(2))
            : Math.min(subtotal, coupon.value);
          appliedCoupon = coupon.code;
          db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
        }
      } else if (isPos && posDiscount && posDiscount > 0) {
        discountTotal = Math.min(subtotal, Number(posDiscount));
      }

      const taxableAmount = Math.max(0, subtotal - discountTotal);
      const taxTotal = Number((taxableAmount * taxRate).toFixed(2));
      const shippingTotal = isPos ? 0 : (taxableAmount >= freeThreshold ? 0 : flatShipping);
      const total = Number((taxableAmount + taxTotal + shippingTotal).toFixed(2));

      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM orders').get() as { cnt: number };
      const orderNumber = `OM-${10041 + countRow.cnt + Math.floor(Math.random() * 50)}`;

      const payMethod = paymentMethod || (isPos ? 'pos_card' : 'cod');
      const paymentStatus = payMethod === 'cod' ? 'pending' : 'paid';
      const orderStatus = isPos ? 'delivered' : 'pending';

      const orderRes = db.prepare(`
        INSERT INTO orders (
          order_number, user_id, customer_name, customer_email, customer_phone,
          shipping_address, shipping_city, shipping_postal, payment_method,
          payment_status, order_status, subtotal, discount_total, tax_total,
          shipping_total, total, coupon_code, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderNumber,
        req.user?.id || null,
        (customerName || 'Walk-in POS Guest').trim(),
        (customerEmail || 'pos@omnimart.com').trim(),
        (customerPhone || '').trim(),
        (shippingAddress || 'In-Store Register #1').trim(),
        (shippingCity || 'San Francisco').trim(),
        (shippingPostal || '94105').trim(),
        payMethod,
        paymentStatus,
        orderStatus,
        Number(subtotal.toFixed(2)),
        Number(discountTotal.toFixed(2)),
        taxTotal,
        shippingTotal,
        total,
        appliedCoupon,
        isPos ? 'pos' : 'storefront'
      );

      const orderId = Number(orderRes.lastInsertRowid);
      const insertLine = db.prepare(`
        INSERT INTO order_items (
          order_id, product_id, vendor_id, title, sku, variant_label,
          quantity, unit_price, total_price, vendor_payout, platform_commission, license_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const li of lineItems) {
        insertLine.run(
          orderId, li.productId, li.vendorId, li.title, li.sku, li.variantLabel,
          li.quantity, li.unitPrice, li.totalPrice, li.vendorPayout, li.platformCommission, li.licenseKey
        );
      }

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
      return { order, items: savedItems };
    })();

    res.status(201).json(createdOrder);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to place order' });
  }
});

app.get('/api/orders/track/:orderNumber', (req: Request, res: Response) => {
  const order = db.prepare(
    'SELECT * FROM orders WHERE UPPER(order_number) = UPPER(?)'
  ).get(req.params.orderNumber.trim()) as { id: number } | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order number not found' });
    return;
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ order, items });
});

app.get('/api/orders/my', requireAuth(), (req: AuthedRequest, res: Response) => {
  const orders = db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC'
  ).all(req.user!.id) as Array<{ id: number }>;

  const result = orders.map((o) => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
  }));
  res.json({ orders: result });
});

// ==========================================
// WISHLIST ROUTES
// ==========================================
function getUserWishlistPayload(userId: number) {
  const items = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug,
           v.shop_name as vendor_name, v.slug as vendor_slug,
           w.created_at as saved_at
    FROM wishlist_items w
    JOIN products p ON w.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    JOIN vendors v ON p.vendor_id = v.id
    WHERE w.user_id = ? AND p.status = 'published'
    ORDER BY w.created_at DESC, w.id DESC
  `).all(userId) as Array<{ id: number }>;

  return {
    wishlistIds: items.map((it) => it.id),
    items,
  };
}

app.get('/api/wishlist', requireAuth(), (req: AuthedRequest, res: Response) => {
  res.json(getUserWishlistPayload(req.user!.id));
});

app.post('/api/wishlist/toggle', requireAuth(), (req: AuthedRequest, res: Response) => {
  const { productId } = req.body as { productId?: number };
  const pid = Number(productId);
  if (!pid) {
    res.status(400).json({ error: 'Valid productId is required' });
    return;
  }

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(pid);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const existing = db.prepare(
    'SELECT id FROM wishlist_items WHERE user_id = ? AND product_id = ?'
  ).get(req.user!.id, pid) as { id: number } | undefined;

  let saved = false;
  if (existing) {
    db.prepare('DELETE FROM wishlist_items WHERE id = ?').run(existing.id);
    saved = false;
  } else {
    db.prepare('INSERT INTO wishlist_items (user_id, product_id) VALUES (?, ?)').run(req.user!.id, pid);
    saved = true;
  }

  res.json({ saved, ...getUserWishlistPayload(req.user!.id) });
});

app.delete('/api/wishlist/:productId', requireAuth(), (req: AuthedRequest, res: Response) => {
  const pid = Number(req.params.productId);
  db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?').run(req.user!.id, pid);
  res.json(getUserWishlistPayload(req.user!.id));
});

// ==========================================
// VENDOR DASHBOARD ROUTES
// ==========================================
function getVendorForUser(userId: number) {
  return db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(userId) as {
    id: number;
    user_id: number;
    shop_name: string;
    slug: string;
    description: string;
    commission_rate: number;
    status: string;
    balance: number;
    total_earnings: number;
  } | undefined;
}

app.get('/api/vendor/dashboard', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  let vendor = getVendorForUser(req.user!.id);
  if (!vendor && req.user!.role === 'admin') {
    vendor = db.prepare('SELECT * FROM vendors ORDER BY id ASC LIMIT 1').get() as typeof vendor;
  }
  if (!vendor) {
    res.status(404).json({ error: 'Vendor profile not found' });
    return;
  }

  const products = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.vendor_id = ?
    ORDER BY p.id DESC
  `).all(vendor.id);

  const orders = db.prepare(`
    SELECT DISTINCT o.*
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.vendor_id = ?
    ORDER BY o.created_at DESC, o.id DESC
  `).all(vendor.id) as Array<Record<string, unknown>>;

  const enrichedOrders = orders.map((o) => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ? AND vendor_id = ?').all(o.id, vendor!.id),
  }));

  const dailySalesRaw = db.prepare(`
    SELECT substr(o.created_at, 1, 10) as day,
           ROUND(COALESCE(SUM(oi.vendor_payout), 0), 2) as revenue,
           ROUND(COALESCE(SUM(oi.total_price), 0), 2) as gross_sales,
           COALESCE(SUM(oi.quantity), 0) as units,
           COUNT(DISTINCT o.id) as orders
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.vendor_id = ? AND o.order_status != 'cancelled'
    GROUP BY substr(o.created_at, 1, 10)
    ORDER BY day ASC
  `).all(vendor.id) as Array<{
    day: string;
    revenue: number;
    gross_sales: number;
    units: number;
    orders: number;
  }>;

  const topProducts = db.prepare(`
    SELECT p.id, p.title, p.sku,
           COALESCE(SUM(oi.quantity), 0) as units_sold,
           ROUND(COALESCE(SUM(oi.vendor_payout), 0), 2) as net_revenue,
           ROUND(COALESCE(SUM(oi.total_price), 0), 2) as gross_revenue
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON oi.order_id = o.id AND o.order_status != 'cancelled'
    WHERE p.vendor_id = ?
    GROUP BY p.id
    ORDER BY net_revenue DESC, units_sold DESC, p.id ASC
    LIMIT 6
  `).all(vendor.id);

  const payouts = db.prepare(
    'SELECT * FROM payouts WHERE vendor_id = ? ORDER BY created_at DESC, id DESC'
  ).all(vendor.id);

  const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC').all();

  res.json({
    vendor,
    products,
    orders: enrichedOrders,
    payouts,
    categories,
    dailySales: dailySalesRaw,
    topProducts,
  });
});

app.put('/api/vendor/profile', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const vendor = getVendorForUser(req.user!.id);
  if (!vendor) {
    res.status(404).json({ error: 'Vendor not found' });
    return;
  }
  const { shop_name, description } = req.body as { shop_name?: string; description?: string };
  db.prepare('UPDATE vendors SET shop_name = ?, description = ? WHERE id = ?').run(
    (shop_name || vendor.shop_name).trim(),
    (description ?? vendor.description).trim(),
    vendor.id
  );
  res.json({ vendor: db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendor.id) });
});

app.post('/api/vendor/products', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const vendor = req.user!.role === 'admin'
    ? (db.prepare('SELECT * FROM vendors ORDER BY id ASC LIMIT 1').get() as { id: number })
    : getVendorForUser(req.user!.id);

  if (!vendor) {
    res.status(404).json({ error: 'Vendor profile not found' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const title = String(body.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'Product title is required' });
    return;
  }

  const slug = `${slugify(title)}-${Date.now().toString().slice(-4)}`;
  const sku = String(body.sku || `OM-${Date.now().toString().slice(-6)}`).trim();
  const imageUrl = String(body.image_url || '/src/assets/images/product_wireless_headphones_1794763519971.jpg');

  const inserted = db.prepare(`
    INSERT INTO products (
      vendor_id, category_id, title, slug, sku, product_type, price, compare_at_price,
      stock, image_url, short_description, description, attributes_json,
      digital_file_url, license_key_template, affiliate_url, is_featured, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vendor.id,
    Number(body.category_id || 1),
    title,
    slug,
    sku,
    String(body.product_type || 'physical'),
    Number(body.price || 0),
    body.compare_at_price ? Number(body.compare_at_price) : null,
    Number(body.stock || 0),
    imageUrl,
    String(body.short_description || ''),
    String(body.description || ''),
    typeof body.attributes_json === 'string' ? body.attributes_json : JSON.stringify(body.attributes || []),
    String(body.digital_file_url || ''),
    String(body.license_key_template || ''),
    String(body.affiliate_url || ''),
    body.is_featured ? 1 : 0,
    String(body.status || 'published')
  );

  res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(inserted.lastInsertRowid) });
});

app.put('/api/vendor/products/:id', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const prodId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId) as { vendor_id: number } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  if (req.user!.role === 'vendor') {
    const vendor = getVendorForUser(req.user!.id);
    if (!vendor || vendor.id !== existing.vendor_id) {
      res.status(403).json({ error: 'Cannot edit another vendor product' });
      return;
    }
  }

  const body = req.body as Record<string, unknown>;
  db.prepare(`
    UPDATE products SET
      category_id = COALESCE(?, category_id),
      title = COALESCE(?, title),
      product_type = COALESCE(?, product_type),
      price = COALESCE(?, price),
      compare_at_price = ?,
      stock = COALESCE(?, stock),
      image_url = COALESCE(?, image_url),
      short_description = COALESCE(?, short_description),
      description = COALESCE(?, description),
      attributes_json = COALESCE(?, attributes_json),
      status = COALESCE(?, status)
    WHERE id = ?
  `).run(
    body.category_id ? Number(body.category_id) : null,
    body.title ? String(body.title).trim() : null,
    body.product_type ? String(body.product_type) : null,
    body.price !== undefined ? Number(body.price) : null,
    body.compare_at_price ? Number(body.compare_at_price) : null,
    body.stock !== undefined ? Number(body.stock) : null,
    body.image_url ? String(body.image_url) : null,
    body.short_description !== undefined ? String(body.short_description) : null,
    body.description !== undefined ? String(body.description) : null,
    body.attributes_json ? String(body.attributes_json) : null,
    body.status ? String(body.status) : null,
    prodId
  );

  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(prodId) });
});

app.delete('/api/vendor/products/:id', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const prodId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId) as { vendor_id: number } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  if (req.user!.role === 'vendor') {
    const vendor = getVendorForUser(req.user!.id);
    if (!vendor || vendor.id !== existing.vendor_id) {
      res.status(403).json({ error: 'Cannot delete another vendor product' });
      return;
    }
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(prodId);
  res.json({ ok: true });
});

app.patch('/api/vendor/orders/:orderId/status', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const { order_status } = req.body as { order_status?: string };
  if (!order_status) {
    res.status(400).json({ error: 'order_status is required' });
    return;
  }
  const orderId = Number(req.params.orderId);
  db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(order_status, orderId);
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) });
});

app.post('/api/vendor/payouts', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const vendor = getVendorForUser(req.user!.id);
  if (!vendor) {
    res.status(404).json({ error: 'Vendor not found' });
    return;
  }
  const { amount, method, account_details } = req.body as {
    amount?: number;
    method?: string;
    account_details?: string;
  };
  const amt = Number(amount || 0);
  if (amt <= 0 || amt > vendor.balance) {
    res.status(400).json({ error: 'Invalid payout amount or exceeds available balance' });
    return;
  }

  db.transaction(() => {
    db.prepare('UPDATE vendors SET balance = balance - ? WHERE id = ?').run(amt, vendor.id);
    db.prepare(
      'INSERT INTO payouts (vendor_id, amount, method, account_details, status) VALUES (?, ?, ?, ?, ?)'
    ).run(vendor.id, amt, method || 'Bank Transfer', account_details || 'Default Bank Account', 'pending');
  })();

  res.status(201).json({
    balance: Number((vendor.balance - amt).toFixed(2)),
    payouts: db.prepare('SELECT * FROM payouts WHERE vendor_id = ? ORDER BY id DESC').all(vendor.id),
  });
});

// ==========================================
// ADMIN DASHBOARD ROUTES
// ==========================================
app.get('/api/admin/overview', requireAuth(['admin']), (_req: Request, res: Response) => {
  const revenueRow = db.prepare(
    "SELECT COALESCE(SUM(total), 0) as gross_revenue, COUNT(*) as total_orders FROM orders WHERE order_status != 'cancelled'"
  ).get() as { gross_revenue: number; total_orders: number };

  const commissionRow = db.prepare(
    'SELECT COALESCE(SUM(platform_commission), 0) as total_commission FROM order_items'
  ).get() as { total_commission: number };

  const productCount = db.prepare('SELECT COUNT(*) as cnt FROM products').get() as { cnt: number };
  const vendorCount = db.prepare("SELECT COUNT(*) as cnt FROM vendors WHERE status = 'active'").get() as { cnt: number };
  const customerCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'customer'").get() as { cnt: number };

  const recentOrders = db.prepare(
    'SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 10'
  ).all();

  const dailySeries = db.prepare(`
    SELECT substr(created_at, 1, 10) as day, SUM(total) as revenue, COUNT(*) as orders
    FROM orders
    GROUP BY substr(created_at, 1, 10)
    ORDER BY day ASC
    LIMIT 14
  `).all();

  const payouts = db.prepare(`
    SELECT p.*, v.shop_name
    FROM payouts p
    JOIN vendors v ON p.vendor_id = v.id
    ORDER BY p.created_at DESC, p.id DESC
  `).all();

  res.json({
    kpis: {
      grossRevenue: Number(revenueRow.gross_revenue.toFixed(2)),
      totalCommission: Number(commissionRow.total_commission.toFixed(2)),
      totalOrders: revenueRow.total_orders,
      productCount: productCount.cnt,
      vendorCount: vendorCount.cnt,
      customerCount: customerCount.cnt,
    },
    dailySeries,
    recentOrders,
    payouts,
    settings: getSettingsMap(),
  });
});

app.get('/api/admin/products', requireAuth(['admin']), (_req: Request, res: Response) => {
  const products = db.prepare(`
    SELECT p.*, c.name as category_name, v.shop_name as vendor_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    JOIN vendors v ON p.vendor_id = v.id
    ORDER BY p.id DESC
  `).all();
  res.json({ products });
});

app.post('/api/admin/products', requireAuth(['admin']), (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const title = String(body.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }
  const slug = `${slugify(title)}-${Date.now().toString().slice(-4)}`;
  const sku = String(body.sku || `OM-${Date.now().toString().slice(-6)}`).trim();
  const inserted = db.prepare(`
    INSERT INTO products (
      vendor_id, category_id, title, slug, sku, product_type, price, compare_at_price,
      stock, image_url, short_description, description, attributes_json,
      digital_file_url, license_key_template, affiliate_url, is_featured, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(body.vendor_id || 1),
    Number(body.category_id || 1),
    title,
    slug,
    sku,
    String(body.product_type || 'physical'),
    Number(body.price || 0),
    body.compare_at_price ? Number(body.compare_at_price) : null,
    Number(body.stock || 0),
    String(body.image_url || '/src/assets/images/product_wireless_headphones_1794763519971.jpg'),
    String(body.short_description || ''),
    String(body.description || ''),
    typeof body.attributes_json === 'string' ? body.attributes_json : JSON.stringify(body.attributes || []),
    String(body.digital_file_url || ''),
    String(body.license_key_template || ''),
    String(body.affiliate_url || ''),
    body.is_featured ? 1 : 0,
    String(body.status || 'published')
  );
  res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(inserted.lastInsertRowid) });
});

app.put('/api/admin/products/:id', requireAuth(['admin']), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  db.prepare(`
    UPDATE products SET
      vendor_id = COALESCE(?, vendor_id),
      category_id = COALESCE(?, category_id),
      title = COALESCE(?, title),
      product_type = COALESCE(?, product_type),
      price = COALESCE(?, price),
      compare_at_price = ?,
      stock = COALESCE(?, stock),
      image_url = COALESCE(?, image_url),
      short_description = COALESCE(?, short_description),
      description = COALESCE(?, description),
      attributes_json = COALESCE(?, attributes_json),
      is_featured = COALESCE(?, is_featured),
      status = COALESCE(?, status)
    WHERE id = ?
  `).run(
    body.vendor_id ? Number(body.vendor_id) : null,
    body.category_id ? Number(body.category_id) : null,
    body.title ? String(body.title).trim() : null,
    body.product_type ? String(body.product_type) : null,
    body.price !== undefined ? Number(body.price) : null,
    body.compare_at_price ? Number(body.compare_at_price) : null,
    body.stock !== undefined ? Number(body.stock) : null,
    body.image_url ? String(body.image_url) : null,
    body.short_description !== undefined ? String(body.short_description) : null,
    body.description !== undefined ? String(body.description) : null,
    body.attributes_json ? String(body.attributes_json) : null,
    body.is_featured !== undefined ? (body.is_featured ? 1 : 0) : null,
    body.status ? String(body.status) : null,
    id
  );
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(id) });
});

app.delete('/api/admin/products/:id', requireAuth(['admin']), (req: Request, res: Response) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/products/export/csv', requireAuth(['admin']), (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT p.sku, p.title, p.product_type, p.price, p.stock, c.name as category, v.shop_name as vendor, p.status
    FROM products p
    JOIN categories c ON p.category_id = c.id
    JOIN vendors v ON p.vendor_id = v.id
    ORDER BY p.id ASC
  `).all() as Array<Record<string, unknown>>;

  const header = 'sku,title,product_type,price,stock,category,vendor,status';
  const lines = rows.map((r) =>
    [r.sku, r.title, r.product_type, r.price, r.stock, r.category, r.vendor, r.status]
      .map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="omnimart-products.csv"');
  res.send([header, ...lines].join('\n'));
});

app.post('/api/admin/products/import/csv', requireAuth(['admin']), (req: Request, res: Response) => {
  const { csvText } = req.body as { csvText?: string };
  if (!csvText || !csvText.trim()) {
    res.status(400).json({ error: 'CSV content is required' });
    return;
  }
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    res.status(400).json({ error: 'CSV must include a header row and at least one product row' });
    return;
  }
  let imported = 0;
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO products (
      vendor_id, category_id, title, slug, sku, product_type, price, stock, image_url, short_description, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
  `);

  db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 4 || !cols[1]) continue;
      const sku = cols[0] || `OM-CSV-${Date.now()}-${i}`;
      const title = cols[1];
      const pType = cols[2] || 'physical';
      const price = Number(cols[3]) || 49;
      const stock = Number(cols[4]) || 25;
      insertStmt.run(
        1,
        1,
        title,
        `${slugify(title)}-${Date.now().toString().slice(-3)}-${i}`,
        sku,
        pType,
        price,
        stock,
        '/src/assets/images/product_mechanical_keyboard_1794763521199.jpg',
        'Imported via CSV catalog upload'
      );
      imported++;
    }
  })();

  res.json({ imported });
});

// Categories
app.get('/api/admin/categories', requireAuth(['admin']), (_req: Request, res: Response) => {
  res.json({ categories: db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all() });
});

app.post('/api/admin/categories', requireAuth(['admin']), (req: Request, res: Response) => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Category name required' });
    return;
  }
  const slug = slugify(name);
  const resInsert = db.prepare('INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, 10)').run(
    name.trim(),
    slug,
    (description || '').trim()
  );
  res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(resInsert.lastInsertRowid) });
});

app.delete('/api/admin/categories/:id', requireAuth(['admin']), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const count = db.prepare('SELECT COUNT(*) as cnt FROM products WHERE category_id = ?').get(id) as { cnt: number };
  if (count.cnt > 0) {
    res.status(400).json({ error: 'Reassign or delete products in this category first' });
    return;
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Orders
app.get('/api/admin/orders', requireAuth(['admin']), (_req: Request, res: Response) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all() as Array<Record<string, unknown>>;
  const enriched = orders.map((o) => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
  }));
  res.json({ orders: enriched });
});

app.patch('/api/admin/orders/:id/status', requireAuth(['admin']), (req: Request, res: Response) => {
  const { order_status, payment_status } = req.body as { order_status?: string; payment_status?: string };
  const id = Number(req.params.id);
  db.prepare(`
    UPDATE orders SET
      order_status = COALESCE(?, order_status),
      payment_status = COALESCE(?, payment_status)
    WHERE id = ?
  `).run(order_status || null, payment_status || null, id);
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id = ?').get(id) });
});

app.get('/api/admin/orders/export/csv', requireAuth(['admin']), (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all() as Array<Record<string, unknown>>;
  const header = 'order_number,customer_name,customer_email,payment_method,payment_status,order_status,total,source,created_at';
  const lines = rows.map((r) =>
    [r.order_number, r.customer_name, r.customer_email, r.payment_method, r.payment_status, r.order_status, r.total, r.source, r.created_at]
      .map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="omnimart-orders.csv"');
  res.send([header, ...lines].join('\n'));
});

// Vendors & Payouts
app.get('/api/admin/vendors', requireAuth(['admin']), (_req: Request, res: Response) => {
  const vendors = db.prepare(`
    SELECT v.*, u.name as owner_name, u.email as owner_email,
           (SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id) as product_count
    FROM vendors v
    JOIN users u ON v.user_id = u.id
    ORDER BY v.id ASC
  `).all();
  res.json({ vendors });
});

app.patch('/api/admin/vendors/:id', requireAuth(['admin']), (req: Request, res: Response) => {
  const { status, commission_rate } = req.body as { status?: string; commission_rate?: number };
  const id = Number(req.params.id);
  db.prepare(`
    UPDATE vendors SET
      status = COALESCE(?, status),
      commission_rate = COALESCE(?, commission_rate)
    WHERE id = ?
  `).run(status || null, commission_rate !== undefined ? Number(commission_rate) : null, id);
  res.json({ vendor: db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) });
});

app.patch('/api/admin/payouts/:id', requireAuth(['admin']), (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  const id = Number(req.params.id);
  const payout = db.prepare('SELECT * FROM payouts WHERE id = ?').get(id) as { vendor_id: number; amount: number; status: string } | undefined;
  if (!payout) {
    res.status(404).json({ error: 'Payout not found' });
    return;
  }
  db.transaction(() => {
    if (status === 'rejected' && payout.status !== 'rejected') {
      db.prepare('UPDATE vendors SET balance = balance + ? WHERE id = ?').run(payout.amount, payout.vendor_id);
    }
    db.prepare('UPDATE payouts SET status = ? WHERE id = ?').run(status || 'paid', id);
  })();
  res.json({ ok: true });
});

// Coupons
app.get('/api/admin/coupons', requireAuth(['admin']), (_req: Request, res: Response) => {
  res.json({ coupons: db.prepare('SELECT * FROM coupons ORDER BY id DESC').all() });
});

app.post('/api/admin/coupons', requireAuth(['admin']), (req: Request, res: Response) => {
  const { code, type, value, min_spend, usage_limit, expires_at } = req.body as Record<string, unknown>;
  if (!code) {
    res.status(400).json({ error: 'Coupon code is required' });
    return;
  }
  const inserted = db.prepare(
    'INSERT INTO coupons (code, type, value, min_spend, usage_limit, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).run(
    String(code).trim().toUpperCase(),
    String(type || 'percent'),
    Number(value || 10),
    Number(min_spend || 0),
    Number(usage_limit || 100),
    String(expires_at || '2027-12-31')
  );
  res.status(201).json({ coupon: db.prepare('SELECT * FROM coupons WHERE id = ?').get(inserted.lastInsertRowid) });
});

app.delete('/api/admin/coupons/:id', requireAuth(['admin']), (req: Request, res: Response) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// DRAG & DROP MENU BUILDER
app.get('/api/admin/menus', requireAuth(['admin']), (_req: Request, res: Response) => {
  res.json({ menuItems: db.prepare('SELECT * FROM menu_items ORDER BY sort_order ASC, id ASC').all() });
});

app.put('/api/admin/menus/reorder', requireAuth(['admin']), (req: Request, res: Response) => {
  const { items } = req.body as {
    items?: Array<{
      id?: number;
      clientId?: string;
      label: string;
      href: string;
      parent_id: number | null;
      parentClientId?: string | null;
      sort_order: number;
      target_view: string;
      is_visible: number;
    }>;
  };
  if (!items || !Array.isArray(items)) {
    res.status(400).json({ error: 'Menu items array is required' });
    return;
  }

  const saved = db.transaction(() => {
    db.prepare('DELETE FROM menu_items').run();
    const idMap = new Map<string, number>();

    const insertStmt = db.prepare(
      'INSERT INTO menu_items (label, href, parent_id, sort_order, target_view, is_visible) VALUES (?, ?, ?, ?, ?, ?)'
    );

    // First insert top-level items
    for (const item of items.filter((x) => !x.parent_id && !x.parentClientId)) {
      const resInsert = insertStmt.run(
        item.label.trim(),
        item.href || '#catalog',
        null,
        item.sort_order,
        item.target_view || 'catalog',
        item.is_visible ? 1 : 0
      );
      const newId = Number(resInsert.lastInsertRowid);
      if (item.clientId) idMap.set(item.clientId, newId);
      if (item.id) idMap.set(String(item.id), newId);
    }

    // Then insert child items
    for (const item of items.filter((x) => x.parent_id || x.parentClientId)) {
      const resolvedParent = item.parentClientId
        ? idMap.get(item.parentClientId) ?? null
        : (item.parent_id ? idMap.get(String(item.parent_id)) ?? null : null);
      insertStmt.run(
        item.label.trim(),
        item.href || '#catalog',
        resolvedParent,
        item.sort_order,
        item.target_view || 'catalog',
        item.is_visible ? 1 : 0
      );
    }

    return db.prepare('SELECT * FROM menu_items ORDER BY sort_order ASC, id ASC').all();
  })();

  res.json({ menuItems: saved });
});

// DRAG & DROP HOMEPAGE LAYOUT BUILDER
app.get('/api/admin/sections', requireAuth(['admin']), (_req: Request, res: Response) => {
  res.json({ sections: db.prepare('SELECT * FROM homepage_sections ORDER BY sort_order ASC, id ASC').all() });
});

app.put('/api/admin/sections/reorder', requireAuth(['admin']), (req: Request, res: Response) => {
  const { sections } = req.body as {
    sections?: Array<{
      id: number;
      title: string;
      subtitle: string;
      sort_order: number;
      is_visible: number;
      config_json: string;
    }>;
  };
  if (!sections || !Array.isArray(sections)) {
    res.status(400).json({ error: 'Sections array is required' });
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE homepage_sections SET
      title = ?,
      subtitle = ?,
      sort_order = ?,
      is_visible = ?,
      config_json = ?
    WHERE id = ?
  `);

  db.transaction(() => {
    for (const sec of sections) {
      updateStmt.run(
        sec.title,
        sec.subtitle || '',
        sec.sort_order,
        sec.is_visible ? 1 : 0,
        sec.config_json || '{}',
        sec.id
      );
    }
  })();

  res.json({ sections: db.prepare('SELECT * FROM homepage_sections ORDER BY sort_order ASC, id ASC').all() });
});

// CMS Pages & Store Settings
app.get('/api/admin/cms', requireAuth(['admin']), (_req: Request, res: Response) => {
  res.json({ pages: db.prepare('SELECT * FROM cms_pages ORDER BY id ASC').all() });
});

app.post('/api/admin/cms', requireAuth(['admin']), (req: Request, res: Response) => {
  const { title, content, meta_title, meta_description } = req.body as Record<string, string>;
  if (!title || !content) {
    res.status(400).json({ error: 'Title and content are required' });
    return;
  }
  const slug = slugify(title);
  const inserted = db.prepare(
    'INSERT INTO cms_pages (title, slug, content, meta_title, meta_description, is_published) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(title.trim(), slug, content.trim(), meta_title || title.trim(), meta_description || '');
  res.status(201).json({ page: db.prepare('SELECT * FROM cms_pages WHERE id = ?').get(inserted.lastInsertRowid) });
});

app.put('/api/admin/cms/:id', requireAuth(['admin']), (req: Request, res: Response) => {
  const { title, content, is_published } = req.body as { title?: string; content?: string; is_published?: number };
  const id = Number(req.params.id);
  db.prepare(
    "UPDATE cms_pages SET title = COALESCE(?, title), content = COALESCE(?, content), is_published = COALESCE(?, is_published), updated_at = datetime('now') WHERE id = ?"
  ).run(title || null, content || null, is_published !== undefined ? (is_published ? 1 : 0) : null, id);
  res.json({ page: db.prepare('SELECT * FROM cms_pages WHERE id = ?').get(id) });
});

app.delete('/api/admin/cms/:id', requireAuth(['admin']), (req: Request, res: Response) => {
  db.prepare('DELETE FROM cms_pages WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.put('/api/admin/settings', requireAuth(['admin']), (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  const upsert = db.prepare('INSERT INTO store_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      upsert.run(k, String(v));
    }
  })();
  res.json({ settings: getSettingsMap() });
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OmniMart server listening on http://localhost:${PORT}`);
  });
}

startServer();
