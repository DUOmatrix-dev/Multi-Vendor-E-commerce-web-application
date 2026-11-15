import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  AppWorkspace,
  CartItem,
  Category,
  CmsPage,
  CurrencyCode,
  HomepageSection,
  MenuItem,
  Product,
  User,
  Vendor,
} from './types';
import { apiRequest, setStoredToken } from './lib/api';
import { TopBar } from './components/TopBar';
import { StorefrontView } from './components/StorefrontView';
import { AdminDashboard } from './components/AdminDashboard';
import { VendorDashboard } from './components/VendorDashboard';
import { PosTerminal } from './components/PosTerminal';
import { CartDrawer } from './components/CartDrawer';
import { AuthModal } from './components/AuthModal';

interface BootstrapResponse {
  categories: Category[];
  products: Product[];
  menuItems: MenuItem[];
  sections: HomepageSection[];
  cmsPages: CmsPage[];
  vendors: Vendor[];
  settings: Record<string, string>;
}

export default function App() {
  const [workspace, setWorkspace] = useState<AppWorkspace>('storefront');
  const [route, setRoute] = useState<string>('catalog');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');

  const [user, setUser] = useState<User | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [cmsPages, setCmsPages] = useState<CmsPage[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchSelectedProduct, setSearchSelectedProduct] = useState<Product | null>(null);
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);
  const [wishlistItems, setWishlistItems] = useState<Product[]>([]);

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await apiRequest<BootstrapResponse>('/api/storefront/bootstrap');
      setCategories(data.categories);
      setProducts(data.products);
      setMenuItems(data.menuItems);
      setSections(data.sections);
      setCmsPages(data.cmsPages);
      setSettings(data.settings);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const me = await apiRequest<{ user: User | null; vendor: Vendor | null }>('/api/auth/me');
      setUser(me.user);
      setVendor(me.vendor);
    } catch {
      setUser(null);
      setVendor(null);
    }
  }, []);

  const loadWishlist = useCallback(async () => {
    try {
      const res = await apiRequest<{ wishlistIds: number[]; items: Product[] }>('/api/wishlist');
      setWishlistIds(res.wishlistIds);
      setWishlistItems(res.items);
    } catch {
      setWishlistIds([]);
      setWishlistItems([]);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
    loadSession();
  }, [loadBootstrap, loadSession]);

  useEffect(() => {
    if (user) {
      loadWishlist();
    } else {
      setWishlistIds([]);
      setWishlistItems([]);
    }
  }, [user, loadWishlist]);

  const handleSelectWorkspace = async (target: AppWorkspace) => {
    if (target === 'admin' && user?.role !== 'admin') {
      // Auto-authenticate demo admin session when switching to Admin Console directly, or open AuthModal on failure
      try {
        const res = await apiRequest<{ token: string; user: User; vendor: Vendor | null }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: 'admin@omnimart.com', password: 'admin123' }),
        });
        setStoredToken(res.token);
        setUser(res.user);
        setVendor(res.vendor);
      } catch {
        setAuthOpen(true);
        return;
      }
    }

    if (target === 'vendor' && user?.role !== 'vendor' && user?.role !== 'admin') {
      try {
        const res = await apiRequest<{ token: string; user: User; vendor: Vendor | null }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: 'vendor@omnimart.com', password: 'vendor123' }),
        });
        setStoredToken(res.token);
        setUser(res.user);
        setVendor(res.vendor);
      } catch {
        setAuthOpen(true);
        return;
      }
    }

    setWorkspace(target);
  };

  const handleAddToCart = (
    product: Product,
    variantLabel: string,
    unitPrice: number,
    quantity: number
  ) => {
    const key = `${product.id}:${variantLabel}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [...prev, { key, product, variantLabel, unitPrice, quantity }];
    });
    setCartOpen(true);
  };

  const handleReorderItems = (
    reorderList: Array<{ product: Product; variantLabel: string; unitPrice: number; quantity: number }>
  ) => {
    setCart((prev) => {
      const next = [...prev];
      for (const entry of reorderList) {
        const key = `${entry.product.id}:${entry.variantLabel}`;
        const existingIdx = next.findIndex((i) => i.key === key);
        if (existingIdx >= 0) {
          next[existingIdx] = {
            ...next[existingIdx],
            quantity: next[existingIdx].quantity + entry.quantity,
          };
        } else {
          next.push({
            key,
            product: entry.product,
            variantLabel: entry.variantLabel,
            unitPrice: entry.unitPrice,
            quantity: entry.quantity,
          });
        }
      }
      return next;
    });
    setCartOpen(true);
  };

  const handleUpdateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const handleToggleWishlist = async (productId: number) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    try {
      const res = await apiRequest<{ saved: boolean; wishlistIds: number[]; items: Product[] }>(
        '/api/wishlist/toggle',
        {
          method: 'POST',
          body: JSON.stringify({ productId }),
        }
      );
      setWishlistIds(res.wishlistIds);
      setWishlistItems(res.items);
    } catch {
      // ignore transient wishlist errors
    }
  };

  const handleRemoveWishlist = async (productId: number) => {
    if (!user) return;
    try {
      const res = await apiRequest<{ wishlistIds: number[]; items: Product[] }>(
        `/api/wishlist/${productId}`,
        { method: 'DELETE' }
      );
      setWishlistIds(res.wishlistIds);
      setWishlistItems(res.items);
    } catch {
      // ignore transient wishlist errors
    }
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setStoredToken(null);
    setUser(null);
    setVendor(null);
    setWishlistIds([]);
    setWishlistItems([]);
    setWorkspace('storefront');
  };

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const taxRate = Number(settings.tax_rate || 8);
  const freeShippingThreshold = Number(settings.free_shipping_threshold || 150);
  const flatShippingRate = Number(settings.shipping_flat_rate || 15);
  const showAnnouncement =
    workspace === 'storefront' &&
    !announcementDismissed &&
    settings.announcement_enabled === '1' &&
    Boolean(settings.announcement_text);

  void vendor;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] text-slate-900">
      {showAnnouncement && (
        <div className="bg-slate-900 text-slate-100 text-xs px-4 h-9 flex items-center justify-between">
          <div className="flex-1 text-center truncate px-4">
            {settings.announcement_text}
          </div>
          <button
            type="button"
            onClick={() => setAnnouncementDismissed(true)}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Dismiss announcement"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <TopBar
        storeName={settings.store_name || 'OmniMart'}
        menuItems={menuItems}
        products={products}
        currency={currency}
        cartCount={cartCount}
        wishlistCount={wishlistIds.length}
        user={user}
        workspace={workspace}
        onSelectWorkspace={handleSelectWorkspace}
        onNavigateRoute={(r) => setRoute(r)}
        onSelectSearchProduct={(prod) => {
          setWorkspace('storefront');
          setRoute('catalog');
          setSearchSelectedProduct(prod);
        }}
        onSearchCatalog={(q) => {
          setGlobalSearchQuery(q);
          if (q) {
            setWorkspace('storefront');
            setRoute('catalog');
          }
        }}
        onOpenCart={() => setCartOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
        onLogout={handleLogout}
      />

      {/* Slim Workspace Quick-Route Strip on Storefront so Admin / Vendor / POS / Builders are immediately discoverable */}
      {workspace === 'storefront' && (
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-[1440px] mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-slate-500">
              Platform Workspaces · Switch live between Storefront, Admin Console, Vendor Portal, and POS
            </div>
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => handleSelectWorkspace('storefront')}
                className="px-3 py-1 rounded-md font-medium bg-white text-slate-900 shadow-sm whitespace-nowrap"
              >
                Storefront
              </button>
              <button
                type="button"
                onClick={() => handleSelectWorkspace('admin')}
                className="px-3 py-1 rounded-md font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Admin & Drag-Drop Builders
              </button>
              <button
                type="button"
                onClick={() => handleSelectWorkspace('vendor')}
                className="px-3 py-1 rounded-md font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Vendor Dashboard
              </button>
              <button
                type="button"
                onClick={() => handleSelectWorkspace('pos')}
                className="px-3 py-1 rounded-md font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                POS Register
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1">
        {loading ? (
          <div className="max-w-[1280px] mx-auto px-6 py-12 space-y-6">
            <div className="h-[360px] bg-white border border-slate-200 rounded-2xl animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : workspace === 'storefront' ? (
          <StorefrontView
            products={products}
            categories={categories}
            sections={sections}
            cmsPages={cmsPages}
            currency={currency}
            user={user}
            activeRoute={route}
            externalSearchQuery={globalSearchQuery}
            externalSelectedProduct={searchSelectedProduct}
            wishlistIds={wishlistIds}
            wishlistItems={wishlistItems}
            onClearExternalProduct={() => setSearchSelectedProduct(null)}
            onNavigateRoute={setRoute}
            onAddToCart={handleAddToCart}
            onReorderItems={handleReorderItems}
            onToggleWishlist={handleToggleWishlist}
            onRemoveWishlist={handleRemoveWishlist}
            onOpenAuth={() => setAuthOpen(true)}
            onCurrencyChange={setCurrency}
          />
        ) : workspace === 'admin' ? (
          <AdminDashboard
            currency={currency}
            onDataMutated={loadBootstrap}
            onBackToStorefront={() => setWorkspace('storefront')}
          />
        ) : workspace === 'vendor' ? (
          <VendorDashboard
            currency={currency}
            onDataMutated={loadBootstrap}
            onBackToStorefront={() => setWorkspace('storefront')}
          />
        ) : (
          <PosTerminal
            products={products}
            categories={categories}
            currency={currency}
            taxRatePercent={taxRate}
            onOrderComplete={loadBootstrap}
            onBackToStorefront={() => setWorkspace('storefront')}
          />
        )}
      </div>

      {workspace === 'storefront' && (
        <footer className="bg-white border-t border-slate-200 mt-auto">
          <div className="max-w-[1280px] mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-6 text-sm text-slate-600">
            <div className="space-y-1">
              <div className="font-bold text-slate-900 font-display">{settings.store_name || 'OmniMart'}</div>
              <div className="text-xs text-slate-500">
                © {new Date().getFullYear()} {settings.store_name || 'OmniMart'}. Multi-vendor commerce platform.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs font-medium">
              {cmsPages.map((pg) => (
                <button
                  key={pg.id}
                  type="button"
                  onClick={() => setRoute(`cms:${pg.slug}`)}
                  className="hover:text-slate-900"
                >
                  {pg.title}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRoute('orders')}
                className="hover:text-slate-900"
              >
                My Orders
              </button>
              <button
                type="button"
                onClick={() => setRoute('wishlist')}
                className="hover:text-slate-900"
              >
                Wishlist
              </button>
              <button
                type="button"
                onClick={() => setRoute('track')}
                className="hover:text-slate-900"
              >
                Track Order
              </button>
              <span className="text-slate-400">{settings.support_email || 'support@omnimart.com'}</span>
            </div>
          </div>
        </footer>
      )}

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        currency={currency}
        taxRatePercent={taxRate}
        freeShippingThreshold={freeShippingThreshold}
        flatShippingRate={flatShippingRate}
        user={user}
        onUpdateQty={handleUpdateQty}
        onClearCart={() => setCart([])}
        onOrderSuccess={loadBootstrap}
      />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(u, v) => {
          setUser(u);
          setVendor(v);
          if (u.role === 'admin') setWorkspace('admin');
          else if (u.role === 'vendor') setWorkspace('vendor');
        }}
      />
    </div>
  );
}
