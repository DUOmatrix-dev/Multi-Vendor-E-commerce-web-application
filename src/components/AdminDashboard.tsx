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
  Sun,
  Moon,
  Flag,
  Clock,
  Gift,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Category,
  CmsPage,
  Coupon,
  CurrencyCode,
  HomepageSection,
  MenuItem,
  Order,
  OrderTag,
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

const ADMIN_THEME_STORAGE_KEY = 'omnimart_admin_theme';

const ORDER_TAGS: OrderTag[] = ['Priority', 'Backorder', 'Gift'];

const ORDER_TAG_STYLE: Record<
  OrderTag,
  { icon: React.ReactNode; active: string; inactive: string }
> = {
  Priority: {
    icon: <Flag className="w-3 h-3 shrink-0" />,
    active:
      'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
    inactive:
      'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700 dark:hover:text-slate-200',
  },
  Backorder: {
    icon: <Clock className="w-3 h-3 shrink-0" />,
    active:
      'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    inactive:
      'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700 dark:hover:text-slate-200',
  },
  Gift: {
    icon: <Gift className="w-3 h-3 shrink-0" />,
    active:
      'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    inactive:
      'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700 dark:hover:text-slate-200',
  },
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currency,
  onDataMutated,
  onBackToStorefront,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
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
  const [orderTagFilter, setOrderTagFilter] = useState<'all' | OrderTag | 'untagged'>('all');

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
    try {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, theme);
    } catch {
      // ignore localStorage write errors
    }
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, []);

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
    return orders.filter((o) => {
      const tags = o.tags || [];
      if (orderTagFilter === 'untagged' && tags.length > 0) return false;
      if (
        orderTagFilter !== 'all' &&
        orderTagFilter !== 'untagged' &&
        !tags.includes(orderTagFilter)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_email.toLowerCase().includes(q) ||
        tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [orders, orderSearch, orderTagFilter]);

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
    setError('');
    try {
      await apiRequest(`/api/admin/products/${id}`, { method: 'DELETE' });
      await loadAdminAll();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete product');
    }
  };

  const handleCsvDownload = async (endpoint: string, filename: string) => {
    setError('');
    try {
      const token = getStoredToken();
      const res = await fetch(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Failed to export ${filename}`);
      }
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download CSV export');
    }
  };

  const handleExportSalesReport = () => {
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const headers = ['Date', 'Orders', 'Revenue (USD)', `Revenue (${currency})`];
    const rows = dailySeries.map((pt) => [
      escapeCsv(pt.day),
      escapeCsv(pt.orders),
      escapeCsv(Number(pt.revenue || 0).toFixed(2)),
      escapeCsv(formatMoney(pt.revenue, currency)),
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnimart-sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/products/import/csv', {
        method: 'POST',
        body: JSON.stringify({ csvText }),
      });
      setCsvImportOpen(false);
      await loadAdminAll();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import CSV products');
    }
  };

  const handleOrderStatus = async (orderId: number, status: Order['order_status']) => {
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ order_status: status }),
      });
      await loadAdminAll();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update order status');
    }
  };

  const handleOrderTags = async (orderId: number, tags: OrderTag[]) => {
    const prevOrders = orders;
    setOrders((curr) => curr.map((o) => (o.id === orderId ? { ...o, tags } : o)));
    try {
      const res = await apiRequest<{ order: Order }>(`/api/admin/orders/${orderId}/tags`, {
        method: 'PATCH',
        body: JSON.stringify({ tags }),
      });
      if (res.order) {
        setOrders((curr) => curr.map((o) => (o.id === orderId ? { ...o, tags: res.order.tags || [] } : o)));
      }
      onDataMutated();
    } catch (err) {
      setOrders(prevOrders);
      setError(err instanceof Error ? err.message : 'Unable to update order tags');
    }
  };

  const handleVendorUpdate = async (id: number, updates: { status?: string; commission_rate?: number }) => {
    setError('');
    try {
      await apiRequest(`/api/admin/vendors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      await loadAdminAll();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update vendor');
    }
  };

  const handlePayoutAction = async (id: number, status: string) => {
    setError('');
    try {
      await apiRequest(`/api/admin/payouts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadAdminAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update payout status');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setError('');
    try {
      await apiRequest('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName, description: catDesc }),
      });
      setCatName('');
      setCatDesc('');
      await loadAdminAll();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create category');
    }
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
    setError('');
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create coupon');
    }
  };

  const handleDeleteCoupon = async (id: number) => {
    setError('');
    try {
      await apiRequest(`/api/admin/coupons/${id}`, { method: 'DELETE' });
      await loadAdminAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete coupon');
    }
  };

  const handleAddCmsPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmsTitle.trim() || !cmsContent.trim()) return;
    setError('');
    try {
      await apiRequest('/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({ title: cmsTitle, content: cmsContent }),
      });
      setCmsTitle('');
      setCmsContent('');
      await loadAdminAll();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create CMS page');
    }
  };

  const handleDeleteCmsPage = async (id: number) => {
    setError('');
    try {
      await apiRequest(`/api/admin/cms/${id}`, { method: 'DELETE' });
      await loadAdminAll();
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete CMS page');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save store settings');
    }
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

  const isDark = theme === 'dark';

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F8F9FB] dark:bg-slate-950 flex transition-colors">
      {/* Sidebar */}
      <aside className="w-[260px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 hidden lg:flex flex-col justify-between p-4 transition-colors">
        <div className="space-y-5">
          <div className="px-2 pt-1">
            <div className="text-xs font-medium text-slate-400 dark:text-slate-500">Admin Console</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">OmniMart Operations</div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
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
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Storefront
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-4 transition-colors">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>Admin</span>
            <span>/</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {navItems.find((n) => n.id === tab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as AdminTab)}
              className="lg:hidden px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {navItems.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-pressed={isDark}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
              {isDark ? 'Light' : 'Dark'}
            </button>

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
            <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="text-xs underline">
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* OVERVIEW */}
              {tab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Gross Merchandise Volume</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                        {formatMoney(kpis.grossRevenue, currency)}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Platform Commission</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                        {formatMoney(kpis.totalCommission, currency)}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Orders</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                        {kpis.totalOrders}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Vendors · SKUs</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                        {kpis.vendorCount} · {kpis.productCount}
                      </div>
                    </div>
                  </div>

                  {/* Recharts Daily Revenue Visualization */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Daily Order Revenue</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Live aggregated order totals across Storefront &amp; POS
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {dailySeries.length} active days
                        </span>
                        <button
                          type="button"
                          onClick={handleExportSalesReport}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Export Sales Report
                        </button>
                      </div>
                    </div>

                    {dailySeries.length === 0 ? (
                      <div className="h-64 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                        No order sales data available yet.
                      </div>
                    ) : (
                      <div className="h-64 w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <AreaChart data={dailySeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="adminRevenueFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563EB" stopOpacity={isDark ? 0.35 : 0.22} />
                                <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={isDark ? '#1E293B' : '#E2E8F0'}
                              vertical={false}
                            />
                            <XAxis
                              dataKey="day"
                              tickFormatter={(d: string) => d.slice(5)}
                              tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }}
                              axisLine={{ stroke: isDark ? '#334155' : '#E2E8F0' }}
                              tickLine={false}
                            />
                            <YAxis
                              tickFormatter={(v: number) => `$${v}`}
                              tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }}
                              axisLine={false}
                              tickLine={false}
                              width={60}
                            />
                            <Tooltip
                              formatter={(value, _name, item) => [
                                `${formatMoney(Number(value ?? 0), currency)} (${item?.payload?.orders ?? 0} orders)`,
                                'Revenue',
                              ]}
                              labelFormatter={(label) => `Date: ${String(label)}`}
                              contentStyle={{
                                borderRadius: '8px',
                                border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                                backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                                color: isDark ? '#F8FAFC' : '#0F172A',
                                fontSize: '12px',
                              }}
                              itemStyle={{
                                color: isDark ? '#93C5FD' : '#2563EB',
                              }}
                              labelStyle={{
                                color: isDark ? '#CBD5E1' : '#475569',
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="revenue"
                              stroke="#2563EB"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#adminRevenueFill)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Quick Builders Access */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      type="button"
                      onClick={() => setTab('menu-builder')}
                      className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-xl p-5 transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Drag & Drop Menu Builder</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Reorder storefront header navigation and nested dropdown links.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('page-builder')}
                      className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-xl p-5 transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Homepage Section Builder</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Drag sections to rearrange homepage hierarchy and edit campaign copy.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('orders')}
                      className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-xl p-5 transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Kanban Order Fulfillment</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCsvImportOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                      >
                        <Upload className="w-4 h-4" />
                        Import CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCsvDownload('/api/admin/products/export/csv', 'omnimart-products.csv')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {csvImportOpen && (
                    <form onSubmit={handleCsvImport} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bulk CSV Product Import</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Paste CSV rows with columns: <code className="font-mono">sku,title,product_type,price,stock</code>
                      </p>
                      <textarea
                        rows={4}
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                        className="w-full p-3 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCsvImportOpen(false)}
                          className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium rounded-lg"
                        >
                          Run Import
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
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
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredProducts.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-9 rounded overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                                  <ResilientImage src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                                </div>
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-slate-100">{p.title}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">{p.category_name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{p.vendor_name}</td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">{p.sku}</td>
                            <td className="py-3 px-4 capitalize text-slate-600 dark:text-slate-300">{p.product_type}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                              {formatMoney(p.price, currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">{p.stock}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProduct(p);
                                    setProductModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded"
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
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg text-xs">
                        <button
                          type="button"
                          onClick={() => setOrderViewMode('kanban')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium ${
                            orderViewMode === 'kanban'
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <Columns3 className="w-3.5 h-3.5" />
                          Drag & Drop Board
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderViewMode('table')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium ${
                            orderViewMode === 'table'
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" />
                          Data Table
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCsvDownload('/api/admin/orders/export/csv', 'omnimart-orders.csv')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                      >
                        <Download className="w-4 h-4" />
                        Export Orders CSV
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'All Orders', count: orders.length },
                        ...ORDER_TAGS.map((tag) => ({
                          id: tag,
                          label: tag,
                          count: orders.filter((o) => (o.tags || []).includes(tag)).length,
                        })),
                        {
                          id: 'untagged',
                          label: 'Untagged',
                          count: orders.filter((o) => (o.tags || []).length === 0).length,
                        },
                      ] as const
                    ).map((f) => {
                      const active = orderTagFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setOrderTagFilter(f.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <span>{f.label}</span>
                          <span
                            className={`font-mono tabular-nums text-[11px] ${
                              active ? 'text-slate-200' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {f.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {orderViewMode === 'kanban' ? (
                    <OrderKanbanBoard
                      orders={filteredOrders}
                      currency={currency}
                      onStatusChange={handleOrderStatus}
                      onTagsChange={handleOrderTags}
                    />
                  ) : (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-3 px-4 font-medium">Order #</th>
                            <th className="py-3 px-4 font-medium">Customer</th>
                            <th className="py-3 px-4 font-medium">Order Tags</th>
                            <th className="py-3 px-4 font-medium">Source</th>
                            <th className="py-3 px-4 font-medium">Payment</th>
                            <th className="py-3 px-4 font-medium">Fulfillment</th>
                            <th className="py-3 px-4 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredOrders.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                                No orders match the current search or tag filter.
                              </td>
                            </tr>
                          ) : (
                            filteredOrders.map((o) => {
                              const activeTags = o.tags || [];
                              return (
                                <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                    {o.order_number}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-medium text-slate-900 dark:text-slate-100">{o.customer_name}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">{o.customer_email}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {ORDER_TAGS.map((tag) => {
                                        const isActive = activeTags.includes(tag);
                                        const style = ORDER_TAG_STYLE[tag];
                                        return (
                                          <button
                                            key={tag}
                                            type="button"
                                            aria-pressed={isActive}
                                            onClick={() => {
                                              const nextTags = isActive
                                                ? activeTags.filter((t) => t !== tag)
                                                : [...activeTags, tag];
                                              handleOrderTags(o.id, nextTags);
                                            }}
                                            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                              isActive ? style.active : style.inactive
                                            }`}
                                          >
                                            {style.icon}
                                            {tag}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 uppercase text-xs text-slate-500 dark:text-slate-400">{o.source}</td>
                                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 uppercase whitespace-nowrap">
                                    {o.payment_method} · {o.payment_status}
                                  </td>
                                  <td className="py-3 px-4">
                                    <select
                                      value={o.order_status}
                                      onChange={(e) => handleOrderStatus(o.id, e.target.value as Order['order_status'])}
                                      className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="processing">Processing</option>
                                      <option value="shipped">Shipped</option>
                                      <option value="delivered">Delivered</option>
                                      <option value="cancelled">Cancelled</option>
                                    </select>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                    {formatMoney(o.total, currency)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* VENDORS & PAYOUTS */}
              {tab === 'vendors' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                    <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Marketplace Vendors</h2>
                    </div>
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4 font-medium">Shop</th>
                          <th className="py-3 px-4 font-medium">Owner</th>
                          <th className="py-3 px-4 font-medium text-right">SKUs</th>
                          <th className="py-3 px-4 font-medium text-right">Balance</th>
                          <th className="py-3 px-4 font-medium">Commission %</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {vendors.map((v) => (
                          <tr key={v.id}>
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{v.shop_name}</td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                              {v.owner_name} · <span className="text-xs text-slate-400">{v.owner_email}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">{v.product_count ?? 0}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
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
                                className="w-16 px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={v.status}
                                onChange={(e) => handleVendorUpdate(v.id, { status: e.target.value })}
                                className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
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

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                    <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Vendor Payout Requests</h2>
                    </div>
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4 font-medium">Vendor</th>
                          <th className="py-3 px-4 font-medium">Method & Account</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium text-right">Amount</th>
                          <th className="py-3 px-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {payouts.map((po) => (
                          <tr key={po.id}>
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{po.shop_name}</td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                              {po.method} · <span className="text-xs text-slate-400">{po.account_details}</span>
                            </td>
                            <td className="py-3 px-4 capitalize text-slate-700 dark:text-slate-300">{po.status}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
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
                                    className="px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
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
                  <form onSubmit={handleAddCategory} className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Create Category</h2>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category Name</label>
                      <input
                        type="text"
                        required
                        value={catName}
                        onChange={(e) => setCatName(e.target.value)}
                        placeholder="e.g. Studio Furniture"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
                      <input
                        type="text"
                        value={catDesc}
                        onChange={(e) => setCatDesc(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                    >
                      Add Category
                    </button>
                  </form>

                  <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4 font-medium">Name</th>
                          <th className="py-3 px-4 font-medium">Slug</th>
                          <th className="py-3 px-4 font-medium">Description</th>
                          <th className="py-3 px-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {categories.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{c.name}</td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">{c.slug}</td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{c.description}</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(c.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
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
                  <form onSubmit={handleAddCoupon} className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Create Promo Code</h2>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Coupon Code</label>
                      <input
                        type="text"
                        required
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="SUMMER20"
                        className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Type</label>
                        <select
                          value={couponType}
                          onChange={(e) => setCouponType(e.target.value as 'percent' | 'fixed')}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        >
                          <option value="percent">Percent (%)</option>
                          <option value="fixed">Fixed ($)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Value</label>
                        <input
                          type="number"
                          required
                          value={couponVal}
                          onChange={(e) => setCouponVal(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Min Spend (USD)</label>
                      <input
                        type="number"
                        value={couponMin}
                        onChange={(e) => setCouponMin(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                    >
                      Save Coupon
                    </button>
                  </form>

                  <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4 font-medium">Code</th>
                          <th className="py-3 px-4 font-medium">Discount</th>
                          <th className="py-3 px-4 font-medium text-right">Min Spend</th>
                          <th className="py-3 px-4 font-medium text-right">Used</th>
                          <th className="py-3 px-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {coupons.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">{c.code}</td>
                            <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                              {c.type === 'percent' ? `${c.value}%` : formatMoney(c.value, currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                              {formatMoney(c.min_spend, currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {c.used_count} / {c.usage_limit}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteCoupon(c.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
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
                  <form onSubmit={handleAddCmsPage} className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Publish New CMS Page</h2>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Page Title</label>
                      <input
                        type="text"
                        required
                        value={cmsTitle}
                        onChange={(e) => setCmsTitle(e.target.value)}
                        placeholder="e.g. Warranty & Repairs"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Page Content</label>
                      <textarea
                        rows={5}
                        required
                        value={cmsContent}
                        onChange={(e) => setCmsContent(e.target.value)}
                        placeholder="Enter storefront policy or editorial copy..."
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                    >
                      Publish CMS Page
                    </button>
                  </form>

                  <div className="lg:col-span-7 space-y-3">
                    {cmsPages.map((pg) => (
                      <div key={pg.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{pg.title}</div>
                          <div className="text-xs font-mono text-slate-400">/{pg.slug}</div>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{pg.content}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCmsPage(pg.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
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
                <form onSubmit={handleSaveSettings} className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Global Store Configuration</h2>
                    {settingsSaved && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Storefront Brand Name</label>
                      <input
                        type="text"
                        value={settings.store_name || ''}
                        onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Support Email</label>
                      <input
                        type="email"
                        value={settings.support_email || ''}
                        onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tax Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={settings.tax_rate || '8'}
                        onChange={(e) => setSettings({ ...settings, tax_rate: e.target.value })}
                        className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Free Shipping Threshold (USD)</label>
                      <input
                        type="number"
                        value={settings.free_shipping_threshold || '150'}
                        onChange={(e) => setSettings({ ...settings, free_shipping_threshold: e.target.value })}
                        className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Top Announcement Banner Copy</label>
                      <input
                        type="text"
                        value={settings.announcement_text || ''}
                        onChange={(e) => setSettings({ ...settings, announcement_text: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.announcement_enabled === '1'}
                          onChange={(e) =>
                            setSettings({ ...settings, announcement_enabled: e.target.checked ? '1' : '0' })
                          }
                          className="rounded border-slate-300 dark:border-slate-600"
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
          key={editingProduct?.id ?? 'new'}
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
