import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Ticket,
  Menu as MenuIcon,
  LayoutTemplate,
  FileText,
  Settings,
  Plus,
  Download,
  Upload,
  Edit3,
  Trash2,
  ArrowLeft,
  Columns3,
  List,
  Search,
  Check,
} from 'lucide-react';
import {
  Category,
  CmsPage,
  Coupon,
  CurrencyCode,
  HomepageSection,
  MenuItem,
  Order,
  Payout,
  Product,
  Vendor,
} from '../types';
import { apiRequest, getStoredToken } from '../lib/api';
import { formatMoney } from '../lib/currency';
import { ResilientImage } from './ResilientImage';
import { ProductFormModal } from './ProductFormModal';
import { DragDropMenuBuilder } from './DragDropMenuBuilder';
import { DragDropPageBuilder } from './DragDropPageBuilder';
import { OrderKanbanBoard } from './OrderKanbanBoard';

interface AdminDashboardProps {
  currency: CurrencyCode;
  onDataMutated: () => void;
  onBackToStorefront: () => void;
}

type AdminTab =
  | 'overview'
  | 'products'
  | 'orders'
  | 'vendors'
  | 'categories'
  | 'coupons'
  | 'menu-builder'
  | 'page-builder'
  | 'cms-pages'
  | 'settings';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currency,
  onDataMutated,
  onBackToStorefront,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [kpis, setKpis] = useState({
    grossRevenue: 0,
    totalCommission: 0,
    totalOrders: 0,
    productCount: 0,
    vendorCount: 0,
    customerCount: 0,
  });
  const [dailySeries, setDailySeries] = useState<Array<{ day: string; revenue: number; orders: number }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [cmsPages, setCmsPages] = useState<CmsPage[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});

  // UI states
  const [productSearch, setProductSearch] = useState('');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvText, setCsvText] = useState(
    'sku,title,product_type,price,stock\nOM-IMP-101,Studio Desk Mat Merino Felt,physical,59.00,40\nOM-IMP-102,Minimalist Brass Pen,physical,85.00,25'
  );
  const [orderViewMode, setOrderViewMode] = useState<'kanban' | 'table'>('kanban');
  const [orderSearch, setOrderSearch] = useState('');

  // Quick Add Forms
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState<'percent' | 'fixed'>('percent');
  const [couponVal, setCouponVal] = useState('15');
  const [couponMin, setCouponMin] = useState('50');

  const [cmsTitle, setCmsTitle] = useState('');
  const [cmsContent, setCmsContent] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);

  const loadAdminAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, prodRes, catRes, ordRes, venRes, coupRes, menuRes, secRes, cmsRes] = await Promise.all([
        apiRequest<{
          kpis: typeof kpis;
          dailySeries: typeof dailySeries;
          payouts: Payout[];
          settings: Record<string, string>;
        }>('/api/admin/overview'),
        apiRequest<{ products: Product[] }>('/api/admin/products'),
        apiRequest<{ categories: Category[] }>('/api/admin/categories'),
        apiRequest<{ orders: Order[] }>('/api/admin/orders'),
        apiRequest<{ vendors: Vendor[] }>('/api/admin/vendors'),
        apiRequest<{ coupons: Coupon[] }>('/api/admin/coupons'),
        apiRequest<{ menuItems: MenuItem[] }>('/api/admin/menus'),
        apiRequest<{ sections: HomepageSection[] }>('/api/admin/sections'),
        apiRequest<{ pages: CmsPage[] }>('/api/admin/cms'),
      ]);

      setKpis(ov.kpis);
      setDailySeries(ov.dailySeries);
      setPayouts(ov.payouts);
      setSettings(ov.settings);
      setProducts(prodRes.products);
      setCategories(catRes.categories);
      setOrders(ordRes.orders);
      setVendors(venRes.vendors);
      setCoupons(coupRes.coupons);
      setMenuItems(menuRes.menuItems);
      setSections(secRes.sections);
      setCmsPages(cmsRes.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin console');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminAll();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.vendor_name || '').toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_email.toLowerCase().includes(q)
    );
  }, [orders, orderSearch]);

  const handleSaveProduct = async (payload: Record<string, unknown>, existingId?: number) => {
    if (existingId) {
      await apiRequest(`/api/admin/products/${existingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await apiRequest('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    await loadAdminAll();
    onDataMutated();
  };

  const handleDeleteProduct = async (id: number) => {
    await apiRequest(`/api/admin/products/${id}`, { method: 'DELETE' });
    await loadAdminAll();
    onDataMutated();
  };

  const handleCsvDownload = async (endpoint: string, filename: string) => {
    const token = getStoredToken();
    const res = await fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/admin/products/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csvText }),
    });
    setCsvImportOpen(false);
    await loadAdminAll();
    onDataMutated();
  };

  const handleOrderStatus = async (orderId: number, status: Order['order_status']) => {
    await apiRequest(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status: status }),
    });
    await loadAdminAll();
    onDataMutated();
  };

  const handleVendorUpdate = async (id: number, updates: { status?: string; commission_rate?: number }) => {
    await apiRequest(`/api/admin/vendors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    await loadAdminAll();
    onDataMutated();
  };

  const handlePayoutAction = async (id: number, status: string) => {
    await apiRequest(`/api/admin/payouts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadAdminAll();
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    await apiRequest('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify({ name: catName, description: catDesc }),
    });
    setCatName('');
    setCatDesc('');
    await loadAdminAll();
    onDataMutated();
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await apiRequest(`/api/admin/categories/${id}`, { method: 'DELETE' });
      await loadAdminAll();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot delete category');
    }
  };

  const handleAddCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    await apiRequest('/api/admin/coupons', {
      method: 'POST',
      body: JSON.stringify({
        code: couponCode,
        type: couponType,
        value: Number(couponVal),
        min_spend: Number(couponMin),
      }),
    });
    setCouponCode('');
    await loadAdminAll();
  };

  const handleDeleteCoupon = async (id: number) => {
    await apiRequest(`/api/admin/coupons/${id}`, { method: 'DELETE' });
    await loadAdminAll();
  };

  const handleAddCmsPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmsTitle.trim() || !cmsContent.trim()) return;
    await apiRequest('/api/admin/cms', {
      method: 'POST',
      body: JSON.stringify({ title: cmsTitle, content: cmsContent }),
    });
    setCmsTitle('');
    setCmsContent('');
    await loadAdminAll();
    onDataMutated();
  };

  const handleDeleteCmsPage = async (id: number) => {
    await apiRequest(`/api/admin/cms/${id}`, { method: 'DELETE' });
    await loadAdminAll();
    onDataMutated();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
    onDataMutated();
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Analytics Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'products', label: 'Products & CSV', icon: <Package className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders & Kanban', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'vendors', label: 'Vendors & Payouts', icon: <Users className="w-4 h-4" /> },
    { id: 'categories', label: 'Categories', icon: <List className="w-4 h-4" /> },
    { id: 'coupons', label: 'Coupons & Discounts', icon: <Ticket className="w-4 h-4" /> },
    { id: 'menu-builder', label: 'Drag & Drop Menu', icon: <MenuIcon className="w-4 h-4" /> },
    { id: 'page-builder', label: 'Homepage Builder', icon: <LayoutTemplate className="w-4 h-4" /> },
    { id: 'cms-pages', label: 'CMS Pages', icon: <FileText className="w-4 h-4" /> },
    { id: 'settings', label: 'Store Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const maxRev = Math.max(1, ...dailySeries.map((d) => d.revenue));

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F8F9FB] flex">
      {/* Sidebar */}
      <aside className="w-[260px] shrink-0 bg-white border-r border-slate-200 hidden lg:flex flex-col justify-between p-4">
        <div className="space-y-5">
          <div className="px-2 pt-1">
            <div className="text-xs font-medium text-slate-400">Admin Console</div>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">OmniMart Operations</div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                {item.label}
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
            <span>Admin</span>
            <span>/</span>
            <span className="font-medium text-slate-900">
              {navItems.find((n) => n.id === tab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as AdminTab)}
              className="lg:hidden px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {navItems.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setProductModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Product
            </button>
          </div>
        </div>

        <div className="p-6 max-w-7xl space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="text-xs underline">
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* OVERVIEW */}
              {tab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Gross Merchandise Volume</div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                        {formatMoney(kpis.grossRevenue, currency)}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Platform Commission</div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                        {formatMoney(kpis.totalCommission, currency)}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Total Orders</div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                        {kpis.totalOrders}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Active Vendors · SKUs</div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                        {kpis.vendorCount} · {kpis.productCount}
                      </div>
                    </div>
                  </div>

                  {/* SVG Daily Revenue Bar Chart */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">Daily Order Revenue</h2>
                        <p className="text-xs text-slate-500">Live aggregated order totals across Storefront & POS</p>
                      </div>
                    </div>
                    <div className="h-52 flex items-end gap-4 pt-4 border-b border-slate-200 pb-2 overflow-x-auto">
                      {dailySeries.map((pt) => {
                        const heightPct = Math.max(8, Math.round((pt.revenue / maxRev) * 100));
                        return (
                          <div key={pt.day} className="flex-1 min-w-[64px] flex flex-col items-center gap-2 h-full justify-end">
                            <span className="text-[11px] font-mono text-slate-600 tabular-nums">
                              {formatMoney(pt.revenue, currency)}
                            </span>
                            <div
                              className="w-full max-w-[44px] bg-blue-600 rounded-t-md transition-all"
                              style={{ height: `${heightPct}%` }}
                            />
                            <span className="text-[11px] font-mono text-slate-400">{pt.day.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Builders Access */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      type="button"
                      onClick={() => setTab('menu-builder')}
                      className="text-left bg-white border border-slate-200 hover:border-blue-600 rounded-xl p-5 transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900">Drag & Drop Menu Builder</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Reorder storefront header navigation and nested dropdown links.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('page-builder')}
                      className="text-left bg-white border border-slate-200 hover:border-blue-600 rounded-xl p-5 transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900">Homepage Section Builder</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Drag sections to rearrange homepage hierarchy and edit campaign copy.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('orders')}
                      className="text-left bg-white border border-slate-200 hover:border-blue-600 rounded-xl p-5 transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900">Kanban Order Fulfillment</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Drag orders across Pending, Processing, Shipped, and Delivered lanes.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* PRODUCTS & CSV */}
              {tab === 'products' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[240px] max-w-md">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Search by title, SKU, or vendor..."
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCsvImportOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                      >
                        <Upload className="w-4 h-4" />
                        Import CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCsvDownload('/api/admin/products/export/csv', 'omnimart-products.csv')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {csvImportOpen && (
                    <form onSubmit={handleCsvImport} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                      <div className="text-sm font-semibold text-slate-900">Bulk CSV Product Import</div>
                      <p className="text-xs text-slate-500">
                        Paste CSV rows with columns: <code className="font-mono">sku,title,product_type,price,stock</code>
                      </p>
                      <textarea
                        rows={4}
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                        className="w-full p-3 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCsvImportOpen(false)}
                          className="px-3 py-1.5 text-xs text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg"
                        >
                          Run Import
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-medium">Product</th>
                          <th className="py-3 px-4 font-medium">Vendor</th>
                          <th className="py-3 px-4 font-medium">SKU</th>
                          <th className="py-3 px-4 font-medium">Type</th>
                          <th className="py-3 px-4 font-medium text-right">Price</th>
                          <th className="py-3 px-4 font-medium text-right">Stock</th>
                          <th className="py-3 px-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredProducts.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-9 rounded overflow-hidden bg-slate-100 shrink-0">
                                  <ResilientImage src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                                </div>
                                <div>
                                  <div className="font-medium text-slate-900">{p.title}</div>
                                  <div className="text-xs text-slate-500">{p.category_name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{p.vendor_name}</td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.sku}</td>
                            <td className="py-3 px-4 capitalize text-slate-600">{p.product_type}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                              {formatMoney(p.price, currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{p.stock}</td>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ORDERS & KANBAN */}
              {tab === 'orders' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[220px] max-w-sm">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        placeholder="Filter by order # or customer..."
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="flex items-center gap-3">
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
                          Data Table
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCsvDownload('/api/admin/orders/export/csv', 'omnimart-orders.csv')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                      >
                        <Download className="w-4 h-4" />
                        Export Orders CSV
                      </button>
                    </div>
                  </div>

                  {orderViewMode === 'kanban' ? (
                    <OrderKanbanBoard
                      orders={filteredOrders}
                      currency={currency}
                      onStatusChange={handleOrderStatus}
                    />
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4 font-medium">Order #</th>
                            <th className="py-3 px-4 font-medium">Customer</th>
                            <th className="py-3 px-4 font-medium">Source</th>
                            <th className="py-3 px-4 font-medium">Payment</th>
                            <th className="py-3 px-4 font-medium">Fulfillment</th>
                            <th className="py-3 px-4 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredOrders.map((o) => (
                            <tr key={o.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 font-mono font-semibold text-slate-900">{o.order_number}</td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-slate-900">{o.customer_name}</div>
                                <div className="text-xs text-slate-500">{o.customer_email}</div>
                              </td>
                              <td className="py-3 px-4 uppercase text-xs text-slate-500">{o.source}</td>
                              <td className="py-3 px-4 text-xs text-slate-600 uppercase">
                                {o.payment_method} · {o.payment_status}
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  value={o.order_status}
                                  onChange={(e) => handleOrderStatus(o.id, e.target.value as Order['order_status'])}
                                  className="px-2.5 py-1 text-xs border border-slate-200 rounded bg-white"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="processing">Processing</option>
                                  <option value="shipped">Shipped</option>
                                  <option value="delivered">Delivered</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                                {formatMoney(o.total, currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* VENDORS & PAYOUTS */}
              {tab === 'vendors' && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <div className="p-5 border-b border-slate-200">
                      <h2 className="text-base font-semibold text-slate-900">Marketplace Vendors</h2>
                    </div>
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-medium">Shop</th>
                          <th className="py-3 px-4 font-medium">Owner</th>
                          <th className="py-3 px-4 font-medium text-right">SKUs</th>
                          <th className="py-3 px-4 font-medium text-right">Balance</th>
                          <th className="py-3 px-4 font-medium">Commission %</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {vendors.map((v) => (
                          <tr key={v.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">{v.shop_name}</td>
                            <td className="py-3 px-4 text-slate-600">
                              {v.owner_name} · <span className="text-xs text-slate-400">{v.owner_email}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{v.product_count ?? 0}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                              {formatMoney(v.balance, currency)}
                            </td>
                            <td className="py-3 px-4">
                              <input
                                type="number"
                                min="0"
                                max="50"
                                defaultValue={v.commission_rate}
                                onBlur={(e) =>
                                  handleVendorUpdate(v.id, { commission_rate: Number(e.target.value) })
                                }
                                className="w-16 px-2 py-1 text-xs font-mono border border-slate-200 rounded"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={v.status}
                                onChange={(e) => handleVendorUpdate(v.id, { status: e.target.value })}
                                className="px-2.5 py-1 text-xs border border-slate-200 rounded bg-white"
                              >
                                <option value="active">Active</option>
                                <option value="pending">Pending</option>
                                <option value="suspended">Suspended</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <div className="p-5 border-b border-slate-200">
                      <h2 className="text-base font-semibold text-slate-900">Vendor Payout Requests</h2>
                    </div>
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-medium">Vendor</th>
                          <th className="py-3 px-4 font-medium">Method & Account</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium text-right">Amount</th>
                          <th className="py-3 px-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payouts.map((po) => (
                          <tr key={po.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">{po.shop_name}</td>
                            <td className="py-3 px-4 text-slate-600">
                              {po.method} · <span className="text-xs text-slate-400">{po.account_details}</span>
                            </td>
                            <td className="py-3 px-4 capitalize text-slate-700">{po.status}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                              {formatMoney(po.amount, currency)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {po.status === 'pending' && (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handlePayoutAction(po.id, 'paid')}
                                    className="px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                  >
                                    Mark Paid
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePayoutAction(po.id, 'rejected')}
                                    className="px-2.5 py-1 text-xs font-medium border border-slate-200 text-slate-600 rounded hover:bg-slate-50"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CATEGORIES */}
              {tab === 'categories' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <form onSubmit={handleAddCategory} className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-semibold text-slate-900">Create Category</h2>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Category Name</label>
                      <input
                        type="text"
                        required
                        value={catName}
                        onChange={(e) => setCatName(e.target.value)}
                        placeholder="e.g. Studio Furniture"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                      <input
                        type="text"
                        value={catDesc}
                        onChange={(e) => setCatDesc(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
                    >
                      Add Category
                    </button>
                  </form>

                  <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-medium">Name</th>
                          <th className="py-3 px-4 font-medium">Slug</th>
                          <th className="py-3 px-4 font-medium">Description</th>
                          <th className="py-3 px-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {categories.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">{c.name}</td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-500">{c.slug}</td>
                            <td className="py-3 px-4 text-slate-600">{c.description}</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(c.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* COUPONS */}
              {tab === 'coupons' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <form onSubmit={handleAddCoupon} className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-semibold text-slate-900">Create Promo Code</h2>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Coupon Code</label>
                      <input
                        type="text"
                        required
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="SUMMER20"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                        <select
                          value={couponType}
                          onChange={(e) => setCouponType(e.target.value as 'percent' | 'fixed')}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                        >
                          <option value="percent">Percent (%)</option>
                          <option value="fixed">Fixed ($)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
                        <input
                          type="number"
                          required
                          value={couponVal}
                          onChange={(e) => setCouponVal(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Min Spend (USD)</label>
                      <input
                        type="number"
                        value={couponMin}
                        onChange={(e) => setCouponMin(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
                    >
                      Save Coupon
                    </button>
                  </form>

                  <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-medium">Code</th>
                          <th className="py-3 px-4 font-medium">Discount</th>
                          <th className="py-3 px-4 font-medium text-right">Min Spend</th>
                          <th className="py-3 px-4 font-medium text-right">Used</th>
                          <th className="py-3 px-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {coupons.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 px-4 font-mono font-semibold text-slate-900">{c.code}</td>
                            <td className="py-3 px-4 font-mono">
                              {c.type === 'percent' ? `${c.value}%` : formatMoney(c.value, currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatMoney(c.min_spend, currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {c.used_count} / {c.usage_limit}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteCoupon(c.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DRAG & DROP MENU BUILDER */}
              {tab === 'menu-builder' && (
                <DragDropMenuBuilder
                  initialItems={menuItems}
                  categories={categories}
                  cmsPages={cmsPages}
                  onSaved={() => {
                    loadAdminAll();
                    onDataMutated();
                  }}
                />
              )}

              {/* DRAG & DROP PAGE BUILDER */}
              {tab === 'page-builder' && (
                <DragDropPageBuilder
                  initialSections={sections}
                  onSaved={() => {
                    loadAdminAll();
                    onDataMutated();
                  }}
                />
              )}

              {/* CMS PAGES */}
              {tab === 'cms-pages' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <form onSubmit={handleAddCmsPage} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-semibold text-slate-900">Publish New CMS Page</h2>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Page Title</label>
                      <input
                        type="text"
                        required
                        value={cmsTitle}
                        onChange={(e) => setCmsTitle(e.target.value)}
                        placeholder="e.g. Warranty & Repairs"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Page Content</label>
                      <textarea
                        rows={5}
                        required
                        value={cmsContent}
                        onChange={(e) => setCmsContent(e.target.value)}
                        placeholder="Enter storefront policy or editorial copy..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
                    >
                      Publish CMS Page
                    </button>
                  </form>

                  <div className="lg:col-span-7 space-y-3">
                    {cmsPages.map((pg) => (
                      <div key={pg.id} className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-900">{pg.title}</div>
                          <div className="text-xs font-mono text-slate-400">/{pg.slug}</div>
                          <p className="text-sm text-slate-600 mt-1">{pg.content}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCmsPage(pg.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SETTINGS */}
              {tab === 'settings' && (
                <form onSubmit={handleSaveSettings} className="max-w-2xl bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <h2 className="text-base font-semibold text-slate-900">Global Store Configuration</h2>
                    {settingsSaved && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Check className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Storefront Brand Name</label>
                      <input
                        type="text"
                        value={settings.store_name || ''}
                        onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Support Email</label>
                      <input
                        type="email"
                        value={settings.support_email || ''}
                        onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Tax Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={settings.tax_rate || '8'}
                        onChange={(e) => setSettings({ ...settings, tax_rate: e.target.value })}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Free Shipping Threshold (USD)</label>
                      <input
                        type="number"
                        value={settings.free_shipping_threshold || '150'}
                        onChange={(e) => setSettings({ ...settings, free_shipping_threshold: e.target.value })}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Top Announcement Banner Copy</label>
                      <input
                        type="text"
                        value={settings.announcement_text || ''}
                        onChange={(e) => setSettings({ ...settings, announcement_text: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.announcement_enabled === '1'}
                          onChange={(e) =>
                            setSettings({ ...settings, announcement_enabled: e.target.checked ? '1' : '0' })
                          }
                          className="rounded border-slate-300"
                        />
                        Show top announcement bar on storefront
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                  >
                    Save Store Settings
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </main>

      {productModalOpen && (
        <ProductFormModal
          isOpen={productModalOpen}
          onClose={() => setProductModalOpen(false)}
          onSave={handleSaveProduct}
          categories={categories}
          vendors={vendors}
          initialProduct={editingProduct}
          showVendorSelect={true}
        />
      )}
    </div>
  );
};
