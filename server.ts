import 'dotenv/config';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'omnimart-dev-secret-change-in-production';
const LOYALTY_POINT_VALUE = 0.05; // 100 points = $5.00 discount

function getGeminiClient(apiVersion?: string): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      ...(apiVersion ? { apiVersion } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// Real-time order tracking SSE subscribers keyed by order ID
const trackingSubscribers = new Map<number, Set<Response>>();

function emitOrderTrackingUpdate(orderId: number) {
  const subs = trackingSubscribers.get(orderId);
  if (!subs || subs.size === 0) return;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  const payload = `event: order_update\ndata: ${JSON.stringify({ order, items })}\n\n`;
  for (const res of subs) {
    try {
      res.write(payload);
    } catch {
      subs.delete(res);
    }
  }
}

function addDaysIsoDate(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function hasPurchasedProduct(userId: number, productId: number): boolean {
  const row = db.prepare(`
    SELECT 1 as found
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id = ? AND oi.product_id = ? AND o.order_status != 'cancelled'
    LIMIT 1
  `).get(userId, productId) as { found: number } | undefined;
  return Boolean(row);
}

function getEnrichedProductReviews(productId: number) {
  return db.prepare(`
    SELECT r.*,
      CASE WHEN r.user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = r.user_id AND oi.product_id = r.product_id AND o.order_status != 'cancelled'
      ) THEN 1 ELSE 0 END as verified_purchase
    FROM reviews r
    WHERE r.product_id = ?
    ORDER BY r.created_at DESC, r.id DESC
  `).all(productId);
}

function findOrderForTracking(rawQuery: string) {
  const cleaned = rawQuery.trim().replace(/^#/, '');
  if (!cleaned) return undefined;
  const isNumeric = /^\d+$/.test(cleaned);
  if (isNumeric) {
    return db.prepare(
      'SELECT * FROM orders WHERE id = ? OR UPPER(order_number) = UPPER(?)'
    ).get(Number(cleaned), cleaned) as { id: number } | undefined;
  }
  return db.prepare(
    'SELECT * FROM orders WHERE UPPER(order_number) = UPPER(?) OR UPPER(tracking_code) = UPPER(?)'
  ).get(cleaned, cleaned) as { id: number } | undefined;
}

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

interface BundleRow {
  id: number;
  vendor_id: number;
  title: string;
  slug: string;
  description: string;
  discount_percent: number;
  image_url: string;
  is_active: number;
  created_at: string;
  vendor_name: string;
  vendor_slug: string;
}

interface BundleComponentRow {
  id: number;
  bundle_id: number;
  product_id: number;
  quantity: number;
  title: string;
  slug: string;
  sku: string;
  price: number;
  stock: number;
  product_type: 'physical' | 'digital' | 'license' | 'affiliate';
  image_url: string;
  short_description: string;
  category_name: string;
  status: string;
}

function getEnrichedBundles(options?: { onlyActive?: boolean; vendorId?: number }) {
  const clauses: string[] = ["v.status = 'active'"];
  const params: unknown[] = [];
  if (options?.onlyActive) {
    clauses.push('b.is_active = 1');
  }
  if (options?.vendorId) {
    clauses.push('b.vendor_id = ?');
    params.push(options.vendorId);
  }

  const bundles = db.prepare(`
    SELECT b.*, v.shop_name as vendor_name, v.slug as vendor_slug
    FROM bundles b
    JOIN vendors v ON b.vendor_id = v.id
    WHERE ${clauses.join(' AND ')}
    ORDER BY b.id DESC
  `).all(...params) as BundleRow[];

  const itemStmt = db.prepare(`
    SELECT bi.id, bi.bundle_id, bi.product_id, bi.quantity,
           p.title, p.slug, p.sku, p.price, p.stock, p.product_type,
           p.image_url, p.short_description, p.status, c.name as category_name
    FROM bundle_items bi
    JOIN products p ON bi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE bi.bundle_id = ?
    ORDER BY bi.id ASC
  `);

  return bundles
    .map((b) => {
      const items = itemStmt.all(b.id) as BundleComponentRow[];
      const regularTotal = Number(
        items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0).toFixed(2)
      );
      const bundlePrice = Number(
        (regularTotal * (1 - Number(b.discount_percent) / 100)).toFixed(2)
      );
      const savings = Number((regularTotal - bundlePrice).toFixed(2));
      const physicalItems = items.filter((it) => it.product_type === 'physical');
      const availableStock =
        physicalItems.length === 0
          ? 999
          : Math.min(
              ...physicalItems.map((it) =>
                Math.floor(Math.max(0, Number(it.stock)) / Math.max(1, Number(it.quantity)))
              )
            );
      return {
        ...b,
        image_url: b.image_url || items[0]?.image_url || '/src/assets/images/product_wireless_headphones_1794763519971.jpg',
        items,
        regular_total: regularTotal,
        bundle_price: bundlePrice,
        savings,
        available_stock: availableStock,
      };
    })
    .filter((b) => b.items.length >= 2);
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
    loyalty_points: number;
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
      loyalty_points: user.loyalty_points || 0,
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
  const welcomePoints = assignedRole === 'customer' ? 150 : 0;

  const tx = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, loyalty_points) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), email.trim().toLowerCase(), hash, assignedRole, welcomePoints);

    const userId = Number(result.lastInsertRowid);
    if (welcomePoints > 0) {
      db.prepare(
        `INSERT INTO loyalty_transactions (user_id, order_id, points_delta, type, description)
         VALUES (?, NULL, ?, 'bonus', 'OmniMart Rewards Welcome Bonus')`
      ).run(userId, welcomePoints);
    }
    let vendor = null;
    if (assignedRole === 'vendor') {
      const sName = (shopName || `${name.trim()} Studio`).trim();
      const sSlug = `${slugify(sName)}-${userId}`;
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
    user: {
      id: userId,
      name: payload.name,
      email: payload.email,
      role: assignedRole,
      loyalty_points: welcomePoints,
    },
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
    'SELECT id, name, email, role, phone, address, city, postal_code, loyalty_points FROM users WHERE id = ?'
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
  const bundles = getEnrichedBundles({ onlyActive: true });

  res.json({
    categories,
    products,
    bundles,
    menuItems,
    sections,
    cmsPages,
    vendors,
    settings,
  });
});

