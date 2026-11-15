import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ArrowRight,
  PackageCheck,
  ShieldCheck,
  Truck,
  Star,
  RotateCcw,
  KeyRound,
  ShoppingBag,
  Heart,
  Trash2,
} from 'lucide-react';
import {
  Category,
  CmsPage,
  CurrencyCode,
  HomepageSection,
  Order,
  OrderItem,
  Product,
  User,
} from '../types';
import { formatMoney, parseAttributes } from '../lib/currency';
import { apiRequest } from '../lib/api';
import { ResilientImage } from './ResilientImage';
import { ProductDetailModal } from './ProductDetailModal';

interface StorefrontViewProps {
  products: Product[];
  categories: Category[];
  sections: HomepageSection[];
  cmsPages: CmsPage[];
  currency: CurrencyCode;
  user: User | null;
  activeRoute: string;
  externalSearchQuery?: string;
  externalSelectedProduct?: Product | null;
  wishlistIds?: number[];
  wishlistItems?: Product[];
  onClearExternalProduct?: () => void;
  onNavigateRoute: (route: string) => void;
  onAddToCart: (product: Product, variantLabel: string, unitPrice: number, quantity: number) => void;
  onReorderItems: (
    items: Array<{ product: Product; variantLabel: string; unitPrice: number; quantity: number }>
  ) => void;
  onToggleWishlist?: (productId: number) => void;
  onRemoveWishlist?: (productId: number) => void;
  onOpenAuth: () => void;
  onCurrencyChange: (c: CurrencyCode) => void;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  products,
  categories,
  sections,
  cmsPages,
  currency,
  user,
  activeRoute,
  externalSearchQuery,
  externalSelectedProduct,
  wishlistIds = [],
  wishlistItems = [],
  onClearExternalProduct,
  onNavigateRoute,
  onAddToCart,
  onReorderItems,
  onToggleWishlist,
  onRemoveWishlist,
  onOpenAuth,
  onCurrencyChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  // Order tracking
  const [trackInput, setTrackInput] = useState('OM-10042');
  const [trackedResult, setTrackedResult] = useState<{ order: Order; items: OrderItem[] } | null>(null);
  const [trackError, setTrackError] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Customer order history
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState(false);
  const [myOrdersError, setMyOrdersError] = useState('');
  const [reorderFeedback, setReorderFeedback] = useState('');

  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  useEffect(() => {
    if (externalSelectedProduct) {
      setActiveProduct(externalSelectedProduct);
      onClearExternalProduct?.();
    }
  }, [externalSelectedProduct, onClearExternalProduct]);

  useEffect(() => {
    if (activeRoute === 'orders' && user) {
      setMyOrdersLoading(true);
      setMyOrdersError('');
      apiRequest<{ orders: Order[] }>('/api/orders/my')
        .then((res) => setMyOrders(res.orders))
        .catch((err) =>
          setMyOrdersError(err instanceof Error ? err.message : 'Unable to load order history')
        )
        .finally(() => setMyOrdersLoading(false));
    }
  }, [activeRoute, user]);

