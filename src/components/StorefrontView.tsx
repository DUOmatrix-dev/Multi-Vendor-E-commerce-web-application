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
  Calendar,
  MapPin,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Award,
  Scale,
  Film,
  Headphones,
  X,
  Printer,
  Layers,
  ArrowLeft,
} from 'lucide-react';
import {
  Category,
  CmsPage,
  CurrencyCode,
  HomepageSection,
  LoyaltyTransaction,
  Order,
  OrderItem,
  Product,
  ProductBundle,
  Review,
  User,
  Vendor,
} from '../types';
import { formatMoney, parseAttributes } from '../lib/currency';
import { apiRequest } from '../lib/api';
import { ResilientImage } from './ResilientImage';
import { ProductDetailModal } from './ProductDetailModal';
import { ProductReviews } from './ProductReviews';
import { VideoStudioView } from './VideoStudioView';
import { InvoiceModal } from './InvoiceModal';
import { BundleBuilderView } from './BundleBuilderView';

interface StorefrontViewProps {
  products: Product[];
  bundles?: ProductBundle[];
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
  compareIds?: number[];
  storeName?: string;
  supportEmail?: string;
  onClearExternalProduct?: () => void;
  onNavigateRoute: (route: string) => void;
  onAddToCart: (product: Product, variantLabel: string, unitPrice: number, quantity: number) => void;
  onAddBundleToCart?: (bundle: ProductBundle, quantity?: number) => void;
  onReorderItems: (
    items: Array<{ product: Product; variantLabel: string; unitPrice: number; quantity: number }>
  ) => void;
  onToggleWishlist?: (productId: number) => void;
  onRemoveWishlist?: (productId: number) => void;
  onToggleCompare?: (productId: number) => void;
  onClearCompare?: () => void;
  onOpenVoice?: () => void;
  onDataMutated?: () => void;
  onAuthSuccess?: (user: User, vendor: Vendor | null) => void;
  onOpenAuth: () => void;
  onCurrencyChange: (c: CurrencyCode) => void;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  products,
  bundles = [],
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
  compareIds = [],
  storeName,
  supportEmail,
  onClearExternalProduct,
  onNavigateRoute,
  onAddToCart,
  onAddBundleToCart,
  onReorderItems,
  onToggleWishlist,
  onRemoveWishlist,
  onToggleCompare,
  onClearCompare,
  onOpenVoice,
  onDataMutated,
  onAuthSuccess,
  onOpenAuth,
  onCurrencyChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);

  // Order tracking (with real-time SSE stream)
  const [trackInput, setTrackInput] = useState('OM-10042');
  const [trackedResult, setTrackedResult] = useState<{ order: Order; items: OrderItem[] } | null>(null);
  const [trackError, setTrackError] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');

  // Customer order history
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState(false);
  const [myOrdersError, setMyOrdersError] = useState('');
  const [reorderFeedback, setReorderFeedback] = useState('');

  // Account & Loyalty Rewards
  const [loyaltyData, setLoyaltyData] = useState<{
    balance: number;
    dollarValuePerPoint: number;
    earnRatePerDollar: number;
    transactions: LoyaltyTransaction[];
  } | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState('');

  // Product comparison
  const [highlightDiffs, setHighlightDiffs] = useState(false);

  const compareProducts = useMemo(
    () =>
      compareIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p)),
    [compareIds, products]
  );

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

  useEffect(() => {
    if (activeRoute === 'account' && user) {
      setLoyaltyLoading(true);
      setLoyaltyError('');
      apiRequest<{
        balance: number;
        dollarValuePerPoint: number;
        earnRatePerDollar: number;
        transactions: LoyaltyTransaction[];
      }>('/api/loyalty')
        .then((res) => setLoyaltyData(res))
        .catch((err) =>
          setLoyaltyError(err instanceof Error ? err.message : 'Unable to load loyalty rewards')
        )
        .finally(() => setLoyaltyLoading(false));
    }
  }, [activeRoute, user]);

  // Individual product detail page state
  const detailSlug = activeRoute.startsWith('product:') ? activeRoute.replace('product:', '') : '';
  const detailProduct = useMemo(
    () => (detailSlug ? products.find((p) => p.slug === detailSlug) || null : null),
    [detailSlug, products]
  );
  const [detailVariant, setDetailVariant] = useState<string>('');
  const [detailUnitPrice, setDetailUnitPrice] = useState<number>(0);
  const [detailQty, setDetailQty] = useState<number>(1);
  const [detailReviews, setDetailReviews] = useState<Review[]>([]);
  const [detailCanReview, setDetailCanReview] = useState<boolean>(false);
  const [detailLiveRating, setDetailLiveRating] = useState<number>(0);

  useEffect(() => {
    if (!detailProduct) return;
    setDetailQty(1);
    setDetailLiveRating(detailProduct.rating);
    const parsed = parseAttributes(detailProduct.attributes_json);
    const firstOpt = parsed[0]?.options?.[0];
    setDetailVariant(firstOpt?.label || '');
    setDetailUnitPrice(detailProduct.price + (firstOpt?.priceDelta || 0));

    apiRequest<{ reviews: Review[]; canReview?: boolean; product?: Product }>(
      `/api/products/${detailProduct.id}`
    )
      .then((res) => {
        setDetailReviews(res.reviews);
        setDetailCanReview(Boolean(res.canReview));
        if (res.product) setDetailLiveRating(res.product.rating);
      })
      .catch(() => {
        setDetailReviews([]);
        setDetailCanReview(false);
      });
  }, [detailProduct, user?.id]);

  // Auto-fetch live shipping status and ETA when entering the Track Order page
  useEffect(() => {
    if (activeRoute === 'track' && !trackedResult && !trackError && !trackingLoading && trackInput.trim()) {
      lookupOrder(trackInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute]);

  // Real-time SSE subscription for the currently tracked order
  const trackedOrderNumber = trackedResult?.order.order_number || '';
  useEffect(() => {
    if (activeRoute !== 'track' || !trackedOrderNumber) {
      setLiveConnected(false);
      return;
    }

    const es = new EventSource(
      `/api/orders/track/${encodeURIComponent(trackedOrderNumber)}/stream`
    );

    const handleOrderUpdate = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { order: Order; items: OrderItem[] };
        setTrackedResult(data);
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setLiveConnected(true);
      } catch {
        // ignore malformed frame
      }
    };

    es.addEventListener('order_update', handleOrderUpdate as EventListener);
    es.onopen = () => setLiveConnected(true);
    es.onerror = () => setLiveConnected(false);

    return () => {
      es.removeEventListener('order_update', handleOrderUpdate as EventListener);
      es.close();
      setLiveConnected(false);
    };
  }, [activeRoute, trackedOrderNumber]);

  // Sync category route if user clicked a menu link like "category:audio-tech"
  const effectiveCategorySlug = activeRoute.startsWith('category:')
    ? activeRoute.replace('category:', '')
    : selectedCategorySlug;

  const filteredProducts = useMemo(() => {
    if (effectiveCategorySlug === 'bundles') return [];
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

  const filteredBundles = useMemo(() => {
    if (effectiveCategorySlug !== 'all' && effectiveCategorySlug !== 'bundles') return [];
    const q = searchQuery.trim().toLowerCase();
    const list = bundles.filter((b) => {
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.vendor_name.toLowerCase().includes(q) ||
        b.items.some((it) => it.title.toLowerCase().includes(q))
      );
    });
    if (sortBy === 'price-asc') return [...list].sort((a, b) => a.bundle_price - b.bundle_price);
    if (sortBy === 'price-desc') return [...list].sort((a, b) => b.bundle_price - a.bundle_price);
    return list;
  }, [bundles, effectiveCategorySlug, searchQuery, sortBy]);

  const lookupOrder = async (orderNumberQuery: string) => {
    const cleaned = orderNumberQuery.trim();
    if (!cleaned) return;
    setTrackingLoading(true);
    setTrackError('');
    try {
      const res = await apiRequest<{ order: Order; items: OrderItem[] }>(
        `/api/orders/track/${encodeURIComponent(cleaned)}`
      );
      setTrackedResult(res);
      setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      setTrackedResult(null);
      setTrackError(err instanceof Error ? err.message : 'Order not found');
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await lookupOrder(trackInput);
  };

  const quickAdd = (p: Product) => {
    const attrs = parseAttributes(p.attributes_json);
    const firstOpt = attrs[0]?.options?.[0];
    onAddToCart(p, firstOpt?.label || '', p.price + (firstOpt?.priceDelta || 0), 1);
  };

  const handleReorderSingle = (item: OrderItem) => {
    if (item.bundle_id) {
      const matchedBundle = bundles.find((b) => b.id === item.bundle_id);
      if (matchedBundle && matchedBundle.available_stock >= item.quantity) {
        setReorderFeedback('');
        onAddBundleToCart?.(matchedBundle, item.quantity);
        return;
      }
      setReorderFeedback(`Bundle "${item.title}" is currently unavailable or out of stock.`);
      return;
    }
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
              const isCompletedOrder =
                order.order_status === 'delivered' ||
                (order.payment_status === 'paid' && order.order_status !== 'cancelled');
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

                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="text-right mr-1">
                        <div className="text-xs text-slate-500">Total</div>
                        <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                          {formatMoney(order.total, currency)}
                        </div>
                      </div>
                      {isCompletedOrder && (
                        <button
                          type="button"
                          onClick={() => setInvoiceOrder(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print Invoice
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTrackInput(order.order_number);
                          lookupOrder(order.order_number);
                          onNavigateRoute('track');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        Track Live
                      </button>
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

                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums mr-1.5">
                              {formatMoney(it.total_price, currency)}
                            </span>
                            {catalogMatch && order.order_status !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={() => setActiveProduct(catalogMatch)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                              >
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                Write Review
                              </button>
                            )}
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

        <ProductDetailModal
          product={activeProduct}
          currency={currency}
          user={user}
          isWishlisted={activeProduct ? wishlistIds.includes(activeProduct.id) : false}
          isCompared={activeProduct ? compareIds.includes(activeProduct.id) : false}
          onToggleWishlist={onToggleWishlist}
          onToggleCompare={onToggleCompare}
          onOpenFullPage={(p) => onNavigateRoute(`product:${p.slug}`)}
          onOpenAuth={onOpenAuth}
          onReviewSubmitted={onDataMutated}
          onClose={() => setActiveProduct(null)}
          onAddToCart={onAddToCart}
        />

        <InvoiceModal
          order={invoiceOrder}
          currency={currency}
          storeName={storeName}
          supportEmail={supportEmail}
          onClose={() => setInvoiceOrder(null)}
        />
      </div>
    );
  }

  // Dedicated Account & Loyalty Rewards Subview
  if (activeRoute === 'account') {
    const balance = loyaltyData?.balance ?? user?.loyalty_points ?? 0;
    const dollarValuePerPoint = loyaltyData?.dollarValuePerPoint ?? 0.05;
    const redeemableCredit = balance * dollarValuePerPoint;

    return (
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Account &amp; Loyalty Rewards</h1>
            <p className="text-sm text-slate-500 mt-1">
              Track your OmniMart Rewards balance, points ledger, and checkout discount credit.
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
            <Award className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">Sign in to view your Rewards balance</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Earn 1 loyalty point for every $1 spent and redeem 100 points for $5.00 off at checkout.
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
        ) : (
          <div className="space-y-6">
            {/* Balance & Profile Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                    <Award className="w-4 h-4" />
                    OmniMart Rewards Balance
                  </div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                    {balance.toLocaleString()} pts
                  </div>
                  <p className="text-xs text-slate-500">
                    Redeemable value:{' '}
                    <strong className="text-slate-900 font-mono tabular-nums">
                      {formatMoney(redeemableCredit, currency)}
                    </strong>{' '}
                    at checkout (100 pts = {formatMoney(5, currency)} off)
                  </p>
                </div>

                <div className="space-y-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="font-semibold text-slate-900">Program Rules</div>
                  <div>Earn: 1 pt per $1.00 spent</div>
                  <div>Redeem: $0.05 discount per point</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
                <div className="text-xs font-semibold text-slate-500">Member Profile</div>
                <div className="text-base font-bold text-slate-900">{user.name}</div>
                <div className="text-xs text-slate-600 truncate">{user.email}</div>
                <div className="text-xs text-slate-500 capitalize pt-1">
                  Account tier · {user.role}
                </div>
              </div>
            </div>

            {/* Points Ledger */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Points Activity Ledger</h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {loyaltyData?.transactions.length || 0} entries
                </span>
              </div>

              {loyaltyLoading ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading points ledger...</div>
              ) : loyaltyError ? (
                <div className="p-6 text-sm text-red-600">{loyaltyError}</div>
              ) : !loyaltyData || loyaltyData.transactions.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No loyalty transactions recorded yet. Place an order to earn points.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="py-3 px-6 font-medium">Date</th>
                        <th className="py-3 px-4 font-medium">Activity</th>
                        <th className="py-3 px-4 font-medium">Type</th>
                        <th className="py-3 px-4 font-medium">Order Ref</th>
                        <th className="py-3 px-6 font-medium text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loyaltyData.transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/70">
                          <td className="py-3.5 px-6 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                            {tx.created_at.slice(0, 10)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-800">{tx.description}</td>
                          <td className="py-3.5 px-4 text-xs capitalize text-slate-600">{tx.type}</td>
                          <td className="py-3.5 px-4 text-xs font-mono text-slate-500">
                            {tx.order_number || '—'}
                          </td>
                          <td
                            className={`py-3.5 px-6 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                              tx.points_delta >= 0 ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {tx.points_delta >= 0 ? `+${tx.points_delta}` : tx.points_delta} pts
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Dedicated Product Comparison Subview
  if (activeRoute === 'compare') {
    const attrNames = Array.from(
      new Set(
        compareProducts.flatMap((p) => parseAttributes(p.attributes_json).map((a) => a.name))
      )
    );

    const allSame = (values: string[]) =>
      values.length <= 1 || values.every((v) => v === values[0]);

    const addableProducts = products.filter((p) => !compareIds.includes(p.id));

    return (
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Product Comparison</h1>
            <p className="text-sm text-slate-500 mt-1">
              Compare up to 4 products side-by-side across specifications, ratings, stock, and pricing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {compareProducts.length >= 2 && (
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none px-3 py-2 bg-white border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  checked={highlightDiffs}
                  onChange={(e) => setHighlightDiffs(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Highlight differences
              </label>
            )}
            {compareProducts.length > 0 && onClearCompare && (
              <button
                type="button"
                onClick={onClearCompare}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-600 border border-slate-200 bg-white rounded-lg"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateRoute('catalog')}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Back to Shop
            </button>
          </div>
        </div>

        {/* Add Product Selector */}
        {compareProducts.length < 4 && addableProducts.length > 0 && onToggleCompare && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-600">
              Comparing {compareProducts.length} of 4 slots · Add another item directly:
            </span>
            <select
              value=""
              onChange={(e) => {
                const pid = Number(e.target.value);
                if (pid) onToggleCompare(pid);
              }}
              aria-label="Add product to comparison"
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            >
              <option value="">+ Add product to compare...</option>
              {addableProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({formatMoney(p.price, currency)})
                </option>
              ))}
            </select>
          </div>
        )}

        {compareProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
            <Scale className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">No products selected for comparison</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Click the Compare icon on any storefront product card or select items above to compare specs side-by-side.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoute('catalog')}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg"
            >
              Browse Storefront
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 align-top">
                  <th className="w-44 p-5 text-xs font-semibold text-slate-500 bg-slate-50">
                    Specification
                  </th>
                  {compareProducts.map((p) => (
                    <th key={p.id} className="p-5 font-normal align-top min-w-[200px]">
                      <div className="space-y-3">
                        <div className="relative aspect-[4/3] bg-slate-100 rounded-lg overflow-hidden">
                          <ResilientImage
                            src={p.image_url}
                            alt={p.title}
                            className="w-full h-full object-cover"
                          />
                          {onToggleCompare && (
                            <button
                              type="button"
                              onClick={() => onToggleCompare(p.id)}
                              aria-label={`Remove ${p.title} from comparison`}
                              className="absolute top-2 right-2 p-1.5 rounded-full bg-white/95 border border-slate-200 text-slate-600 hover:text-red-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => setActiveProduct(p)}
                            className="text-sm font-semibold text-slate-900 hover:text-blue-600 text-left line-clamp-2"
                          >
                            {p.title}
                          </button>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">{p.sku}</div>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {[
                  {
                    label: 'Price',
                    values: compareProducts.map((p) => formatMoney(p.price, currency)),
                    render: (p: Product) => (
                      <div className="space-y-0.5">
                        <div className="font-mono font-bold text-slate-900 tabular-nums">
                          {formatMoney(p.price, currency)}
                        </div>
                        {p.compare_at_price && p.compare_at_price > p.price && (
                          <div className="text-xs text-slate-400 line-through font-mono tabular-nums">
                            {formatMoney(p.compare_at_price, currency)}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    label: 'Category',
                    values: compareProducts.map((p) => p.category_name || '—'),
                    render: (p: Product) => <span className="text-slate-700">{p.category_name || '—'}</span>,
                  },
                  {
                    label: 'Vendor / Maker',
                    values: compareProducts.map((p) => p.vendor_name || '—'),
                    render: (p: Product) => <span className="text-slate-700">{p.vendor_name || '—'}</span>,
                  },
                  {
                    label: 'Rating & Reviews',
                    values: compareProducts.map((p) => `${p.rating.toFixed(1)} (${p.review_count})`),
                    render: (p: Product) => (
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {p.rating.toFixed(1)} ({p.review_count})
                      </span>
                    ),
                  },
                  {
                    label: 'Product Format',
                    values: compareProducts.map((p) => p.product_type),
                    render: (p: Product) => <span className="capitalize text-slate-700">{p.product_type}</span>,
                  },
                  {
                    label: 'Availability',
                    values: compareProducts.map((p) =>
                      p.product_type === 'physical' ? `${p.stock} in stock` : 'Instant delivery'
                    ),
                    render: (p: Product) => (
                      <span className="text-xs font-medium text-slate-700 tabular-nums">
                        {p.product_type === 'physical'
                          ? p.stock > 0
                            ? `${p.stock} units available`
                            : 'Out of stock'
                          : 'Instant digital fulfillment'}
                      </span>
                    ),
                  },
                  {
                    label: 'Overview',
                    values: compareProducts.map((p) => p.short_description),
                    render: (p: Product) => (
                      <p className="text-xs text-slate-600 leading-relaxed">{p.short_description}</p>
                    ),
                  },
                ].map((row) => {
                  const differs = highlightDiffs && !allSame(row.values);
                  return (
                    <tr key={row.label} className={differs ? 'bg-blue-50/50' : ''}>
                      <td className="p-4 px-5 text-xs font-semibold text-slate-600 bg-slate-50/70">
                        {row.label}
                      </td>
                      {compareProducts.map((p) => (
                        <td key={p.id} className="p-4 px-5 align-top">
                          {row.render(p)}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                {attrNames.map((attrName) => {
                  const rawValues = compareProducts.map((p) => {
                    const found = parseAttributes(p.attributes_json).find((a) => a.name === attrName);
                    return found ? found.options.map((o) => o.label).join(', ') : '—';
                  });
                  const differs = highlightDiffs && !allSame(rawValues);
                  return (
                    <tr key={attrName} className={differs ? 'bg-blue-50/50' : ''}>
                      <td className="p-4 px-5 text-xs font-semibold text-slate-600 bg-slate-50/70">
                        {attrName}
                      </td>
                      {rawValues.map((val, idx) => (
                        <td key={compareProducts[idx].id} className="p-4 px-5 text-xs text-slate-700 align-top">
                          {val}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                <tr className="bg-slate-50/50">
                  <td className="p-4 px-5 text-xs font-semibold text-slate-600 bg-slate-50">
                    Action
                  </td>
                  {compareProducts.map((p) => {
                    const outOfStock = p.product_type === 'physical' && p.stock <= 0;
                    return (
                      <td key={p.id} className="p-4 px-5">
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => quickAdd(p)}
                          className="w-full py-2 px-3 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                        >
                          {outOfStock ? 'Sold Out' : 'Add to Bag'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <ProductDetailModal
          product={activeProduct}
          currency={currency}
          user={user}
          isWishlisted={activeProduct ? wishlistIds.includes(activeProduct.id) : false}
          isCompared={activeProduct ? compareIds.includes(activeProduct.id) : false}
          onToggleWishlist={onToggleWishlist}
          onToggleCompare={onToggleCompare}
          onOpenFullPage={(p) => onNavigateRoute(`product:${p.slug}`)}
          onOpenAuth={onOpenAuth}
          onReviewSubmitted={onDataMutated}
          onClose={() => setActiveProduct(null)}
          onAddToCart={onAddToCart}
        />
      </div>
    );
  }

  // Dedicated Photo-to-Video Motion Studio Subview
  if (activeRoute === 'studio') {
    return <VideoStudioView products={products} onBack={() => onNavigateRoute('catalog')} />;
  }

  // Dedicated Vendor Bundle Builder Subview
  if (activeRoute === 'bundles') {
    return (
      <BundleBuilderView
        products={products}
        bundles={bundles}
        currency={currency}
        user={user}
        onAddBundleToCart={onAddBundleToCart}
        onDataMutated={() => onDataMutated?.()}
        onAuthSuccess={onAuthSuccess}
        onOpenAuth={onOpenAuth}
        onBackToShop={() => onNavigateRoute('catalog')}
      />
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
          isCompared={activeProduct ? compareIds.includes(activeProduct.id) : false}
          onToggleWishlist={onToggleWishlist}
          onToggleCompare={onToggleCompare}
          onOpenFullPage={(p) => onNavigateRoute(`product:${p.slug}`)}
          onOpenAuth={onOpenAuth}
          onReviewSubmitted={onDataMutated}
          onClose={() => setActiveProduct(null)}
          onAddToCart={onAddToCart}
        />
      </div>
    );
  }

  // Dedicated Real-Time Order Tracking Subview
  if (activeRoute === 'track') {
    const steps: Array<{
      key: 'pending' | 'processing' | 'shipped' | 'delivered';
      label: string;
      detail: string;
    }> = [
      { key: 'pending', label: 'Order Confirmed', detail: 'Order received and verified' },
      { key: 'processing', label: 'Preparing Shipment', detail: 'Vendor picking and packing' },
      { key: 'shipped', label: 'In Transit', detail: 'Handed off to courier' },
      { key: 'delivered', label: 'Delivered', detail: 'Arrived at destination' },
    ];
    const currentIdx = trackedResult
      ? steps.findIndex((s) => s.key === trackedResult.order.order_status)
      : -1;
    const isCancelled = trackedResult?.order.order_status === 'cancelled';

    const formatExpectedDelivery = (rawDate?: string, status?: string) => {
      if (status === 'cancelled') return 'Shipment Cancelled';
      if (!rawDate) return 'Calculating dispatch window';
      const parsed = new Date(`${rawDate}T12:00:00Z`);
      if (Number.isNaN(parsed.getTime())) return rawDate;
      const formatted = parsed.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return status === 'delivered' ? `Delivered · ${formatted}` : formatted;
    };

    const statusHeadline = (status?: string) => {
      if (status === 'delivered') return 'Delivered to Recipient';
      if (status === 'shipped') return 'In Transit with Carrier';
      if (status === 'processing') return 'Preparing Shipment';
      if (status === 'cancelled') return 'Order Cancelled';
      return 'Order Confirmed';
    };

    return (
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Track Order</h1>
            <p className="text-sm text-slate-500 mt-1">
              Enter your OmniMart Order ID or tracking code to view live shipping status and estimated delivery (ETA).
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

        <div className="space-y-3">
          <form onSubmit={handleTrackOrder} className="flex flex-wrap sm:flex-nowrap gap-3">
            <input
              type="text"
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              placeholder="Enter Order ID (e.g. OM-10042 or TRK-OM-10042)"
              aria-label="Order ID or tracking number"
              className="flex-1 min-w-[220px] px-4 py-2.5 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={trackingLoading}
              className="px-6 py-2.5 bg-slate-900 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {trackingLoading ? 'Checking...' : 'Track Order'}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Sample Order IDs:</span>
            {['OM-10041', 'OM-10042', 'OM-10043', 'OM-10044'].map((sampleId) => (
              <button
                key={sampleId}
                type="button"
                onClick={() => {
                  setTrackInput(sampleId);
                  lookupOrder(sampleId);
                }}
                className="font-mono text-slate-700 hover:text-blue-600 underline-offset-2 hover:underline px-1.5 py-0.5 rounded bg-slate-100"
              >
                {sampleId}
              </button>
            ))}
          </div>
        </div>

        {trackError && (
          <div className="p-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
            {trackError}
          </div>
        )}

        {trackedResult && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Top Order Header */}
            <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Order ID</span>
                  <span aria-hidden="true">·</span>
                  <span>{trackedResult.order.shipping_carrier || 'OmniExpress Courier'}</span>
                  {trackedResult.order.tracking_code && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{trackedResult.order.tracking_code}</span>
                    </>
                  )}
                </div>
                <div className="text-xl font-bold font-mono text-slate-900">
                  {trackedResult.order.order_number}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Order Total</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                    {formatMoney(trackedResult.order.total, currency)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => lookupOrder(trackedResult.order.order_number)}
                  disabled={trackingLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${trackingLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Live Status & Expected Delivery Date */}
            <div className="px-6 py-5 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-500">Current Shipping Status</div>
                <div className="flex items-center gap-2">
                  {isCancelled ? (
                    <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                  ) : trackedResult.order.order_status === 'delivered' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : trackedResult.order.order_status === 'shipped' ? (
                    <Truck className="w-5 h-5 text-blue-600 shrink-0" />
                  ) : (
                    <Clock className="w-5 h-5 text-slate-700 shrink-0" />
                  )}
                  <span className="text-lg font-bold text-slate-900">
                    {statusHeadline(trackedResult.order.order_status)}
                  </span>
                </div>
                <div className="text-xs text-slate-500 tabular-nums">
                  {liveConnected ? 'Live stream active' : 'Snapshot loaded'}
                  {lastSyncedAt ? ` · Last checked ${lastSyncedAt}` : ''}
                  {trackedResult.order.updated_at ? ` · Updated ${trackedResult.order.updated_at.slice(0, 16)}` : ''}
                </div>
              </div>

              <div className="space-y-1.5 md:border-l md:border-slate-200 md:pl-6">
                <div className="text-xs font-medium text-slate-500">Estimated Delivery (ETA)</div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-lg font-bold text-slate-900 tabular-nums">
                    {formatExpectedDelivery(
                      trackedResult.order.expected_delivery_date,
                      trackedResult.order.order_status
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {trackedResult.order.shipping_address}, {trackedResult.order.shipping_city}{' '}
                    {trackedResult.order.shipping_postal}
                  </span>
                </div>
              </div>
            </div>

            {/* Shipment Progress Timeline */}
            <div className="px-6 py-6 border-b border-slate-200">
              {isCancelled ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  This order was cancelled. Contact support if you need assistance with a replacement order.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {steps.map((st, idx) => {
                    const done = idx <= currentIdx;
                    const isCurrent = idx === currentIdx;
                    return (
                      <div key={st.key} className="space-y-2">
                        <div
                          className={`h-1.5 rounded-full transition-colors ${
                            done ? 'bg-blue-600' : 'bg-slate-200'
                          }`}
                        />
                        <div>
                          <div
                            className={`text-xs font-semibold ${
                              isCurrent ? 'text-blue-600' : done ? 'text-slate-900' : 'text-slate-400'
                            }`}
                          >
                            {st.label}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{st.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Shipment Items */}
            <div className="px-6 py-4">
              <div className="text-xs font-semibold text-slate-500 pb-2">
                Items in This Shipment ({trackedResult.items.length})
              </div>
              <div className="divide-y divide-slate-100">
                {trackedResult.items.map((it) => (
                  <div key={it.id} className="py-3 flex items-center justify-between text-sm gap-4">
                    <div>
                      <div className="font-medium text-slate-900">{it.title}</div>
                      <div className="text-xs text-slate-500">
                        Qty {it.quantity}
                        {it.variant_label ? ` · ${it.variant_label}` : ''}
                        {' · '}
                        <span className="font-mono">{it.sku}</span>
                      </div>
                    </div>
                    <div className="font-mono tabular-nums font-medium text-slate-900">
                      {formatMoney(it.total_price, currency)}
                    </div>
                  </div>
                ))}
              </div>
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

  // Dedicated Individual Product Detail Page Subview (with ProductReviews & Submit Review form)
  if (activeRoute.startsWith('product:')) {
    if (!detailProduct) {
      return (
        <div className="max-w-4xl mx-auto px-6 py-12 space-y-4">
          <button
            type="button"
            onClick={() => onNavigateRoute('catalog')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Catalog
          </button>
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            Product not found in the catalog.
          </div>
        </div>
      );
    }

    const attrs = parseAttributes(detailProduct.attributes_json);
    const isSaved = wishlistIds.includes(detailProduct.id);
    const isCompared = compareIds.includes(detailProduct.id);
    const outOfStock = detailProduct.product_type === 'physical' && detailProduct.stock <= 0;

    return (
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <button
            type="button"
            onClick={() => onNavigateRoute('catalog')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Storefront Catalog
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{detailProduct.category_name}</span>
            <span aria-hidden="true">·</span>
            <span>{detailProduct.vendor_name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{detailProduct.sku}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 space-y-4">
              <div className="aspect-[4/3] bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                <ResilientImage
                  src={detailProduct.image_url}
                  alt={detailProduct.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {detailProduct.product_type === 'digital'
                      ? 'Instant encrypted download after checkout'
                      : 'Verified vendor stock · 30-day buyer guarantee'}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-slate-500">
                  {detailProduct.product_type === 'physical'
                    ? `${detailProduct.stock} units left`
                    : 'Digital license'}
                </span>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 text-slate-900 font-semibold">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span className="font-mono tabular-nums">{detailLiveRating.toFixed(1)}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {detailReviews.length} {detailReviews.length === 1 ? 'review' : 'reviews'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{detailProduct.product_type} Edition</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                  {detailProduct.title}
                </h1>

                <div className="flex items-baseline gap-3 pt-1">
                  <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {formatMoney(detailUnitPrice, currency)}
                  </span>
                  {detailProduct.compare_at_price && detailProduct.compare_at_price > detailProduct.price && (
                    <span className="text-sm text-slate-400 line-through font-mono tabular-nums">
                      {formatMoney(detailProduct.compare_at_price, currency)}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                {detailProduct.description || detailProduct.short_description}
              </p>

              {attrs.map((attr) => (
                <div key={attr.name} className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">{attr.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {attr.options.map((opt) => {
                      const active = detailVariant === opt.label;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            setDetailVariant(opt.label);
                            setDetailUnitPrice(Math.max(0, detailProduct.price + opt.priceDelta));
                          }}
                          className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {opt.label}
                          {opt.priceDelta !== 0 && (
                            <span className="ml-1 font-mono text-[11px] opacity-75">
                              ({opt.priceDelta > 0 ? '+' : ''}
                              {formatMoney(opt.priceDelta, currency)})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <div className="flex items-center border border-slate-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="px-3 py-2 text-sm font-mono tabular-nums">{detailQty}</span>
                  <button
                    type="button"
                    onClick={() => setDetailQty((q) => q + 1)}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={() =>
                    onAddToCart(detailProduct, detailVariant, detailUnitPrice, detailQty)
                  }
                  className="flex-1 min-w-[160px] py-3 px-5 bg-slate-900 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <ShoppingBag className="w-4 h-4" />
                  {outOfStock ? 'Out of Stock' : 'Add to Bag'}
                </button>

                {onToggleWishlist && (
                  <button
                    type="button"
                    onClick={() => onToggleWishlist(detailProduct.id)}
                    aria-label={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
                    className={`p-3 rounded-lg border transition-colors ${
                      isSaved
                        ? 'border-rose-200 bg-rose-50 text-rose-600'
                        : 'border-slate-200 text-slate-600 hover:border-rose-200 hover:text-rose-500'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
                  </button>
                )}

                {onToggleCompare && (
                  <button
                    type="button"
                    onClick={() => onToggleCompare(detailProduct.id)}
                    aria-label={isCompared ? 'Remove from compare' : 'Add to compare'}
                    className={`p-3 rounded-lg border transition-colors ${
                      isCompared
                        ? 'border-blue-600 bg-blue-50 text-blue-600'
                        : 'border-slate-200 text-slate-600 hover:border-blue-600 hover:text-blue-600'
                    }`}
                  >
                    <Scale className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <ProductReviews
            productId={detailProduct.id}
            initialRating={detailLiveRating}
            reviews={detailReviews}
            user={user}
            canReview={detailCanReview}
            onReviewsUpdated={(nextReviews, nextRating) => {
              setDetailReviews(nextReviews);
              setDetailLiveRating(nextRating);
              onDataMutated?.();
            }}
            onOpenAuth={onOpenAuth}
          />
        </div>
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

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="#catalog-grid"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  Explore Collection
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('account')}
                  className="px-3 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                >
                  Rewards
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('compare')}
                  className="px-3 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                >
                  Compare ({compareProducts.length})
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('bundles')}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                >
                  <Layers className="w-4 h-4 text-blue-600" />
                  Bundle Builder
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('track')}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                >
                  <Truck className="w-4 h-4 text-blue-600" />
                  Track Order
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('studio')}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                >
                  <Film className="w-4 h-4 text-blue-600" />
                  Motion Studio
                </button>
                {onOpenVoice && (
                  <button
                    type="button"
                    onClick={onOpenVoice}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                  >
                    <Headphones className="w-4 h-4 text-blue-600" />
                    Voice Concierge
                  </button>
                )}
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

            {/* Currency, Sort & Bundle Builder */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateRoute('bundles')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 hover:border-blue-600 text-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                Bundle Builder
              </button>

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
              <button
                type="button"
                onClick={() => {
                  setSelectedCategorySlug('bundles');
                  onNavigateRoute('catalog');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  effectiveCategorySlug === 'bundles'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bundles ({bundles.length})
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
                placeholder="Search catalog, bundles, vendor..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Uniform 3-Column Catalog Grid (Unified Bundles + Products) */}
          {filteredProducts.length === 0 && filteredBundles.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
              No products or bundles matched your current filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBundles.map((bundle) => {
                const outOfStock = bundle.available_stock <= 0;
                return (
                  <article
                    key={`bundle-${bundle.id}`}
                    className="group bg-white border border-slate-200 rounded-xl overflow-hidden transition-transform duration-150 hover:-translate-y-0.5 flex flex-col"
                  >
                    <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                      <ResilientImage
                        src={bundle.image_url}
                        alt={bundle.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                        {bundle.items.slice(0, 3).map((comp) => (
                          <div
                            key={comp.product_id}
                            className="w-9 h-9 rounded-md border border-white/95 bg-white overflow-hidden shadow-sm"
                            title={`${comp.quantity}× ${comp.title}`}
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

                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                          <span className="font-medium text-blue-700">Product Bundle</span>
                          <span aria-hidden="true">·</span>
                          <span>{bundle.items.length} Items</span>
                          <span aria-hidden="true">·</span>
                          <span>{bundle.vendor_name}</span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 line-clamp-1">
                          {bundle.title}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-2">
                          Includes: {bundle.items.map((it) => `${it.quantity}× ${it.title}`).join(' + ')}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <div className="space-y-0.5">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[15px] font-semibold font-mono text-slate-900 tabular-nums">
                              {formatMoney(bundle.bundle_price, currency)}
                            </span>
                            <span className="text-xs text-slate-400 line-through font-mono tabular-nums">
                              {formatMoney(bundle.regular_total, currency)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium tabular-nums">
                            <span>Save {bundle.discount_percent}%</span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="text-slate-500 font-normal">
                              {bundle.available_stock >= 999
                                ? 'Digital kit'
                                : `${bundle.available_stock} kits left`}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => onAddBundleToCart?.(bundle, 1)}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap disabled:opacity-40"
                        >
                          {outOfStock ? 'Sold Out' : 'Add Bundle to Bag'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {filteredProducts.map((product) => {
                const isSaved = wishlistIds.includes(product.id);
                const isCompared = compareIds.includes(product.id);
                return (
                <article
                  key={product.id}
                  className="group bg-white border border-slate-200 rounded-xl overflow-hidden transition-transform duration-150 hover:-translate-y-0.5 flex flex-col"
                >
                  <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => onNavigateRoute(`product:${product.slug}`)}
                      className="w-full h-full block text-left"
                    >
                      <ResilientImage
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </button>
                    {isSaved && (
                      <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-white/95 border border-rose-200 text-rose-600 rounded-md shadow-xs pointer-events-none">
                        <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
                        In Wishlist
                      </span>
                    )}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {onToggleCompare && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCompare(product.id);
                          }}
                          aria-label={isCompared ? `Remove ${product.title} from compare` : `Compare ${product.title}`}
                          title={isCompared ? 'In Compare' : 'Compare'}
                          className={`p-2 rounded-full border transition-colors shadow-xs ${
                            isCompared
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white/90 border-slate-200 text-slate-500 hover:text-blue-600'
                          }`}
                        >
                          <Scale className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWishlist?.(product.id);
                        }}
                        aria-label={isSaved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
                        className={`p-2 rounded-full border transition-colors shadow-xs ${
                          isSaved
                            ? 'bg-white border-rose-200 text-rose-500'
                            : 'bg-white/90 border-slate-200 text-slate-500 hover:text-rose-500'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
                      </button>
                    </div>
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
                        onClick={() => onNavigateRoute(`product:${product.slug}`)}
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

      {compareProducts.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-3xl bg-slate-900 text-white border border-slate-800 rounded-xl shadow-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Scale className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="text-xs font-medium truncate">
              Compare ({compareProducts.length}/4):{' '}
              <span className="text-slate-300">
                {compareProducts.map((p) => p.title).join(', ')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onClearCompare && (
              <button
                type="button"
                onClick={onClearCompare}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateRoute('compare')}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              Compare Side-by-Side
            </button>
          </div>
        </div>
      )}

      <ProductDetailModal
        product={activeProduct}
        currency={currency}
        user={user}
        isWishlisted={activeProduct ? wishlistIds.includes(activeProduct.id) : false}
        isCompared={activeProduct ? compareIds.includes(activeProduct.id) : false}
        onToggleWishlist={onToggleWishlist}
        onToggleCompare={onToggleCompare}
        onOpenFullPage={(p) => onNavigateRoute(`product:${p.slug}`)}
        onOpenAuth={onOpenAuth}
        onReviewSubmitted={onDataMutated}
        onClose={() => setActiveProduct(null)}
        onAddToCart={onAddToCart}
      />
    </div>
  );
};