// ==========================================
// PRODUCT BUNDLES (BUNDLE BUILDER ROUTES)
// ==========================================
app.get('/api/bundles', optionalAuth, (req: AuthedRequest, res: Response) => {
  const mineOnly = req.query.mine === '1';
  if (mineOnly && req.user) {
    if (req.user.role === 'vendor') {
      const vendor = getVendorForUser(req.user.id);
      res.json({ bundles: vendor ? getEnrichedBundles({ vendorId: vendor.id }) : [] });
      return;
    }
    if (req.user.role === 'admin') {
      res.json({ bundles: getEnrichedBundles() });
      return;
    }
  }
  res.json({ bundles: getEnrichedBundles({ onlyActive: true }) });
});

app.post('/api/bundles', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const { title, description, discountPercent, imageUrl, vendorId, items } = req.body as {
    title?: string;
    description?: string;
    discountPercent?: number;
    imageUrl?: string;
    vendorId?: number;
    items?: Array<{ productId: number; quantity?: number }>;
  };

  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Bundle title is required' });
    return;
  }

  const discount = Number(discountPercent ?? 10);
  if (Number.isNaN(discount) || discount < 1 || discount > 75) {
    res.status(400).json({ error: 'Combined discount percentage must be between 1% and 75%' });
    return;
  }

  if (!items || !Array.isArray(items) || items.length < 2) {
    res.status(400).json({ error: 'Select at least 2 complementary products to build a bundle' });
    return;
  }

  // Deduplicate product selections
  const mergedItems = new Map<number, number>();
  for (const it of items) {
    const pid = Number(it.productId);
    const qty = Math.max(1, Math.floor(Number(it.quantity || 1)));
    if (pid > 0) {
      mergedItems.set(pid, (mergedItems.get(pid) || 0) + qty);
    }
  }

  if (mergedItems.size < 2) {
    res.status(400).json({ error: 'A bundle must include at least 2 distinct products' });
    return;
  }

  let resolvedVendorId: number | null = null;
  if (req.user!.role === 'vendor') {
    const v = getVendorForUser(req.user!.id);
    if (!v) {
      res.status(404).json({ error: 'Vendor profile not found' });
      return;
    }
    resolvedVendorId = v.id;
  } else {
    resolvedVendorId = vendorId ? Number(vendorId) : null;
  }

  const selectedProductRows = Array.from(mergedItems.keys()).map((pid) =>
    db.prepare('SELECT id, vendor_id, image_url FROM products WHERE id = ? AND status = ?').get(pid, 'published') as
      | { id: number; vendor_id: number; image_url: string }
      | undefined
  );

  if (selectedProductRows.some((r) => !r)) {
    res.status(400).json({ error: 'All bundle products must exist and be published' });
    return;
  }

  const validProducts = selectedProductRows as Array<{ id: number; vendor_id: number; image_url: string }>;
  if (!resolvedVendorId) {
    resolvedVendorId = validProducts[0].vendor_id;
  }

  if (req.user!.role === 'vendor' && validProducts.some((p) => p.vendor_id !== resolvedVendorId)) {
    res.status(403).json({ error: 'Vendors can only bundle products belonging to their own shop' });
    return;
  }

  const coverImage = imageUrl?.trim() || validProducts[0].image_url;
  const slug = `${slugify(title)}-${Date.now().toString().slice(-5)}`;

  const newBundleId = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT INTO bundles (vendor_id, title, slug, description, discount_percent, image_url, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      resolvedVendorId,
      title.trim(),
      slug,
      (description || '').trim(),
      Number(discount.toFixed(1)),
      coverImage
    );

    const bId = Number(inserted.lastInsertRowid);
    const insItem = db.prepare('INSERT INTO bundle_items (bundle_id, product_id, quantity) VALUES (?, ?, ?)');
    for (const [pid, qty] of mergedItems.entries()) {
      insItem.run(bId, pid, qty);
    }
    return bId;
  })();

  const created = getEnrichedBundles().find((b) => b.id === newBundleId);
  res.status(201).json({ bundle: created });
});