  // Sync category route if user clicked a menu link like "category:audio-tech"
  const effectiveCategorySlug = activeRoute.startsWith('category:')
    ? activeRoute.replace('category:', '')
    : selectedCategorySlug;

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const catOk = effectiveCategorySlug === 'all' || p.category_slug === effectiveCategorySlug;
      const qOk =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.short_description.toLowerCase().includes(q) ||
        (p.vendor_name || '').toLowerCase().includes(q);
      return catOk && qOk;
    });

    if (sortBy === 'price-asc') return [...list].sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [products, effectiveCategorySlug, searchQuery, sortBy]);

  const handleTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackInput.trim()) return;
    setTrackingLoading(true);
    setTrackError('');
    try {
      const res = await apiRequest<{ order: Order; items: OrderItem[] }>(
        `/api/orders/track/${encodeURIComponent(trackInput.trim())}`
      );
      setTrackedResult(res);
    } catch (err) {
      setTrackedResult(null);
      setTrackError(err instanceof Error ? err.message : 'Order not found');
    } finally {
      setTrackingLoading(false);
    }
  };

  const quickAdd = (p: Product) => {
    const attrs = parseAttributes(p.attributes_json);
    const firstOpt = attrs[0]?.options?.[0];
    onAddToCart(p, firstOpt?.label || '', p.price + (firstOpt?.priceDelta || 0), 1);
  };

  const handleReorderSingle = (item: OrderItem) => {
    const matched = products.find((p) => p.id === item.product_id);
    if (!matched) {
      setReorderFeedback(`"${item.title}" is no longer available in the catalog.`);
      return;
    }
    if (matched.product_type === 'physical' && matched.stock <= 0) {
      setReorderFeedback(`"${item.title}" is currently out of stock.`);
      return;
    }
    setReorderFeedback('');
    onAddToCart(matched, item.variant_label, item.unit_price, item.quantity);
  };

  const handleReorderAll = (order: Order) => {
    const orderItems = order.items || [];
    const available: Array<{
      product: Product;
      variantLabel: string;
      unitPrice: number;
      quantity: number;
    }> = [];
    const skipped: string[] = [];

    for (const item of orderItems) {
      const matched = products.find((p) => p.id === item.product_id);
      if (!matched || (matched.product_type === 'physical' && matched.stock <= 0)) {
        skipped.push(item.title);
        continue;
      }
      available.push({
        product: matched,
        variantLabel: item.variant_label,
        unitPrice: item.unit_price,
        quantity: item.quantity,
      });
    }

    if (available.length === 0) {
      setReorderFeedback('None of the items in this order are currently in stock.');
      return;
    }
    setReorderFeedback(
      skipped.length > 0
        ? `Added available items to bag. Skipped unavailable: ${skipped.join(', ')}.`
        : ''
    );
    onReorderItems(available);
  };

  // Dedicated Customer Order History & Reorder Subview
  if (activeRoute === 'orders') {
    const steps = ['pending', 'processing', 'shipped', 'delivered'];

    return (
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Order History</h1>
            <p className="text-sm text-slate-500 mt-1">
              Review past purchases, check fulfillment progress, and reorder items in one click.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigateRoute('track')}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Track by Order #
            </button>
            <button
              type="button"
              onClick={() => onNavigateRoute('catalog')}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Back to Shop
            </button>
          </div>
        </div>

        {!user ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
            <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">Sign in to view your orders</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Sign in with your customer account (or use the Customer Demo account) to access your complete order history and 1-click reorder.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Sign In / Customer Demo
            </button>
          </div>
        ) : myOrdersLoading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div key={n} className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : myOrdersError ? (
          <div className="p-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
            {myOrdersError}
          </div>
        ) : myOrders.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <p className="text-sm text-slate-500">You have not placed any orders on this account yet.</p>
            <button
              type="button"
              onClick={() => onNavigateRoute('catalog')}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg"
            >
              Browse Storefront
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {reorderFeedback && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 text-xs text-amber-800 rounded-xl">
                {reorderFeedback}
              </div>
            )}

            {myOrders.map((order) => {
              const currentIdx = steps.indexOf(order.order_status);
              const orderItems = order.items || [];
              return (
                <div
                  key={order.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                >
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-6 text-xs">
                      <div>
                        <div className="text-slate-500">Order Reference</div>
                        <div className="font-mono font-semibold text-sm text-slate-900 mt-0.5">
                          {order.order_number}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Placed On</div>
                        <div className="font-medium text-slate-800 mt-0.5 tabular-nums">
                          {order.created_at.slice(0, 10)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Payment</div>
                        <div className="font-medium text-slate-800 uppercase mt-0.5">
                          {order.payment_method} · {order.payment_status}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Status</div>
                        <div className="font-semibold text-blue-600 capitalize mt-0.5">
                          {order.order_status}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Total</div>
                        <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                          {formatMoney(order.total, currency)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReorderAll(order)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reorder All
                      </button>
                    </div>
                  </div>

                  {/* Fulfillment Progress Bar */}
                  {order.order_status !== 'cancelled' && (
                    <div className="px-6 py-3 border-b border-slate-100 grid grid-cols-4 gap-2">
                      {steps.map((st, idx) => {
                        const done = idx <= currentIdx;
                        return (
                          <div key={st} className="space-y-1">
                            <div
                              className={`h-1 rounded-full ${done ? 'bg-blue-600' : 'bg-slate-200'}`}
                            />
                            <div
                              className={`text-[11px] capitalize font-medium ${
                                done ? 'text-slate-900' : 'text-slate-400'
                              }`}
                            >
                              {st}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Line Items */}
                  <div className="divide-y divide-slate-100 px-6">
                    {orderItems.map((it) => {
                      const catalogMatch = products.find((p) => p.id === it.product_id);
                      return (
                        <div
                          key={it.id}
                          className="py-4 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <div className="w-14 h-11 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                              <ResilientImage
                                src={catalogMatch?.image_url || ''}
                                alt={it.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {it.title}
                              </div>
                              <div className="text-xs text-slate-500">
                                Qty {it.quantity}
                                {it.variant_label ? ` · ${it.variant_label}` : ''}
                                {' · '}
                                <span className="font-mono tabular-nums">
                                  {formatMoney(it.unit_price, currency)} each
                                </span>
                              </div>
                              {it.license_key && (
                                <div className="inline-flex items-center gap-1.5 text-xs font-mono text-blue-700 pt-0.5">
                                  <KeyRound className="w-3.5 h-3.5" />
                                  {it.license_key}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                              {formatMoney(it.total_price, currency)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleReorderSingle(it)}
                              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded-lg transition-colors whitespace-nowrap"
                            >
                              Reorder Item
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Dedicated Customer Wishlist Subview
  if (activeRoute === 'wishlist') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Saved Wishlist</h1>
            <p className="text-sm text-slate-500 mt-1">
              {user
                ? `${wishlistItems.length} saved ${wishlistItems.length === 1 ? 'item' : 'items'} synced to your account.`
                : 'Save hardware, studio objects, and software licenses for later.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigateRoute('orders')}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              My Orders
            </button>
            <button
              type="button"
              onClick={() => onNavigateRoute('catalog')}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Back to Shop
            </button>
          </div>
        </div>

        {!user ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
            <Heart className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">Sign in to manage your wishlist</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Sign in with your customer account (or use the Customer Demo button) to save products across sessions.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Sign In / Customer Demo
            </button>
          </div>
        ) : wishlistItems.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <Heart className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-medium text-slate-700">Your wishlist is empty.</div>
            <p className="text-xs text-slate-500">
              Click the heart icon on any product card in the storefront to bookmark it here.
            </p>
            <button
              type="button"
              onClick={() => onNavigateRoute('catalog')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
            >
              Browse Storefront
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wishlistItems.map((item) => {
              const outOfStock = item.product_type === 'physical' && item.stock <= 0;
              return (
                <article
                  key={item.id}
                  className="group bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setActiveProduct(item)}
                      className="w-full h-full block text-left"
                    >
                      <ResilientImage
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveWishlist?.(item.id)}
                      aria-label={`Remove ${item.title} from wishlist`}
                      className="absolute top-3 right-3 p-2 rounded-full bg-white/95 border border-slate-200 text-rose-500 hover:bg-rose-50 transition-colors shadow-xs"
                    >
                      <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                    </button>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                        <span>{item.category_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.vendor_name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveProduct(item)}
                        className="text-left block"
                      >
                        <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {item.title}
                        </h3>
                      </button>
                      <p className="text-xs text-slate-500 line-clamp-2">{item.short_description}</p>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] font-semibold font-mono text-slate-900 tabular-nums">
                          {formatMoney(item.price, currency)}
                        </span>
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {item.product_type === 'physical' ? `${item.stock} in stock` : 'Digital delivery'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => quickAdd(item)}
                          className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {outOfStock ? 'Sold Out' : 'Move to Bag'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveWishlist?.(item.id)}
                          aria-label={`Remove ${item.title}`}
                          className="p-2 text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <ProductDetailModal
          product={activeProduct}
          currency={currency}
          user={user}
          isWishlisted={activeProduct ? wishlistIds.includes(activeProduct.id) : false}
          onToggleWishlist={onToggleWishlist}
          onClose={() => setActiveProduct(null)}
          onAddToCart={onAddToCart}
        />
      </div>
    );
  }

  // Dedicated Track Order Subview
  if (activeRoute === 'track') {
    const steps = ['pending', 'processing', 'shipped', 'delivered'];
    const currentIdx = trackedResult ? steps.indexOf(trackedResult.order.order_status) : -1;

    return (
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Track Your Order</h1>
            <p className="text-sm text-slate-500 mt-1">
              Enter your OmniMart order number (for example, OM-10042) to inspect fulfillment progress.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateRoute('catalog')}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Back to Shop
          </button>
        </div>

        <form onSubmit={handleTrackOrder} className="flex gap-3">
          <input
            type="text"
            value={trackInput}
            onChange={(e) => setTrackInput(e.target.value)}
            placeholder="OM-10042"
            className="flex-1 px-4 py-2.5 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            disabled={trackingLoading}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg whitespace-nowrap"
          >
            {trackingLoading ? 'Checking...' : 'Track Order'}
          </button>
        </form>

        {trackError && (
          <div className="p-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
            {trackError}
          </div>
        )}

        {trackedResult && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs text-slate-500">Order Reference</div>
                <div className="text-lg font-bold font-mono text-slate-900">
                  {trackedResult.order.order_number}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Total Amount</div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {formatMoney(trackedResult.order.total, currency)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {steps.map((st, idx) => {
                const done = idx <= currentIdx;
                return (
                  <div key={st} className="space-y-2">
                    <div className={`h-1.5 rounded-full ${done ? 'bg-blue-600' : 'bg-slate-200'}`} />
                    <div className={`text-xs capitalize font-medium ${done ? 'text-slate-900' : 'text-slate-400'}`}>
                      {st}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="divide-y divide-slate-100 border-t border-slate-200 pt-2">
              {trackedResult.items.map((it) => (
                <div key={it.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-slate-900">{it.title}</div>
                    <div className="text-xs text-slate-500">
                      Qty {it.quantity} {it.variant_label ? `· ${it.variant_label}` : ''}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums font-medium">
                    {formatMoney(it.total_price, currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Dedicated CMS Page Subview
  if (activeRoute.startsWith('cms:')) {
    const slug = activeRoute.replace('cms:', '');
    const page = cmsPages.find((p) => p.slug === slug);
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <button
          type="button"
          onClick={() => onNavigateRoute('catalog')}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          ← Back to Storefront
        </button>
        {page ? (
          <article className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
            <h1 className="text-2xl font-bold text-slate-900">{page.title}</h1>
            <p className="text-base text-slate-600 leading-relaxed whitespace-pre-line">{page.content}</p>
          </article>
        ) : (
          <div className="p-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
            Page not found.
          </div>
        )}
      </div>
    );
  }

  const renderSection = (sec: HomepageSection) => {
    if (sec.section_type === 'hero') {
      return (
        <section key={sec.id} className="max-w-[1280px] mx-auto px-6 pt-8 pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="lg:col-span-5 p-8 lg:p-12 flex flex-col justify-between gap-8">
              <div className="space-y-4">
                <div className="text-xs font-medium text-slate-500">
                  Curated Multi-Vendor Flagship · Verified Makers
                </div>
                <h1
                  className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-slate-900 tracking-tight leading-[1.12]"
                  style={{ textWrap: 'balance' }}
                >
                  {sec.title}
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-md">{sec.subtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#catalog-grid"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  Explore Collection
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('orders')}
                  className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                >
                  My Orders
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('wishlist')}
                  className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                >
                  Wishlist
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('track')}
                  className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                >
                  Track an Order
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 min-h-[300px] lg:min-h-[420px] bg-slate-100">
              <ResilientImage
                src="/src/assets/images/hero_omnimart_showcase_1794763520340.jpg"
                alt="OmniMart curated hardware, timepieces, and studio objects"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>
      );
    }

    if (sec.section_type === 'featured_grid') {
      return (
        <section key={sec.id} id="catalog-grid" className="max-w-[1280px] mx-auto px-6 py-8 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{sec.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{sec.subtitle}</p>
            </div>

            {/* Currency & Sort */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
                aria-label="Currency selector"
                className="px-3 py-2 text-xs font-mono font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'featured' | 'price-asc' | 'price-desc')}
                aria-label="Sort products"
                className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              >
                <option value="featured">Featured First</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {/* Search & Category Segmented Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategorySlug('all');
                  onNavigateRoute('catalog');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  effectiveCategorySlug === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Products
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategorySlug(cat.slug);
                    onNavigateRoute(`category:${cat.slug}`);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    effectiveCategorySlug === cat.slug
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalog or vendor..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Uniform 3-Column Product Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
              No products matched your current filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product) => {
                const isSaved = wishlistIds.includes(product.id);
                return (
                <article
                  key={product.id}
                  className="group bg-white border border-slate-200 rounded-xl overflow-hidden transition-transform duration-150 hover:-translate-y-0.5 flex flex-col"
                >
                  <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setActiveProduct(product)}
                      className="w-full h-full block text-left"
                    >
                      <ResilientImage
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWishlist?.(product.id);
                      }}
                      aria-label={isSaved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
                      className={`absolute top-3 right-3 p-2 rounded-full border transition-colors shadow-xs ${
                        isSaved
                          ? 'bg-white border-rose-200 text-rose-500'
                          : 'bg-white/90 border-slate-200 text-slate-500 hover:text-rose-500'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                        <span>{product.category_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{product.vendor_name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveProduct(product)}
                        className="text-left block"
                      >
                        <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {product.title}
                        </h3>
                      </button>
                      <p className="text-xs text-slate-500 line-clamp-2">{product.short_description}</p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div className="space-y-0.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[15px] font-semibold font-mono text-slate-900 tabular-nums">
                            {formatMoney(product.price, currency)}
                          </span>
                          {product.compare_at_price && product.compare_at_price > product.price && (
                            <span className="text-xs text-slate-400 line-through font-mono tabular-nums">
                              {formatMoney(product.compare_at_price, currency)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 tabular-nums">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{product.rating.toFixed(1)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{product.product_type === 'physical' ? `${product.stock} left` : 'Digital'}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={product.product_type === 'physical' && product.stock <= 0}
                        onClick={() => quickAdd(product)}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap disabled:opacity-40"
                      >
                        {product.product_type === 'physical' && product.stock <= 0 ? 'Sold Out' : 'Add to Bag'}
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
      );
    }

    if (sec.section_type === 'craft_editorial') {
      return (
        <section key={sec.id} className="max-w-[1280px] mx-auto px-6 py-10">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{sec.title}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{sec.subtitle}</p>
            </div>
            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <Truck className="w-5 h-5 text-slate-700" />
                <div className="text-sm font-semibold text-slate-900">Express Dispatch</div>
                <div className="text-xs text-slate-500">Complimentary over $150</div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <ShieldCheck className="w-5 h-5 text-slate-700" />
                <div className="text-sm font-semibold text-slate-900">Buyer Protection</div>
                <div className="text-xs text-slate-500">COD, Card & PayPal</div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <PackageCheck className="w-5 h-5 text-slate-700" />
                <div className="text-sm font-semibold text-slate-900">Direct Makers</div>
                <div className="text-xs text-slate-500">Verified multi-vendor stock</div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <div className="pb-16">
      {sections.map((sec) => renderSection(sec))}

      <ProductDetailModal
        product={activeProduct}
        currency={currency}
        user={user}
        isWishlisted={activeProduct ? wishlistIds.includes(activeProduct.id) : false}
        onToggleWishlist={onToggleWishlist}
        onClose={() => setActiveProduct(null)}
        onAddToCart={onAddToCart}
      />
    </div>
  );
};
