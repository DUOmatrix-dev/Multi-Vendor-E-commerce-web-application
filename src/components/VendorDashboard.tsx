import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Wallet,
  Store,
  Plus,
  Edit3,
  Trash2,
  ArrowLeft,
  Columns3,
  List,
  Layers,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Category, CurrencyCode, Order, Payout, Product, ProductBundle, Vendor } from '../types';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/currency';
import { ResilientImage } from './ResilientImage';
import { ProductFormModal } from './ProductFormModal';
import { OrderKanbanBoard } from './OrderKanbanBoard';
import { BundleBuilderView } from './BundleBuilderView';

interface VendorDailySale {
  day: string;
  revenue: number;
  gross_sales: number;
  units: number;
  orders: number;
}

interface VendorTopProduct {
  id: number;
  title: string;
  sku: string;
  units_sold: number;
  net_revenue: number;
  gross_revenue: number;
}

interface VendorDashboardProps {
  currency: CurrencyCode;
  onDataMutated: () => void;
  onBackToStorefront: () => void;
}

type VendorTab = 'overview' | 'products' | 'bundles' | 'orders' | 'payouts' | 'profile';

export const VendorDashboard: React.FC<VendorDashboardProps> = ({
  currency,
  onDataMutated,
  onBackToStorefront,
}) => {
  const [tab, setTab] = useState<VendorTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendorBundles, setVendorBundles] = useState<ProductBundle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dailySales, setDailySales] = useState<VendorDailySale[]>([]);
  const [topProducts, setTopProducts] = useState<VendorTopProduct[]>([]);
  const [smaWindow, setSmaWindow] = useState<3 | 5 | 7>(3);
  const [forecastHorizon, setForecastHorizon] = useState<3 | 5 | 7>(5);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [orderViewMode, setOrderViewMode] = useState<'table' | 'kanban'>('kanban');

  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('ACH Bank Transfer');
  const [payoutDetails, setPayoutDetails] = useState('Business Checking •••• 4821');
  const [payoutNotice, setPayoutNotice] = useState('');

  const [shopName, setShopName] = useState('');
  const [shopDesc, setShopDesc] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  const [stockThreshold, setStockThreshold] = useState<number>(20);
  const [thresholdInput, setThresholdInput] = useState<string>('20');
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdNotice, setThresholdNotice] = useState('');
  const [restockingProductId, setRestockingProductId] = useState<number | null>(null);

  const loadVendorData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{
        vendor: Vendor;
        products: Product[];
        orders: Order[];
        payouts: Payout[];
        categories: Category[];
        dailySales: VendorDailySale[];
        topProducts: VendorTopProduct[];
      }>('/api/vendor/dashboard');
      setVendor(data.vendor);
      setProducts(data.products);
      setOrders(data.orders);
      setPayouts(data.payouts);
      setCategories(data.categories);
      setDailySales(data.dailySales || []);
      setTopProducts(data.topProducts || []);
      setShopName(data.vendor.shop_name);
      setShopDesc(data.vendor.description);
      const nextThreshold = Math.max(1, Number(data.vendor.low_stock_threshold ?? 20));
      setStockThreshold(nextThreshold);
      setThresholdInput(String(nextThreshold));
      const bundleRes = await apiRequest<{ bundles: ProductBundle[] }>('/api/bundles?mine=1');
      setVendorBundles(bundleRes.bundles || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load vendor dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVendorData();
  }, []);

  const handleSaveProduct = async (payload: Record<string, unknown>, existingId?: number) => {
    if (existingId) {
      await apiRequest(`/api/vendor/products/${existingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await apiRequest('/api/vendor/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    await loadVendorData();
    onDataMutated();
  };

  const handleDeleteProduct = async (id: number) => {
    setError('');
    try {
      await apiRequest(`/api/vendor/products/${id}`, { method: 'DELETE' });
      await loadVendorData();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product');
    }
  };

  const handleOrderStatus = async (orderId: number, status: Order['order_status']) => {
    setError('');
    try {
      await apiRequest(`/api/vendor/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ order_status: status }),
      });
      await loadVendorData();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order status');
    }
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayoutNotice('');
    try {
      await apiRequest('/api/vendor/payouts', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payoutAmount),
          method: payoutMethod,
          account_details: payoutDetails,
        }),
      });
      setPayoutAmount('');
      setPayoutNotice('Payout request submitted to OmniMart Finance.');
      await loadVendorData();
    } catch (err) {
      setPayoutNotice(err instanceof Error ? err.message : 'Failed to submit payout');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/vendor/profile', {
        method: 'PUT',
        body: JSON.stringify({ shop_name: shopName, description: shopDesc }),
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
      await loadVendorData();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update shop profile');
    }
  };

  const handleSaveThreshold = async (nextVal: number) => {
    const clamped = Math.min(1000, Math.max(1, Math.round(nextVal)));
    setThresholdSaving(true);
    setThresholdNotice('');
    try {
      await apiRequest<{ threshold: number }>('/api/vendor/inventory-threshold', {
        method: 'PATCH',
        body: JSON.stringify({ threshold: clamped }),
      });
      setStockThreshold(clamped);
      setThresholdInput(String(clamped));
      setThresholdNotice(`Threshold updated to ${clamped} units`);
      setTimeout(() => setThresholdNotice(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update inventory threshold');
    } finally {
      setThresholdSaving(false);
    }
  };

  const handleQuickRestock = async (product: Product, addUnits = 10) => {
    setRestockingProductId(product.id);
    try {
      await apiRequest(`/api/vendor/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({ stock: product.stock + addUnits }),
      });
      await loadVendorData();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stock');
    } finally {
      setRestockingProductId(null);
    }
  };

  const lowStockProducts = products
    .filter((p) => p.product_type === 'physical' && p.stock < stockThreshold)
    .sort((a, b) => a.stock - b.stock || a.id - b.id);

  const navItems: Array<{ id: VendorTab; label: string; icon: React.ReactNode; countBadge?: number }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" />, countBadge: lowStockProducts.length },
    { id: 'products', label: 'My Products', icon: <Package className="w-4 h-4" /> },
    { id: 'bundles', label: 'Bundle Builder', icon: <Layers className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders & Fulfillment', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'payouts', label: 'Earnings & Payouts', icon: <Wallet className="w-4 h-4" /> },
    { id: 'profile', label: 'Shop Profile', icon: <Store className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F8F9FB] flex">
      {/* Sidebar */}
      <aside className="w-[250px] shrink-0 bg-white border-r border-slate-200 hidden lg:flex flex-col justify-between p-4">
        <div className="space-y-6">
          <div className="px-2 pt-1">
            <div className="text-xs font-medium text-slate-400">Vendor Portal</div>
            <div className="text-sm font-semibold text-slate-900 truncate mt-0.5">
              {vendor?.shop_name || 'Seller Studio'}
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  {item.label}
                </span>
                {item.countBadge !== undefined && item.countBadge > 0 && (
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      tab === item.id ? 'text-amber-300' : 'text-amber-700'
                    }`}
                  >
                    {item.countBadge} low
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <button
          type="button"
          onClick={onBackToStorefront}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Storefront
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <div className="border-b border-slate-200 bg-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Vendor Studio</span>
            <span>/</span>
            <span className="font-medium text-slate-900 capitalize">{tab}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex lg:hidden items-center gap-1 overflow-x-auto">
              {navItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setTab(n.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                    tab === n.id ? 'bg-slate-900 text-white' : 'text-slate-600 bg-slate-100'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setProductModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          </div>
        </div>

        <div className="p-6 max-w-6xl space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {tab === 'overview' && vendor && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Available Balance</div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                        {formatMoney(vendor.balance, currency)}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Lifetime Net Earnings</div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                        {formatMoney(vendor.total_earnings, currency)}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Active Products</div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                        {products.length}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Platform Commission</div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                        {vendor.commission_rate}%
                      </div>
                    </div>
                  </div>

                  {/* Low-Stock Inventory Notification Panel */}
                  <section
                    aria-label="Low-Stock Inventory Notifications"
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            lowStockProducts.length > 0
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {lowStockProducts.length > 0 ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            Low-Stock Inventory Warnings
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {lowStockProducts.length > 0
                              ? `${lowStockProducts.length} physical ${
                                  lowStockProducts.length === 1 ? 'product is' : 'products are'
                                } below your alert threshold of ${stockThreshold} units.`
                              : `All physical products are stocked at or above your ${stockThreshold}-unit alert threshold.`}
                          </p>
                        </div>
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const parsed = Number(thresholdInput);
                          if (Number.isFinite(parsed) && parsed >= 1) {
                            handleSaveThreshold(parsed);
                          }
                        }}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                          {[10, 20, 30, 50].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setThresholdInput(String(preset));
                                handleSaveThreshold(preset);
                              }}
                              className={`px-2 py-1 text-[11px] font-mono rounded-md transition-colors whitespace-nowrap ${
                                stockThreshold === preset
                                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                                  : 'text-slate-500 hover:text-slate-900'
                              }`}
                            >
                              &lt;{preset}
                            </button>
                          ))}
                        </div>

                        <label htmlFor="vendor-stock-threshold" className="sr-only">
                          Low stock threshold
                        </label>
                        <input
                          id="vendor-stock-threshold"
                          type="number"
                          min={1}
                          max={1000}
                          value={thresholdInput}
                          onChange={(e) => setThresholdInput(e.target.value)}
                          className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-lg bg-white text-slate-900"
                        />
                        <button
                          type="submit"
                          disabled={thresholdSaving}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg whitespace-nowrap shrink-0"
                        >
                          {thresholdSaving ? 'Saving...' : 'Set Threshold'}
                        </button>
                        {thresholdNotice && (
                          <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">
                            {thresholdNotice}
                          </span>
                        )}
                      </form>
                    </div>

                    {lowStockProducts.length === 0 ? (
                      <div className="py-4 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                        <span>No SKUs currently require replenishment under this threshold.</span>
                        <button
                          type="button"
                          onClick={() => setTab('products')}
                          className="font-medium text-blue-600 hover:underline whitespace-nowrap"
                        >
                          View All Products
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                        {lowStockProducts.map((p) => {
                          const criticalLimit = Math.max(3, Math.floor(stockThreshold * 0.25));
                          const isOut = p.stock <= 0;
                          const isCritical = !isOut && p.stock <= criticalLimit;
                          return (
                            <div
                              key={p.id}
                              className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-white hover:bg-slate-50/70 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-9 rounded overflow-hidden bg-slate-100 shrink-0">
                                  <ResilientImage
                                    src={p.image_url}
                                    alt={p.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-slate-900 truncate">{p.title}</div>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span className="font-mono">{p.sku}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{p.category_name || 'Catalog'}</span>
                                    <span aria-hidden="true">·</span>
                                    <span
                                      className={`inline-flex items-center gap-1 font-medium ${
                                        isOut || isCritical ? 'text-red-700' : 'text-amber-700'
                                      }`}
                                    >
                                      <AlertTriangle className="w-3 h-3 shrink-0" />
                                      {isOut ? 'Out of Stock' : isCritical ? 'Critical Stock' : 'Low Stock'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 shrink-0">
                                <div className="text-right">
                                  <div
                                    className={`text-sm font-mono font-bold tabular-nums ${
                                      isOut || isCritical ? 'text-red-700' : 'text-amber-700'
                                    }`}
                                  >
                                    {p.stock} units left
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                                    Threshold: {stockThreshold}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={restockingProductId === p.id}
                                    onClick={() => handleQuickRestock(p, 10)}
                                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg whitespace-nowrap shrink-0"
                                  >
                                    {restockingProductId === p.id ? 'Updating...' : 'Restock +10'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProduct(p);
                                      setProductModalOpen(true);
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-lg whitespace-nowrap shrink-0"
                                  >
                                    Edit
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Sales Trends, Simple Moving Average Forecast & Top Products Data Visualization */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {(() => {
                      const sorted = [...dailySales].sort((a, b) => a.day.localeCompare(b.day));
                      const byDay = new Map(sorted.map((d) => [d.day, d]));

                      const contiguousActual: Array<{ day: string; revenue: number }> = [];
                      if (sorted.length > 0) {
                        const startMs = new Date(`${sorted[0].day}T12:00:00Z`).getTime();
                        const endMs = new Date(`${sorted[sorted.length - 1].day}T12:00:00Z`).getTime();
                        const oneDay = 24 * 60 * 60 * 1000;
                        for (let ts = startMs; ts <= endMs; ts += oneDay) {
                          const iso = new Date(ts).toISOString().slice(0, 10);
                          contiguousActual.push({
                            day: iso,
                            revenue: Number((byDay.get(iso)?.revenue || 0).toFixed(2)),
                          });
                        }
                      }

                      const combinedValues = contiguousActual.map((d) => d.revenue);
                      const chartData: Array<{
                        day: string;
                        actualRevenue: number | null;
                        movingAverage: number | null;
                        forecastRevenue: number | null;
                        isForecast: boolean;
                      }> = contiguousActual.map((entry, idx) => {
                        const startIdx = Math.max(0, idx - smaWindow + 1);
                        const slice = combinedValues.slice(startIdx, idx + 1);
                        const smaVal = Number(
                          (slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(2)
                        );
                        return {
                          day: entry.day,
                          actualRevenue: entry.revenue,
                          movingAverage: smaVal,
                          forecastRevenue: idx === contiguousActual.length - 1 ? smaVal : null,
                          isForecast: false,
                        };
                      });

                      const lastActualDay = contiguousActual[contiguousActual.length - 1]?.day || '';
                      const trailingSmaDaily =
                        chartData.length > 0 ? chartData[chartData.length - 1].movingAverage || 0 : 0;

                      let projectedTotal = 0;
                      if (lastActualDay) {
                        const lastMs = new Date(`${lastActualDay}T12:00:00Z`).getTime();
                        const oneDay = 24 * 60 * 60 * 1000;
                        const rollingWindow = [...combinedValues];
                        for (let step = 1; step <= forecastHorizon; step++) {
                          const recent = rollingWindow.slice(-smaWindow);
                          const predicted = Number(
                            (recent.reduce((s, v) => s + v, 0) / Math.max(1, recent.length)).toFixed(2)
                          );
                          rollingWindow.push(predicted);
                          projectedTotal += predicted;
                          const futureIso = new Date(lastMs + step * oneDay).toISOString().slice(0, 10);
                          chartData.push({
                            day: futureIso,
                            actualRevenue: null,
                            movingAverage: null,
                            forecastRevenue: predicted,
                            isForecast: true,
                          });
                        }
                      }

                      return (
                        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h2 className="text-base font-semibold text-slate-900">
                                Daily Net Revenue &amp; Sales Forecast
                              </h2>
                              <p className="text-xs text-slate-500">
                                {smaWindow}-day Simple Moving Average (SMA) · +{forecastHorizon}-day projection
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                {([3, 5, 7] as const).map((w) => (
                                  <button
                                    key={w}
                                    type="button"
                                    onClick={() => setSmaWindow(w)}
                                    className={`px-2 py-1 rounded-md font-mono text-[11px] whitespace-nowrap transition-colors ${
                                      smaWindow === w
                                        ? 'bg-white text-slate-900 font-semibold shadow-xs'
                                        : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                  >
                                    {w}D SMA
                                  </button>
                                ))}
                              </div>
                              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                {([3, 5, 7] as const).map((h) => (
                                  <button
                                    key={h}
                                    type="button"
                                    onClick={() => setForecastHorizon(h)}
                                    className={`px-2 py-1 rounded-md font-mono text-[11px] whitespace-nowrap transition-colors ${
                                      forecastHorizon === h
                                        ? 'bg-white text-emerald-700 font-semibold shadow-xs'
                                        : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                  >
                                    +{h}D
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {dailySales.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                                <div className="text-slate-500">{smaWindow}-Day SMA Run Rate</div>
                                <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                                  {formatMoney(trailingSmaDaily, currency)}/day
                                </div>
                              </div>
                              <div className="px-3 py-2 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                                <div className="text-emerald-800">Next {forecastHorizon} Days Forecast</div>
                                <div className="font-mono font-bold text-emerald-900 tabular-nums mt-0.5">
                                  {formatMoney(projectedTotal, currency)}
                                </div>
                              </div>
                              <div className="hidden sm:block px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                                <div className="text-slate-500">Observed Window</div>
                                <div className="font-mono font-semibold text-slate-800 tabular-nums mt-0.5">
                                  {contiguousActual.length} days ({dailySales.length} active)
                                </div>
                              </div>
                            </div>
                          )}

                          {dailySales.length === 0 ? (
                            <div className="h-64 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
                              No sales recorded yet for this shop.
                            </div>
                          ) : (
                            <div className="h-72 w-full min-w-0">
                              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id="vendorRevenueFill" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                  <XAxis
                                    dataKey="day"
                                    tickFormatter={(d: string) => d.slice(5)}
                                    tick={{ fontSize: 11, fill: '#64748B' }}
                                    axisLine={{ stroke: '#E2E8F0' }}
                                    tickLine={false}
                                  />
                                  <YAxis
                                    tickFormatter={(v: number) => `$${v}`}
                                    tick={{ fontSize: 11, fill: '#64748B' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={56}
                                  />
                                  <Tooltip
                                    formatter={(value, name) => [
                                      formatMoney(Number(value ?? 0), currency),
                                      String(name),
                                    ]}
                                    labelFormatter={(label) => `Date: ${String(label)}`}
                                    contentStyle={{
                                      borderRadius: '8px',
                                      border: '1px solid #E2E8F0',
                                      fontSize: '12px',
                                    }}
                                  />
                                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                                  {lastActualDay && (
                                    <ReferenceLine
                                      x={lastActualDay}
                                      stroke="#94A3B8"
                                      strokeDasharray="3 3"
                                    />
                                  )}
                                  <Area
                                    type="monotone"
                                    dataKey="actualRevenue"
                                    name="Actual Net Revenue"
                                    stroke="#2563EB"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#vendorRevenueFill)"
                                    connectNulls={false}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="movingAverage"
                                    name={`${smaWindow}D Moving Avg`}
                                    stroke="#0F172A"
                                    strokeWidth={1.75}
                                    dot={false}
                                    connectNulls={false}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="forecastRevenue"
                                    name={`Forecast (+${forecastHorizon}D SMA)`}
                                    stroke="#059669"
                                    strokeWidth={2.25}
                                    strokeDasharray="5 4"
                                    dot={{ r: 3, fill: '#059669' }}
                                    connectNulls={true}
                                  />
                                </ComposedChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">Top-Performing Products</h2>
                          <p className="text-xs text-slate-500">Ranked by net payout earned</p>
                        </div>
                        <span className="text-xs font-mono text-slate-500 tabular-nums">
                          Top {topProducts.length}
                        </span>
                      </div>

                      {topProducts.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
                          Add products to track SKU performance.
                        </div>
                      ) : (
                        <div className="h-64 w-full min-w-0">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <BarChart
                              data={topProducts.map((tp) => ({
                                ...tp,
                                shortTitle: tp.title.length > 16 ? `${tp.title.slice(0, 16)}…` : tp.title,
                              }))}
                              layout="vertical"
                              margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                              <XAxis
                                type="number"
                                tickFormatter={(v: number) => `$${v}`}
                                tick={{ fontSize: 11, fill: '#64748B' }}
                                axisLine={{ stroke: '#E2E8F0' }}
                                tickLine={false}
                              />
                              <YAxis
                                type="category"
                                dataKey="shortTitle"
                                width={118}
                                tick={{ fontSize: 11, fill: '#334155' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                formatter={(value, name) =>
                                  name === 'net_revenue'
                                    ? [formatMoney(Number(value ?? 0), currency), 'Net Revenue']
                                    : [Number(value ?? 0), 'Units Sold']
                                }
                                contentStyle={{
                                  borderRadius: '8px',
                                  border: '1px solid #E2E8F0',
                                  fontSize: '12px',
                                }}
                              />
                              <Bar dataKey="net_revenue" fill="#0F172A" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold text-slate-900">Recent Fulfillment Queue</h2>
                      <button
                        type="button"
                        onClick={() => setTab('orders')}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Open Kanban Board
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 pr-4 font-medium">Order</th>
                            <th className="py-2.5 px-4 font-medium">Customer</th>
                            <th className="py-2.5 px-4 font-medium">Status</th>
                            <th className="py-2.5 pl-4 font-medium text-right">Vendor Payout</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {orders.slice(0, 6).map((o) => {
                            const netPayout = (o.items || []).reduce((s, it) => s + it.vendor_payout, 0);
                            return (
                              <tr key={o.id} className="hover:bg-slate-50">
                                <td className="py-3 pr-4 font-mono font-medium text-slate-900">{o.order_number}</td>
                                <td className="py-3 px-4 text-slate-700">{o.customer_name}</td>
                                <td className="py-3 px-4 capitalize text-slate-600">{o.order_status}</td>
                                <td className="py-3 pl-4 text-right font-mono tabular-nums font-medium text-slate-900">
                                  {formatMoney(netPayout, currency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'products' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-900">Shop Catalog ({products.length})</h2>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      Low-stock threshold: &lt;{stockThreshold} units ({lowStockProducts.length} flagged)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-medium">Product</th>
                          <th className="py-3 px-4 font-medium">SKU</th>
                          <th className="py-3 px-4 font-medium">Type</th>
                          <th className="py-3 px-4 font-medium text-right">Price</th>
                          <th className="py-3 px-4 font-medium text-right">Stock</th>
                          <th className="py-3 px-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {products.map((p) => {
                          const isLow = p.product_type === 'physical' && p.stock < stockThreshold;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-11 h-9 rounded overflow-hidden bg-slate-100 shrink-0">
                                    <ResilientImage src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                                  </div>
                                  <span className="font-medium text-slate-900">{p.title}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.sku}</td>
                              <td className="py-3 px-4 capitalize text-slate-600">{p.product_type}</td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                                {formatMoney(p.price, currency)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                <div className="inline-flex items-center justify-end gap-2">
                                  {isLow && (
                                    <span
                                      className={`inline-flex items-center gap-1 text-[11px] font-sans font-medium ${
                                        p.stock <= 0 ? 'text-red-700' : 'text-amber-700'
                                      }`}
                                    >
                                      <AlertTriangle className="w-3 h-3 shrink-0" />
                                      {p.stock <= 0 ? 'Out' : 'Low'}
                                    </span>
                                  )}
                                  <span className={isLow ? 'font-semibold text-amber-800' : 'text-slate-900'}>
                                    {p.stock}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProduct(p);
                                      setProductModalOpen(true);
                                    }}
                                    className="p-1.5 text-slate-500 hover:text-blue-600 rounded"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProduct(p.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'bundles' && vendor && (
                <BundleBuilderView
                  products={products.map((p) => ({ ...p, vendor_name: vendor.shop_name }))}
                  bundles={vendorBundles}
                  currency={currency}
                  user={{
                    id: vendor.user_id,
                    name: vendor.shop_name,
                    email: vendor.owner_email || '',
                    role: 'vendor',
                  }}
                  vendorIdScope={vendor.id}
                  embeddedInPortal
                  onDataMutated={() => {
                    loadVendorData();
                    onDataMutated();
                  }}
                />
              )}

              {tab === 'orders' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">Vendor Fulfillment</h2>
                      <p className="text-xs text-slate-500">Drag order cards between stages to update shipping status</p>
                    </div>
                    <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setOrderViewMode('kanban')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium ${
                          orderViewMode === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        <Columns3 className="w-3.5 h-3.5" />
                        Drag & Drop Board
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderViewMode('table')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium ${
                          orderViewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        Table
                      </button>
                    </div>
                  </div>

                  {orderViewMode === 'kanban' ? (
                    <OrderKanbanBoard orders={orders} currency={currency} onStatusChange={handleOrderStatus} />
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4 font-medium">Order</th>
                            <th className="py-3 px-4 font-medium">Customer</th>
                            <th className="py-3 px-4 font-medium">Items</th>
                            <th className="py-3 px-4 font-medium">Status</th>
                            <th className="py-3 px-4 font-medium text-right">Net Payout</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {orders.map((o) => {
                            const netPayout = (o.items || []).reduce((s, it) => s + it.vendor_payout, 0);
                            return (
                              <tr key={o.id}>
                                <td className="py-3 px-4 font-mono font-medium">{o.order_number}</td>
                                <td className="py-3 px-4">{o.customer_name}</td>
                                <td className="py-3 px-4 text-slate-600">
                                  {(o.items || []).map((i) => `${i.title} ×${i.quantity}`).join(', ')}
                                </td>
                                <td className="py-3 px-4">
                                  <select
                                    value={o.order_status}
                                    onChange={(e) => handleOrderStatus(o.id, e.target.value as Order['order_status'])}
                                    className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                                  >
                                    <option value="pending">Pending</option>
                                    <option value="processing">Processing</option>
                                    <option value="shipped">Shipped</option>
                                    <option value="delivered">Delivered</option>
                                  </select>
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                                  {formatMoney(netPayout, currency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === 'payouts' && vendor && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <form onSubmit={handleRequestPayout} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-semibold text-slate-900">Request Withdrawal</h2>
                    <div className="text-xs text-slate-500">
                      Available balance:{' '}
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatMoney(vendor.balance, currency)}
                      </span>
                    </div>
                    {payoutNotice && (
                      <div className="p-3 bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-lg">
                        {payoutNotice}
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Amount (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        max={vendor.balance}
                        required
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        placeholder="250.00"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Payout Method</label>
                      <select
                        value={payoutMethod}
                        onChange={(e) => setPayoutMethod(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="ACH Bank Transfer">ACH Bank Transfer</option>
                        <option value="Wire Transfer">Wire Transfer</option>
                        <option value="PayPal Business">PayPal Business</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Account Details</label>
                      <input
                        type="text"
                        required
                        value={payoutDetails}
                        onChange={(e) => setPayoutDetails(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
                    >
                      Submit Payout Request
                    </button>
                  </form>

                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-5 border-b border-slate-200">
                      <h2 className="text-base font-semibold text-slate-900">Payout History</h2>
                    </div>
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4 font-medium">Method</th>
                          <th className="py-2.5 px-4 font-medium">Account</th>
                          <th className="py-2.5 px-4 font-medium">Status</th>
                          <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payouts.map((po) => (
                          <tr key={po.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">{po.method}</td>
                            <td className="py-3 px-4 text-slate-600 text-xs">{po.account_details}</td>
                            <td className="py-3 px-4 capitalize text-slate-700">{po.status}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                              {formatMoney(po.amount, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'profile' && vendor && (
                <form onSubmit={handleSaveProfile} className="max-w-xl bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-semibold text-slate-900">Storefront Seller Profile</h2>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Shop Name</label>
                    <input
                      type="text"
                      required
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Shop Description</label>
                    <textarea
                      rows={3}
                      value={shopDesc}
                      onChange={(e) => setShopDesc(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                    >
                      Save Shop Profile
                    </button>
                    {profileSaved && <span className="text-xs text-emerald-700 font-medium">Profile updated</span>}
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </main>

      {productModalOpen && (
        <ProductFormModal
          key={editingProduct?.id ?? 'new'}
          isOpen={productModalOpen}
          onClose={() => setProductModalOpen(false)}
          onSave={handleSaveProduct}
          categories={categories}
          initialProduct={editingProduct}
        />
      )}
    </div>
  );
};