app.patch('/api/bundles/:id', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const bundleId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM bundles WHERE id = ?').get(bundleId) as
    | { id: number; vendor_id: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Bundle not found' });
    return;
  }
  if (req.user!.role === 'vendor') {
    const vendor = getVendorForUser(req.user!.id);
    if (!vendor || vendor.id !== existing.vendor_id) {
      res.status(403).json({ error: 'Cannot modify another vendor bundle' });
      return;
    }
  }

  const { title, description, discountPercent, is_active } = req.body as {
    title?: string;
    description?: string;
    discountPercent?: number;
    is_active?: number | boolean;
  };

  db.prepare(`
    UPDATE bundles SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      discount_percent = COALESCE(?, discount_percent),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    title ? title.trim() : null,
    description !== undefined ? description.trim() : null,
    discountPercent !== undefined ? Math.min(75, Math.max(1, Number(discountPercent))) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    bundleId
  );

  const updated = getEnrichedBundles().find((b) => b.id === bundleId);
  res.json({ bundle: updated });
});

app.delete('/api/bundles/:id', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  const bundleId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM bundles WHERE id = ?').get(bundleId) as
    | { id: number; vendor_id: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Bundle not found' });
    return;
  }
  if (req.user!.role === 'vendor') {
    const vendor = getVendorForUser(req.user!.id);
    if (!vendor || vendor.id !== existing.vendor_id) {
      res.status(403).json({ error: 'Cannot delete another vendor bundle' });
      return;
    }
  }
  db.prepare('DELETE FROM bundles WHERE id = ?').run(bundleId);
  res.json({ ok: true });
});

app.get('/api/products/:slug', optionalAuth, (req: AuthedRequest, res: Response) => {
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

  const reviews = getEnrichedProductReviews(product.id);
  const canReview = req.user ? hasPurchasedProduct(req.user.id, product.id) : false;

  res.json({ product, reviews, canReview });
});

app.post('/api/products/:id/reviews', requireAuth(), (req: AuthedRequest, res: Response) => {
  const { rating, comment } = req.body as {
    rating?: number;
    comment?: string;
  };
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const rVal = Math.min(5, Math.max(1, Math.round(Number(rating || 5))));
  const author = req.user!.name.trim();
  if (!comment || !comment.trim()) {
    res.status(400).json({ error: 'Review comment is required' });
    return;
  }

  db.prepare(
    'INSERT INTO reviews (product_id, user_id, author_name, rating, comment) VALUES (?, ?, ?, ?, ?)'
  ).run(productId, req.user!.id, author, rVal, comment.trim());

  const stats = db.prepare(
    'SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ?'
  ).get(productId) as { avg_rating: number; cnt: number };

  const updatedRating = Number((stats.avg_rating || 5).toFixed(1));
  db.prepare('UPDATE products SET rating = ?, review_count = ? WHERE id = ?').run(
    updatedRating,
    stats.cnt,
    productId
  );

  const reviews = getEnrichedProductReviews(productId);
  res.status(201).json({ reviews, rating: updatedRating, review_count: stats.cnt });
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
    pointsToRedeem,
    orderNotes,
    checkoutAsGuest,
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
    pointsToRedeem?: number;
    orderNotes?: string;
    checkoutAsGuest?: boolean;
    source?: 'storefront' | 'pos';
    posDiscount?: number;
    items?: Array<{
      productId?: number;
      bundleId?: number;
      quantity: number;
      variantLabel?: string;
      unitPrice?: number;
    }>;
  };

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Order must contain at least one item' });
    return;
  }

  const isPos = source === 'pos';
  if (
    !isPos &&
    (!customerEmail?.trim() ||
      !shippingAddress?.trim() ||
      !shippingCity?.trim() ||
      !shippingPostal?.trim())
  ) {
    res.status(400).json({
      error: 'Email and complete shipping details (street address, city, postal code) are required',
    });
    return;
  }

  const effectiveUser = !isPos && !checkoutAsGuest ? req.user || null : null;
  const cleanedNotes = typeof orderNotes === 'string' ? orderNotes.trim().slice(0, 1000) : '';

  const settings = getSettingsMap();
  const taxRate = Number(settings.tax_rate || 8) / 100;
  const freeThreshold = Number(settings.free_shipping_threshold || 150);
  const flatShipping = Number(settings.shipping_flat_rate || 15);

  try {
    const createdOrder = db.transaction(() => {
      let subtotal = 0;
      const lineItems: Array<{
        productId: number;
        bundleId: number | null;
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
        const qty = Math.max(1, Number(reqItem.quantity || 1));

        if (reqItem.bundleId) {
          const bundle = db.prepare('SELECT * FROM bundles WHERE id = ? AND is_active = 1').get(reqItem.bundleId) as
            | { id: number; vendor_id: number; title: string; discount_percent: number }
            | undefined;

          if (!bundle) {
            throw new Error(`Bundle ID ${reqItem.bundleId} not found or inactive`);
          }

          const components = db.prepare(`
            SELECT bi.product_id, bi.quantity,
                   p.title, p.sku, p.product_type, p.price, p.stock, p.license_key_template, p.vendor_id,
                   v.commission_rate
            FROM bundle_items bi
            JOIN products p ON bi.product_id = p.id
            JOIN vendors v ON p.vendor_id = v.id
            WHERE bi.bundle_id = ?
            ORDER BY bi.id ASC
          `).all(bundle.id) as Array<{
            product_id: number;
            quantity: number;
            title: string;
            sku: string;
            product_type: string;
            price: number;
            stock: number;
            license_key_template: string;
            vendor_id: number;
            commission_rate: number;
          }>;

          if (components.length === 0) {
            throw new Error(`Bundle ${bundle.title} has no products`);
          }

          for (const comp of components) {
            const needed = comp.quantity * qty;
            if (comp.product_type === 'physical' && comp.stock < needed) {
              throw new Error(
                `Insufficient stock for "${comp.title}" in bundle "${bundle.title}" (${comp.stock} left)`
              );
            }
          }

          const regularTotal = components.reduce((s, c) => s + c.price * c.quantity, 0);
          const unitPrice = Number((regularTotal * (1 - bundle.discount_percent / 100)).toFixed(2));
          const totalPrice = Number((unitPrice * qty).toFixed(2));
          subtotal += totalPrice;

          let totalCommission = 0;
          let totalPayout = 0;
          const licenseKeys: string[] = [];

          for (const comp of components) {
            const needed = comp.quantity * qty;
            if (comp.product_type === 'physical') {
              db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(needed, comp.product_id);
            }
            if (comp.product_type === 'license') {
              for (let k = 0; k < needed; k++) {
                licenseKeys.push(generateLicenseKey(comp.license_key_template));
              }
            }
            const share = regularTotal > 0 ? (comp.price * comp.quantity) / regularTotal : 1 / components.length;
            const compTotal = totalPrice * share;
            const compRate = Number(comp.commission_rate || 10) / 100;
            const compCommission = Number((compTotal * compRate).toFixed(2));
            const compPayout = Number((compTotal - compCommission).toFixed(2));
            totalCommission += compCommission;
            totalPayout += compPayout;

            db.prepare(
              'UPDATE vendors SET balance = balance + ?, total_earnings = total_earnings + ? WHERE id = ?'
            ).run(compPayout, compPayout, comp.vendor_id);
          }

          const summaryLabel = `Bundle (${bundle.discount_percent}% off) · ${components
            .map((c) => `${c.quantity}× ${c.title}`)
            .join(' + ')}`;

          lineItems.push({
            productId: components[0].product_id,
            bundleId: bundle.id,
            vendorId: bundle.vendor_id,
            title: bundle.title,
            sku: `BND-${bundle.id}`,
            variantLabel: summaryLabel,
            quantity: qty,
            unitPrice,
            totalPrice,
            vendorPayout: Number(totalPayout.toFixed(2)),
            platformCommission: Number(totalCommission.toFixed(2)),
            licenseKey: licenseKeys.join(', '),
          });
          continue;
        }

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
          bundleId: null,
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

      let couponDiscount = 0;
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
          couponDiscount = coupon.type === 'percent'
            ? Number(((subtotal * coupon.value) / 100).toFixed(2))
            : Math.min(subtotal, coupon.value);
          appliedCoupon = coupon.code;
          db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
        }
      } else if (isPos && posDiscount && posDiscount > 0) {
        couponDiscount = Math.min(subtotal, Number(posDiscount));
      }

      // Loyalty Points Redemption
      let redeemedPoints = 0;
      let loyaltyDiscount = 0;
      if (!isPos && effectiveUser && Number(pointsToRedeem || 0) > 0) {
        const userRow = db.prepare('SELECT loyalty_points FROM users WHERE id = ?').get(effectiveUser.id) as
          | { loyalty_points: number }
          | undefined;
        const availablePts = userRow?.loyalty_points || 0;
        const remainingSubtotal = Math.max(0, subtotal - couponDiscount);
        const maxRedeemablePts = Math.floor(remainingSubtotal / LOYALTY_POINT_VALUE);
        redeemedPoints = Math.max(
          0,
          Math.min(Math.floor(Number(pointsToRedeem)), availablePts, maxRedeemablePts)
        );
        loyaltyDiscount = Number((redeemedPoints * LOYALTY_POINT_VALUE).toFixed(2));
      }

      const discountTotal = Number(Math.min(subtotal, couponDiscount + loyaltyDiscount).toFixed(2));
      const taxableAmount = Math.max(0, subtotal - discountTotal);
      const taxTotal = Number((taxableAmount * taxRate).toFixed(2));
      const shippingTotal = isPos ? 0 : (taxableAmount >= freeThreshold ? 0 : flatShipping);
      const total = Number((taxableAmount + taxTotal + shippingTotal).toFixed(2));
      const earnedPoints = effectiveUser && total > 0 ? Math.max(1, Math.round(total)) : 0;

      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM orders').get() as { cnt: number };
      const orderNumber = `OM-${10041 + countRow.cnt + Math.floor(Math.random() * 50)}`;

      const payMethod = paymentMethod || (isPos ? 'pos_card' : 'cod');
      const paymentStatus = payMethod === 'cod' ? 'pending' : 'paid';
      const orderStatus = isPos ? 'delivered' : 'pending';
      const expectedDeliveryDate = isPos
        ? addDaysIsoDate(0)
        : addDaysIsoDate(shippingTotal === 0 ? 2 : 4);
      const shippingCarrier = isPos
        ? 'In-Store Pickup'
        : (shippingTotal === 0 ? 'OmniExpress Priority Air' : 'OmniExpress Ground');
      const trackingCode = `TRK-${orderNumber}`;
      const resolvedCustomerName =
        (customerName || '').trim() || (isPos ? 'Walk-in POS Guest' : 'Guest Customer');

      const orderRes = db.prepare(`
        INSERT INTO orders (
          order_number, user_id, customer_name, customer_email, customer_phone,
          shipping_address, shipping_city, shipping_postal, payment_method,
          payment_status, order_status, subtotal, discount_total, tax_total,
          shipping_total, total, coupon_code, source,
          expected_delivery_date, shipping_carrier, tracking_code,
          points_earned, points_redeemed, loyalty_discount, order_notes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        orderNumber,
        effectiveUser?.id || null,
        resolvedCustomerName,
        (customerEmail || 'pos@omnimart.com').trim(),
        (customerPhone || '').trim(),
        (shippingAddress || 'In-Store Register #1').trim(),
        (shippingCity || 'San Francisco').trim(),
        (shippingPostal || '94105').trim(),
        payMethod,
        paymentStatus,
        orderStatus,
        Number(subtotal.toFixed(2)),
        discountTotal,
        taxTotal,
        shippingTotal,
        total,
        appliedCoupon,
        isPos ? 'pos' : 'storefront',
        expectedDeliveryDate,
        shippingCarrier,
        trackingCode,
        earnedPoints,
        redeemedPoints,
        loyaltyDiscount,
        cleanedNotes
      );

      const orderId = Number(orderRes.lastInsertRowid);
      const insertLine = db.prepare(`
        INSERT INTO order_items (
          order_id, product_id, bundle_id, vendor_id, title, sku, variant_label,
          quantity, unit_price, total_price, vendor_payout, platform_commission, license_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const li of lineItems) {
        insertLine.run(
          orderId, li.productId, li.bundleId, li.vendorId, li.title, li.sku, li.variantLabel,
          li.quantity, li.unitPrice, li.totalPrice, li.vendorPayout, li.platformCommission, li.licenseKey
        );
      }

      let updatedLoyaltyPoints: number | undefined;
      if (effectiveUser) {
        if (redeemedPoints > 0) {
          db.prepare('UPDATE users SET loyalty_points = MAX(0, loyalty_points - ?) WHERE id = ?').run(
            redeemedPoints,
            effectiveUser.id
          );
          db.prepare(
            `INSERT INTO loyalty_transactions (user_id, order_id, points_delta, type, description)
             VALUES (?, ?, ?, 'redeem', ?)`
          ).run(
            effectiveUser.id,
            orderId,
            -redeemedPoints,
            `Redeemed on order ${orderNumber} (-$${loyaltyDiscount.toFixed(2)})`
          );
        }
        if (earnedPoints > 0) {
          db.prepare('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?').run(
            earnedPoints,
            effectiveUser.id
          );
          db.prepare(
            `INSERT INTO loyalty_transactions (user_id, order_id, points_delta, type, description)
             VALUES (?, ?, ?, 'earn', ?)`
          ).run(effectiveUser.id, orderId, earnedPoints, `Earned from order ${orderNumber}`);
        }
        const refreshed = db.prepare('SELECT loyalty_points FROM users WHERE id = ?').get(effectiveUser.id) as {
          loyalty_points: number;
        };
        updatedLoyaltyPoints = refreshed.loyalty_points;
      }

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
      return {
        order,
        items: savedItems,
        pointsEarned: earnedPoints,
        pointsRedeemed: redeemedPoints,
        loyaltyDiscount,
        updatedLoyaltyPoints,
      };
    })();

    res.status(201).json(createdOrder);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to place order' });
  }
});

app.get('/api/orders/track/:orderNumber', (req: Request, res: Response) => {
  const order = findOrderForTracking(req.params.orderNumber);

  if (!order) {
    res.status(404).json({ error: 'Order ID or tracking number not found' });
    return;
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ order, items });
});

app.get('/api/orders/track/:orderNumber/stream', (req: Request, res: Response) => {
  const order = findOrderForTracking(req.params.orderNumber);
  if (!order) {
    res.status(404).json({ error: 'Order ID or tracking number not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let subs = trackingSubscribers.get(order.id);
  if (!subs) {
    subs = new Set<Response>();
    trackingSubscribers.set(order.id, subs);
  }
  subs.add(res);

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.write(`event: order_update\ndata: ${JSON.stringify({ order, items })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = trackingSubscribers.get(order.id);
    if (set) {
      set.delete(res);
      if (set.size === 0) trackingSubscribers.delete(order.id);
    }
  });
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
           w.created_at as saved_at, w.saved_price
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

function getUserNotificationsPayload(userId: number) {
  const notifications = db.prepare(`
    SELECT n.*, p.slug as product_slug, p.image_url as product_image_url, p.price as current_price
    FROM notifications n
    LEFT JOIN products p ON n.product_id = p.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 50
  `).all(userId) as Array<{ is_read: number }>;

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  return { notifications, unreadCount };
}

function dispatchWishlistPriceDropNotifications(
  productId: number,
  oldPrice: number,
  newPrice: number
): number {
  if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || newPrice <= 0 || newPrice >= oldPrice) {
    return 0;
  }
  const product = db.prepare('SELECT id, title FROM products WHERE id = ?').get(productId) as
    | { id: number; title: string }
    | undefined;
  if (!product) return 0;

  const watchers = db.prepare(`
    SELECT w.user_id, u.email, u.name
    FROM wishlist_items w
    JOIN users u ON u.id = w.user_id
    WHERE w.product_id = ?
  `).all(productId) as Array<{ user_id: number; email: string; name: string }>;

  if (watchers.length === 0) return 0;

  const pct = Math.max(1, Math.round(((oldPrice - newPrice) / oldPrice) * 100));
  const insertNotif = db.prepare(`
    INSERT INTO notifications (
      user_id, product_id, type, title, message, old_price, new_price, email_dispatched_to, is_read
    ) VALUES (?, ?, 'price_drop', ?, ?, ?, ?, ?, 0)
  `);

  for (const watcher of watchers) {
    insertNotif.run(
      watcher.user_id,
      product.id,
      `Price Drop: ${product.title}`,
      `${product.title} on your wishlist dropped from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)} (${pct}% off).`,
      Number(oldPrice.toFixed(2)),
      Number(newPrice.toFixed(2)),
      watcher.email
    );
  }
  return watchers.length;
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

  const product = db.prepare('SELECT id, price FROM products WHERE id = ?').get(pid) as
    | { id: number; price: number }
    | undefined;
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
    db.prepare('INSERT INTO wishlist_items (user_id, product_id, saved_price) VALUES (?, ?, ?)').run(
      req.user!.id,
      pid,
      product.price
    );
    saved = true;
  }

  res.json({ saved, ...getUserWishlistPayload(req.user!.id) });
});

