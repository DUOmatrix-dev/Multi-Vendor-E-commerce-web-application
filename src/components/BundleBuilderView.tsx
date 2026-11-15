import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Minus, Trash2, Check, ShoppingBag, Eye, EyeOff } from 'lucide-react';
import { CurrencyCode, Product, ProductBundle, User, Vendor } from '../types';
import { apiRequest, setStoredToken } from '../lib/api';
import { formatMoney } from '../lib/currency';
import { ResilientImage } from './ResilientImage';

interface BundleBuilderViewProps {
  products: Product[];
  bundles: ProductBundle[];
  currency: CurrencyCode;
  user: User | null;
  vendorIdScope?: number;
  embeddedInPortal?: boolean;
  onAddBundleToCart?: (bundle: ProductBundle, quantity?: number) => void;
  onDataMutated: () => void;
  onAuthSuccess?: (user: User, vendor: Vendor | null) => void;
  onOpenAuth?: () => void;
  onBackToShop?: () => void;
}

export const BundleBuilderView: React.FC<BundleBuilderViewProps> = ({
  products,
  bundles,
  currency,
  user,
  vendorIdScope,
  embeddedInPortal = false,
  onAddBundleToCart,
  onDataMutated,
  onAuthSuccess,
  onOpenAuth,
  onBackToShop,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(15);
  const [selectedQtyMap, setSelectedQtyMap] = useState<Record<number, number>>({});
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);
  const [managedBundles, setManagedBundles] = useState<ProductBundle[]>([]);
  const [selectedAdminVendorId, setSelectedAdminVendorId] = useState<number | null>(null);

  const isVendorOrAdmin = user?.role === 'vendor' || user?.role === 'admin';

  // Derive distinct vendors from published products for Admin multi-vendor selection
  const availableVendors = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of products) {
      if (p.vendor_id && p.vendor_name) {
        map.set(p.vendor_id, p.vendor_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const loadManagedBundles = useCallback(async () => {
    if (!isVendorOrAdmin) {
      setManagedBundles([]);
      return;
    }
    try {
      const res = await apiRequest<{ bundles: ProductBundle[] }>('/api/bundles?mine=1');
      setManagedBundles(res.bundles || []);
    } catch {
      setManagedBundles([]);
    }
  }, [isVendorOrAdmin]);

  useEffect(() => {
    loadManagedBundles();
  }, [loadManagedBundles, bundles]);

  // Determine which vendor's products can be grouped together in the builder
  const activeVendorId = useMemo(() => {
    if (vendorIdScope) return vendorIdScope;
    if (user?.role === 'vendor') {
      // Match vendor products via vendor_id from existing managed bundles or first matching vendor
      // Fallback: vendor endpoint resolves exact vendor on server; if products are filtered, infer from vendor's shop
      if (managedBundles[0]?.vendor_id) return managedBundles[0].vendor_id;
    }
    if (selectedAdminVendorId) return selectedAdminVendorId;
    return availableVendors[0]?.id || products[0]?.vendor_id || 1;
  }, [vendorIdScope, user?.role, managedBundles, selectedAdminVendorId, availableVendors, products]);

  // Note: when signed in as a vendor whose products are in `products` (all published products), fetch their vendor record so we only show their own products
  const [authedVendorId, setAuthedVendorId] = useState<number | null>(vendorIdScope ?? null);

  useEffect(() => {
    if (vendorIdScope) {
      setAuthedVendorId(vendorIdScope);
      return;
    }
    if (user?.role === 'vendor') {
      apiRequest<{ user: User | null; vendor: Vendor | null }>('/api/auth/me')
        .then((res) => {
          if (res.vendor?.id) setAuthedVendorId(res.vendor.id);
        })
        .catch(() => {
          // ignore
        });
    } else {
      setAuthedVendorId(null);
    }
  }, [user?.id, user?.role, vendorIdScope]);

  const builderVendorId = user?.role === 'vendor' ? (authedVendorId || activeVendorId) : activeVendorId;

  const vendorProducts = useMemo(() => {
    return products.filter((p) => p.status === 'published' && p.vendor_id === builderVendorId);
  }, [products, builderVendorId]);

  const selectedItems = useMemo(() => {
    return vendorProducts
      .filter((p) => (selectedQtyMap[p.id] || 0) > 0)
      .map((p) => ({
        product: p,
        quantity: selectedQtyMap[p.id],
      }));
  }, [vendorProducts, selectedQtyMap]);

  const regularTotal = useMemo(
    () => selectedItems.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0),
    [selectedItems]
  );

  const clampedDiscount = Math.min(75, Math.max(1, Number(discountPercent || 0)));
  const bundlePrice = Number((regularTotal * (1 - clampedDiscount / 100)).toFixed(2));
  const savingsAmount = Number((regularTotal - bundlePrice).toFixed(2));

  useEffect(() => {
    if (selectedItems.length > 0 && !selectedItems.some((i) => i.product.image_url === coverImageUrl)) {
      setCoverImageUrl(selectedItems[0].product.image_url);
    } else if (selectedItems.length === 0) {
      setCoverImageUrl('');
    }
  }, [selectedItems, coverImageUrl]);

  const toggleProductSelection = (productId: number) => {
    setSelectedQtyMap((prev) => {
      const next = { ...prev };
      if (next[productId]) {
        delete next[productId];
      } else {
        next[productId] = 1;
      }
      return next;
    });
  };

  const adjustProductQty = (productId: number, delta: number) => {
    setSelectedQtyMap((prev) => {
      const current = prev[productId] || 0;
      const updated = current + delta;
      const next = { ...prev };
      if (updated <= 0) {
        delete next[productId];
      } else {
        next[productId] = Math.min(10, updated);
      }
      return next;
    });
  };

  const handleQuickVendorLogin = async (email: string) => {
    setDemoLoading(true);
    setFormError('');
    try {
      const res = await apiRequest<{ token: string; user: User; vendor: Vendor | null }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'vendor123' }),
      });
      setStoredToken(res.token);
      if (res.vendor?.id) setAuthedVendorId(res.vendor.id);
      onAuthSuccess?.(res.user, res.vendor);
      setSelectedQtyMap({});
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to switch to vendor account');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleCreateBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!title.trim()) {
      setFormError('Please enter a bundle title.');
      return;
    }
    if (selectedItems.length < 2) {
      setFormError('Select at least 2 complementary products from the shop catalog.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/bundles', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          discountPercent: clampedDiscount,
          imageUrl: coverImageUrl || selectedItems[0].product.image_url,
          vendorId: builderVendorId,
          items: selectedItems.map((it) => ({
            productId: it.product.id,
            quantity: it.quantity,
          })),
        }),
      });
      setTitle('');
      setDescription('');
      setDiscountPercent(15);
      setSelectedQtyMap({});
      setCoverImageUrl('');
      setFormSuccess('Bundle published to the storefront catalog as a unified unit.');
      await loadManagedBundles();
      onDataMutated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to publish bundle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBundleActive = async (bundle: ProductBundle) => {
    setFormError('');
    try {
      await apiRequest(`/api/bundles/${bundle.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: bundle.is_active ? 0 : 1 }),
      });
      await loadManagedBundles();
      onDataMutated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to update bundle visibility');
    }
  };

  const handleDeleteBundle = async (bundleId: number) => {
    setFormError('');
    try {
      await apiRequest(`/api/bundles/${bundleId}`, { method: 'DELETE' });
      await loadManagedBundles();
      onDataMutated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to delete bundle');
    }
  };

  const storefrontMergedBundles = useMemo(() => {
    const byId = new Map<number, ProductBundle>();
    for (const b of bundles) byId.set(b.id, b);
    for (const mb of managedBundles) byId.set(mb.id, mb);
    return Array.from(byId.values()).sort((a, b) => b.id - a.id);
  }, [bundles, managedBundles]);

  // Show either vendor's own bundles (when in portal or managing) merged cleanly, or all active storefront bundles
  const displayedBundles = embeddedInPortal ? managedBundles : storefrontMergedBundles;

  return (
    <div className={embeddedInPortal ? 'space-y-6' : 'max-w-[1280px] mx-auto px-6 py-10 space-y-8'}>
      {!embeddedInPortal && (
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Vendor Bundle Builder</h1>
            <p className="text-sm text-slate-500 mt-1">
              Group complementary products into a single discounted kit displayed as one unified unit in the catalog and shopping bag.
            </p>
          </div>
          {onBackToShop && (
            <button
              type="button"
              onClick={onBackToShop}
              className="text-sm font-medium text-blue-600 hover:underline whitespace-nowrap"
            >
              Back to Shop
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Vendor Bundle Studio */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900">Create Product Bundle</h2>
            </div>
            {isVendorOrAdmin && (
              <span className="text-xs text-slate-500 font-medium">
                {user?.role === 'vendor'
                  ? vendorProducts[0]?.vendor_name || user.name
                  : availableVendors.find((v) => v.id === builderVendorId)?.name || 'Shop Catalog'}
              </span>
            )}
          </div>

          {!isVendorOrAdmin ? (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900">
                  Vendor sign-in required to publish bundles
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Only verified vendors (or platform admins) can group their catalog products into discounted bundles. Sign in instantly with a demo studio account below to test creating a bundle.
                </p>
              </div>
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg">
                  {formError}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={demoLoading}
                  onClick={() => handleQuickVendorLogin('vendor@omnimart.com')}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {demoLoading ? 'Signing in...' : 'Demo Vendor: Aether Audio'}
                </button>
                <button
                  type="button"
                  disabled={demoLoading}
                  onClick={() => handleQuickVendorLogin('atelier@omnimart.com')}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  Demo Vendor: Nordic Atelier
                </button>
                {onOpenAuth && (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="px-3 py-2 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                  >
                    Other Account
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateBundle} className="space-y-5">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-lg">
                  {formSuccess}
                </div>
              )}

              {user?.role === 'admin' && !vendorIdScope && availableVendors.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Vendor Shop
                  </label>
                  <select
                    value={builderVendorId}
                    onChange={(e) => {
                      setSelectedAdminVendorId(Number(e.target.value));
                      setSelectedQtyMap({});
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {availableVendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Bundle Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Studio Listening & Typing Kit"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Bundle Description
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Explain how these products complement each other..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Complementary Product Picker */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    1. Select 2+ Complementary Products
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {selectedItems.length} selected
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {vendorProducts.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">
                      No published products available for this shop yet.
                    </div>
                  ) : (
                    vendorProducts.map((prod) => {
                      const qty = selectedQtyMap[prod.id] || 0;
                      const isSelected = qty > 0;
                      return (
                        <div
                          key={prod.id}
                          className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                            isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleProductSelection(prod.id)}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </span>
                            <div className="w-11 h-9 rounded bg-slate-100 overflow-hidden shrink-0">
                              <ResilientImage
                                src={prod.image_url}
                                alt={prod.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {prod.title}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                {formatMoney(prod.price, currency)} ·{' '}
                                {prod.product_type === 'physical' ? `${prod.stock} in stock` : 'Digital'}
                              </div>
                            </div>
                          </button>

                          {isSelected && (
                            <div className="flex items-center gap-1 border border-slate-200 bg-white rounded-md shrink-0">
                              <button
                                type="button"
                                onClick={() => adjustProductQty(prod.id, -1)}
                                className="p-1 text-slate-600 hover:text-slate-900"
                                aria-label={`Decrease quantity for ${prod.title}`}
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-6 text-center text-xs font-mono tabular-nums">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => adjustProductQty(prod.id, 1)}
                                className="p-1 text-slate-600 hover:text-slate-900"
                                aria-label={`Increase quantity for ${prod.title}`}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Combined Discount & Lead Image */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    Combined Bundle Discount (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={75}
                      step={1}
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Number(e.target.value))}
                      className="w-20 px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                    />
                    <div className="flex gap-1">
                      {[10, 15, 20, 25].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setDiscountPercent(pct)}
                          className={`px-2 py-1 text-[11px] font-mono rounded border whitespace-nowrap ${
                            discountPercent === pct
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedItems.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-600">
                      Bundle Lead Image
                    </label>
                    <div className="flex items-center gap-2">
                      {selectedItems.map((it) => (
                        <button
                          key={it.product.id}
                          type="button"
                          onClick={() => setCoverImageUrl(it.product.image_url)}
                          className={`w-12 h-9 rounded-md overflow-hidden border-2 transition-all ${
                            coverImageUrl === it.product.image_url
                              ? 'border-blue-600'
                              : 'border-slate-200 opacity-70 hover:opacity-100'
                          }`}
                          title={`Use ${it.product.title} photo`}
                        >
                          <ResilientImage
                            src={it.product.image_url}
                            alt={it.product.title}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Live Bundle Pricing Preview */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Combined Individual Price ({selectedItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span className="font-mono tabular-nums">{formatMoney(regularTotal, currency)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Bundle Discount ({clampedDiscount}% off)</span>
                  <span className="font-mono tabular-nums">−{formatMoney(savingsAmount, currency)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                  <span>Single-Unit Bundle Price</span>
                  <span className="font-mono tabular-nums">{formatMoney(bundlePrice, currency)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || selectedItems.length < 2}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {submitting ? 'Publishing Bundle...' : 'Publish Bundle to Storefront'}
              </button>
            </form>
          )}
        </section>

        {/* Right Column: Live Bundles List */}
        <section className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {embeddedInPortal ? `Shop Bundles (${displayedBundles.length})` : `Published Bundles (${displayedBundles.length})`}
            </h2>
            <span className="text-xs text-slate-500">Sold as a single unified SKU in catalog &amp; bag</span>
          </div>

          {displayedBundles.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No product bundles published yet. Select 2 or more items on the left to build one.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedBundles.map((b) => {
                const canManage =
                  user?.role === 'admin' ||
                  (user?.role === 'vendor' && b.vendor_id === builderVendorId);
                const outOfStock = b.available_stock <= 0;

                return (
                  <article
                    key={b.id}
                    className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${
                      !b.is_active ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="p-5 flex flex-col sm:flex-row gap-4">
                      <div className="w-full sm:w-36 aspect-[4/3] rounded-lg bg-slate-100 overflow-hidden shrink-0 relative">
                        <ResilientImage
                          src={b.image_url}
                          alt={b.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1">
                          {b.items.slice(0, 3).map((comp) => (
                            <div
                              key={comp.product_id}
                              className="w-7 h-7 rounded border border-white/90 bg-white overflow-hidden shadow-xs"
                              title={comp.title}
                            >
                              <ResilientImage
                                src={comp.image_url}
                                alt={comp.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span className="truncate">
                              Bundle · {b.items.length} Products · {b.vendor_name}
                              {!b.is_active ? ' · Paused' : ''}
                            </span>
                            <span className="font-mono font-semibold text-emerald-700 shrink-0">
                              Save {b.discount_percent}%
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-slate-900">{b.title}</h3>
                          {b.description && (
                            <p className="text-xs text-slate-500 line-clamp-2">{b.description}</p>
                          )}
                          <ul className="pt-1 space-y-0.5 text-xs text-slate-600">
                            {b.items.map((comp) => (
                              <li key={comp.product_id} className="truncate">
                                <span className="font-mono text-slate-800">{comp.quantity}×</span>{' '}
                                {comp.title}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                                {formatMoney(b.bundle_price, currency)}
                              </span>
                              <span className="text-xs font-mono text-slate-400 line-through tabular-nums">
                                {formatMoney(b.regular_total, currency)}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              Save {formatMoney(b.savings, currency)} ·{' '}
                              {b.available_stock >= 999
                                ? 'Instant digital'
                                : `${b.available_stock} kits available`}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleBundleActive(b)}
                                  title={b.is_active ? 'Pause bundle' : 'Activate bundle'}
                                  className="p-2 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg"
                                >
                                  {b.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBundle(b.id)}
                                  title="Delete bundle"
                                  className="p-2 text-slate-400 hover:text-red-600 border border-slate-200 rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {onAddBundleToCart && b.is_active === 1 && (
                              <button
                                type="button"
                                disabled={outOfStock}
                                onClick={() => onAddBundleToCart(b, 1)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-40"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                                {outOfStock ? 'Sold Out' : 'Add Bundle to Bag'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