app.delete('/api/wishlist/:productId', requireAuth(), (req: AuthedRequest, res: Response) => {
  const pid = Number(req.params.productId);
  db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?').run(req.user!.id, pid);
  res.json(getUserWishlistPayload(req.user!.id));
});

// Shareable public wishlist collection endpoints
app.get('/api/wishlist/share', requireAuth(), (req: AuthedRequest, res: Response) => {
  const share = db.prepare('SELECT * FROM wishlist_shares WHERE user_id = ?').get(req.user!.id) || null;
  res.json({ share });
});

app.post('/api/wishlist/share', requireAuth(), (req: AuthedRequest, res: Response) => {
  const { title, isPublic, regenerate } = req.body as {
    title?: string;
    isPublic?: boolean;
    regenerate?: boolean;
  };
  const existing = db.prepare('SELECT * FROM wishlist_shares WHERE user_id = ?').get(req.user!.id) as
    | { id: number; share_token: string; title: string; is_public: number }
    | undefined;

  const userRow = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user!.id) as
    | { name: string }
    | undefined;
  const firstName = (userRow?.name || 'Member').split(' ')[0];
  const defaultTitle = `${firstName}'s Curated Wishlist`;
  const nextTitle = (title !== undefined ? String(title) : existing?.title || defaultTitle).trim() || defaultTitle;
  const nextPublic = isPublic !== undefined ? (isPublic ? 1 : 0) : (existing ? existing.is_public : 1);

  const mintToken = () => `${slugify(firstName) || 'list'}-${crypto.randomBytes(4).toString('hex')}`;

  if (existing) {
    const nextToken = regenerate ? mintToken() : existing.share_token;
    db.prepare(`
      UPDATE wishlist_shares
      SET share_token = ?, title = ?, is_public = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextToken, nextTitle, nextPublic, existing.id);
  } else {
    db.prepare(`
      INSERT INTO wishlist_shares (user_id, share_token, title, is_public, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(req.user!.id, mintToken(), nextTitle, nextPublic);
  }

  const share = db.prepare('SELECT * FROM wishlist_shares WHERE user_id = ?').get(req.user!.id);
  res.json({ share });
});

app.get('/api/wishlist/public/:token', (req: Request, res: Response) => {
  const token = String(req.params.token || '').trim();
  const share = db.prepare(`
    SELECT ws.share_token, ws.title, ws.is_public, ws.updated_at, ws.user_id, u.name as owner_name
    FROM wishlist_shares ws
    JOIN users u ON u.id = ws.user_id
    WHERE ws.share_token = ? AND ws.is_public = 1
  `).get(token) as
    | {
        share_token: string;
        title: string;
        is_public: number;
        updated_at: string;
        user_id: number;
        owner_name: string;
      }
    | undefined;

  if (!share) {
    res.status(404).json({ error: 'Shared wishlist collection not found or is set to private.' });
    return;
  }

  const { items } = getUserWishlistPayload(share.user_id);
  res.json({
    collection: {
      share_token: share.share_token,
      title: share.title,
      owner_name: share.owner_name,
      updated_at: share.updated_at,
      item_count: items.length,
    },
    items,
  });
});

// Account Notification Inbox & Read State
app.get('/api/notifications', requireAuth(), (req: AuthedRequest, res: Response) => {
  res.json(getUserNotificationsPayload(req.user!.id));
});

app.patch('/api/notifications/:id/read', requireAuth(), (req: AuthedRequest, res: Response) => {
  const nid = Number(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(nid, req.user!.id);
  res.json(getUserNotificationsPayload(req.user!.id));
});

app.post('/api/notifications/read-all', requireAuth(), (req: AuthedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json(getUserNotificationsPayload(req.user!.id));
});

// ==========================================
// VENDOR DASHBOARD ROUTES
// ==========================================
const ALLOWED_ORDER_TAGS = ['Priority', 'Backorder', 'Gift'] as const;

function parseOrderTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(raw.filter((t): t is string => typeof t === 'string' && (ALLOWED_ORDER_TAGS as readonly string[]).includes(t)))
    );
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed.filter(
              (t): t is string => typeof t === 'string' && (ALLOWED_ORDER_TAGS as readonly string[]).includes(t)
            )
          )
        );
      }
    } catch {
      return [];
    }
  }
  return [];
}

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
    low_stock_threshold: number;
  } | undefined;
}

function getVendorLowStockProducts(vendorId: number, threshold: number) {
  return db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.vendor_id = ? AND p.product_type = 'physical' AND p.stock < ?
    ORDER BY p.stock ASC, p.id ASC
  `).all(vendorId, threshold);
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
    tags: parseOrderTags(o.tags),
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
  const threshold = Math.max(1, Number(vendor.low_stock_threshold ?? 20));
  const lowStockProducts = getVendorLowStockProducts(vendor.id, threshold);

  res.json({
    vendor,
    products,
    orders: enrichedOrders,
    payouts,
    categories,
    dailySales: dailySalesRaw,
    topProducts,
    lowStockProducts,
  });
});

app.patch('/api/vendor/inventory-threshold', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  let vendor = getVendorForUser(req.user!.id);
  if (!vendor && req.user!.role === 'admin') {
    vendor = db.prepare('SELECT * FROM vendors ORDER BY id ASC LIMIT 1').get() as typeof vendor;
  }
  if (!vendor) {
    res.status(404).json({ error: 'Vendor profile not found' });
    return;
  }
  const raw = Number((req.body as { threshold?: number })?.threshold);
  if (!Number.isFinite(raw) || raw < 1 || raw > 1000) {
    res.status(400).json({ error: 'Threshold must be an integer between 1 and 1000' });
    return;
  }
  const threshold = Math.round(raw);
  db.prepare('UPDATE vendors SET low_stock_threshold = ? WHERE id = ?').run(threshold, vendor.id);
  const updatedVendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendor.id);
  const lowStockProducts = getVendorLowStockProducts(vendor.id, threshold);
  res.json({ threshold, vendor: updatedVendor, lowStockProducts });
});

app.put('/api/vendor/profile', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  let vendor = getVendorForUser(req.user!.id);
  if (!vendor && req.user!.role === 'admin') {
    vendor = db.prepare('SELECT * FROM vendors ORDER BY id ASC LIMIT 1').get() as typeof vendor;
  }
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
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId) as
    | { vendor_id: number; price: number; compare_at_price: number | null }
    | undefined;
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
  const nextPrice = body.price !== undefined ? Number(body.price) : null;
  const nextCompareAtPrice =
    'compare_at_price' in body
      ? body.compare_at_price
        ? Number(body.compare_at_price)
        : null
      : existing.compare_at_price;
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
    nextPrice,
    nextCompareAtPrice,
    body.stock !== undefined ? Number(body.stock) : null,
    body.image_url ? String(body.image_url) : null,
    body.short_description !== undefined ? String(body.short_description) : null,
    body.description !== undefined ? String(body.description) : null,
    body.attributes_json ? String(body.attributes_json) : null,
    body.status ? String(body.status) : null,
    prodId
  );

  let priceDropAlertsSent = 0;
  if (nextPrice !== null && nextPrice < existing.price) {
    priceDropAlertsSent = dispatchWishlistPriceDropNotifications(prodId, existing.price, nextPrice);
  }

  res.json({
    product: db.prepare('SELECT * FROM products WHERE id = ?').get(prodId),
    priceDropAlertsSent,
  });
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
  const { order_status, expected_delivery_date } = req.body as {
    order_status?: string;
    expected_delivery_date?: string;
  };
  if (!order_status) {
    res.status(400).json({ error: 'order_status is required' });
    return;
  }
  const orderId = Number(req.params.orderId);
  db.prepare(`
    UPDATE orders SET
      order_status = ?,
      expected_delivery_date = COALESCE(?, expected_delivery_date),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(order_status, expected_delivery_date || null, orderId);
  emitOrderTrackingUpdate(orderId);
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) });
});

app.post('/api/vendor/payouts', requireAuth(['vendor', 'admin']), (req: AuthedRequest, res: Response) => {
  let vendor = getVendorForUser(req.user!.id);
  if (!vendor && req.user!.role === 'admin') {
    vendor = db.prepare('SELECT * FROM vendors ORDER BY id ASC LIMIT 1').get() as typeof vendor;
  }
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
  const existing = db.prepare('SELECT id, price, compare_at_price FROM products WHERE id = ?').get(id) as
    | { id: number; price: number; compare_at_price: number | null }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const nextPrice = body.price !== undefined ? Number(body.price) : null;
  const nextCompareAtPrice =
    'compare_at_price' in body
      ? body.compare_at_price
        ? Number(body.compare_at_price)
        : null
      : existing.compare_at_price;
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
    nextPrice,
    nextCompareAtPrice,
    body.stock !== undefined ? Number(body.stock) : null,
    body.image_url ? String(body.image_url) : null,
    body.short_description !== undefined ? String(body.short_description) : null,
    body.description !== undefined ? String(body.description) : null,
    body.attributes_json ? String(body.attributes_json) : null,
    body.is_featured !== undefined ? (body.is_featured ? 1 : 0) : null,
    body.status ? String(body.status) : null,
    id
  );

  let priceDropAlertsSent = 0;
  if (nextPrice !== null && nextPrice < existing.price) {
    priceDropAlertsSent = dispatchWishlistPriceDropNotifications(id, existing.price, nextPrice);
  }

  res.json({
    product: db.prepare('SELECT * FROM products WHERE id = ?').get(id),
    priceDropAlertsSent,
  });
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
    tags: parseOrderTags(o.tags),
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
  }));
  res.json({ orders: enriched });
});

app.patch('/api/admin/orders/:id/status', requireAuth(['admin']), (req: Request, res: Response) => {
  const { order_status, payment_status, expected_delivery_date } = req.body as {
    order_status?: string;
    payment_status?: string;
    expected_delivery_date?: string;
  };
  const id = Number(req.params.id);
  db.prepare(`
    UPDATE orders SET
      order_status = COALESCE(?, order_status),
      payment_status = COALESCE(?, payment_status),
      expected_delivery_date = COALESCE(?, expected_delivery_date),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(order_status || null, payment_status || null, expected_delivery_date || null, id);
  emitOrderTrackingUpdate(id);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  res.json({ order: updated ? { ...updated, tags: parseOrderTags(updated.tags) } : null });
});

app.patch('/api/admin/orders/:id/tags', requireAuth(['admin']), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const { tags } = req.body as { tags?: unknown };
  if (!Array.isArray(tags)) {
    res.status(400).json({ error: 'tags must be an array of order tags' });
    return;
  }
  const validTags = parseOrderTags(tags);
  db.prepare(`UPDATE orders SET tags = ?, updated_at = datetime('now') WHERE id = ?`).run(
    JSON.stringify(validTags),
    id
  );
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown>;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  res.json({ order: { ...updated, tags: validTags, items } });
});

app.get('/api/admin/orders/export/csv', requireAuth(['admin']), (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all() as Array<Record<string, unknown>>;
  const header = 'order_number,customer_name,customer_email,payment_method,payment_status,order_status,tags,total,source,created_at';
  const lines = rows.map((r) =>
    [
      r.order_number,
      r.customer_name,
      r.customer_email,
      r.payment_method,
      r.payment_status,
      r.order_status,
      parseOrderTags(r.tags).join('; '),
      r.total,
      r.source,
      r.created_at,
    ]
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
// LOYALTY POINTS ROUTES
// ==========================================
app.get('/api/loyalty', requireAuth(), (req: AuthedRequest, res: Response) => {
  const userRow = db.prepare('SELECT loyalty_points FROM users WHERE id = ?').get(req.user!.id) as
    | { loyalty_points: number }
    | undefined;

  const transactions = db.prepare(`
    SELECT lt.*, o.order_number
    FROM loyalty_transactions lt
    LEFT JOIN orders o ON lt.order_id = o.id
    WHERE lt.user_id = ?
    ORDER BY lt.created_at DESC, lt.id DESC
  `).all(req.user!.id);

  res.json({
    balance: userRow?.loyalty_points || 0,
    dollarValuePerPoint: LOYALTY_POINT_VALUE,
    earnRatePerDollar: 1,
    transactions,
  });
});

// ==========================================
// GEMINI INTERACTIONS API: PHOTO TO VIDEO
// ==========================================
app.post('/api/ai/animate-video', async (req: Request, res: Response) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({
      error: 'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
    });
    return;
  }

  const { imageBase64, mimeType, prompt, aspectRatio, duration } = req.body as {
    imageBase64?: string;
    mimeType?: string;
    prompt?: string;
    aspectRatio?: string;
    duration?: string;
  };

  if (!imageBase64 || !imageBase64.trim()) {
    res.status(400).json({ error: 'Please upload or select an image to animate.' });
    return;
  }

  const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64.trim();
  const cleanMimeType = mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
  const validAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';
  const validDuration = duration === '10s' ? '10s' : '5s';
  const motionPrompt =
    prompt?.trim() ||
    'Smooth cinematic studio product showcase camera orbit with soft rim lighting and subtle ambient motion.';

  try {
    const interaction = await ai.interactions.create(
      {
        model: 'gemini-omni-1.2-flash',
        input: [
          {
            type: 'image',
            mime_type: cleanMimeType,
            data: cleanBase64,
          },
          {
            type: 'text',
            text: motionPrompt,
          },
        ],
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: validAspectRatio,
          duration: validDuration,
        },
      },
      { timeout: 300000 }
    );

    const videoPart = interaction.output_video;
    if (videoPart?.data) {
      res.json({
        videoBase64: videoPart.data,
        mimeType: videoPart.mime_type || 'video/mp4',
        aspectRatio: validAspectRatio,
      });
      return;
    }

    if (videoPart?.uri) {
      res.json({
        videoUri: videoPart.uri,
        mimeType: videoPart.mime_type || 'video/mp4',
        aspectRatio: validAspectRatio,
      });
      return;
    }

    res.status(502).json({ error: 'The model did not return a video payload.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status;
    if (status === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
      res.status(429).json({
        error:
          'gemini-omni-1.2-flash requires a billing-enabled (paid tier) API key or exceeded quota. Please select a billing-enabled key in Settings > Secrets.',
      });
      return;
    }
    if (status === 403 || status === 400 || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
      res.status(403).json({
        error: 'Gemini API key permission denied or invalid. Check GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }
    res.status(500).json({ error: msg || 'Video generation failed' });
  }
});

// ==========================================
// VITE / STATIC SERVING + LIVE VOICE WS
// ==========================================
async function startServer() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/api/live-voice' });

  wss.on('connection', async (clientWs) => {
    const ai = getGeminiClient('v1beta');
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          message: 'GEMINI_API_KEY is not configured. Add your key in Settings > Secrets.',
        })
      );
      clientWs.close();
      return;
    }

    const catalogRows = db.prepare(`
      SELECT p.title, p.price, p.stock, p.product_type, c.name as category_name, v.shop_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN vendors v ON p.vendor_id = v.id
      WHERE p.status = 'published'
      ORDER BY p.is_featured DESC, p.id ASC
      LIMIT 12
    `).all() as Array<{
      title: string;
      price: number;
      stock: number;
      product_type: string;
      category_name: string;
      shop_name: string;
    }>;

    const catalogSummary = catalogRows
      .map(
        (r) =>
          `${r.title} ($${r.price}, ${r.category_name}, sold by ${r.shop_name}, ${
            r.product_type === 'physical' ? `${r.stock} in stock` : 'instant digital license'
          })`
      )
      .join('; ');

    let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let setupDone = false;
    const queuedMessages: Array<{ type?: string; data?: string; text?: string }> = [];

    const dispatchToSession = (msg: { type?: string; data?: string; text?: string }) => {
      if (!session) return;
      if (msg.type === 'audio' && msg.data) {
        session.sendRealtimeInput({
          audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
        });
      } else if (msg.type === 'text' && msg.text) {
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: msg.text }] }],
          turnComplete: true,
        });
      }
    };

    try {
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            `You are OmniMart's helpful, concise real-time voice shopping concierge. Help shoppers compare products, check shipping policies (free express shipping over $150, Cash on Delivery available), and understand OmniMart Rewards (earn 1 point per $1 spent, redeem 100 points for $5 off). Current catalog: ${catalogSummary}. Keep spoken replies natural and concise.`,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;

            if (message.setupComplete && !setupDone) {
              setupDone = true;
              clientWs.send(JSON.stringify({ type: 'ready' }));
              while (queuedMessages.length > 0) {
                const next = queuedMessages.shift();
                if (next) dispatchToSession(next);
              }
            }

            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
              }
            }
            const inText = message.serverContent?.inputTranscription?.text;
            if (inText) {
              clientWs.send(JSON.stringify({ type: 'input_transcript', text: inText }));
            }
            const outText = message.serverContent?.outputTranscription?.text;
            if (outText) {
              clientWs.send(JSON.stringify({ type: 'output_transcript', text: outText }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (message.serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turn_complete' }));
            }
          },
          onerror: (err) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'error',
                  message: err?.message || 'Live voice session encountered an error.',
                })
              );
            }
          },
          onclose: (ev) => {
            if (clientWs.readyState === clientWs.OPEN) {
              if (ev?.reason) {
                clientWs.send(JSON.stringify({ type: 'error', message: ev.reason }));
              }
              clientWs.send(JSON.stringify({ type: 'closed' }));
            }
          },
        },
      });
    } catch (err) {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'Unable to connect to Gemini Live API.',
          })
        );
      }
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; data?: string; text?: string };
        if (!setupDone || !session) {
          queuedMessages.push(msg);
          return;
        }
        dispatchToSession(msg);
      } catch {
        // ignore malformed frames
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch {
        // ignore close errors
      }
    });
  });

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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`OmniMart server listening on http://localhost:${PORT}`);
  });
}

startServer();
