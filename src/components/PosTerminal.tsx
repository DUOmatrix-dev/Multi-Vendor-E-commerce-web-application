import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Printer,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { Category, CurrencyCode, Order, Product } from '../types';
import { formatMoney, parseAttributes } from '../lib/currency';
import { apiRequest } from '../lib/api';
import { ResilientImage } from './ResilientImage';

interface PosTerminalProps {
  products: Product[];
  categories: Category[];
  currency: CurrencyCode;
  taxRatePercent: number;
  onOrderComplete: () => void;
  onBackToStorefront: () => void;
}

interface PosLine {
  key: string;
  product: Product;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
}

export const PosTerminal: React.FC<PosTerminalProps> = ({
  products,
  categories,
  currency,
  taxRatePercent,
  onOrderComplete,
  onBackToStorefront,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [lines, setLines] = useState<PosLine[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in Guest');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'pos_card' | 'pos_cash'>('pos_card');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const catMatch = selectedCategory === 'all' || String(p.category_id) === selectedCategory;
      const qMatch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return catMatch && qMatch;
    });
  }, [products, search, selectedCategory]);

  const addProduct = (product: Product) => {
    const attrs = parseAttributes(product.attributes_json);
    const defaultOpt = attrs[0]?.options?.[0];
    const variantLabel = defaultOpt?.label || '';
    const unitPrice = product.price + (defaultOpt?.priceDelta || 0);
    const key = `${product.id}:${variantLabel}`;

    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { key, product, variantLabel, unitPrice, quantity: 1 }];
    });
  };

  const updateQty = (key: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const posDiscount = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const taxable = Math.max(0, subtotal - posDiscount);
  const tax = Number(((taxable * taxRatePercent) / 100).toFixed(2));
  const total = Number((taxable + tax).toFixed(2));

  const submitPosOrder = async () => {
    if (lines.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiRequest<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName || 'Walk-in Guest',
          customerEmail: 'pos@omnimart.com',
          customerPhone,
          paymentMethod,
          source: 'pos',
          posDiscount,
          items: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            variantLabel: l.variantLabel,
            unitPrice: l.unitPrice,
          })),
        }),
      });
      setCompletedOrder(res.order);
      setLines([]);
      setDiscount('0');
      onOrderComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'POS checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F8F9FB]">
      <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBackToStorefront}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Exit POS
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Point of Sale Register</h1>
              <p className="text-xs text-slate-500">In-person checkout synced directly with OmniMart inventory & vendor payouts</p>
            </div>
          </div>
          <div className="text-xs font-mono text-slate-500 tabular-nums">
            Tax Rate: {taxRatePercent}%
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Product Picker */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Scan SKU or search catalog..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  disabled={p.product_type === 'physical' && p.stock <= 0}
                  className="text-left bg-white border border-slate-200 hover:border-blue-600 rounded-xl overflow-hidden transition-colors disabled:opacity-50"
                >
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                    <ResilientImage src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>{p.sku}</span>
                      <span className="tabular-nums">{p.product_type === 'physical' ? `${p.stock} in stock` : 'Digital'}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 line-clamp-1">{p.title}</div>
                    <div className="text-sm font-mono font-semibold text-blue-600 tabular-nums">
                      {formatMoney(p.price, currency)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Register Ticket */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 sticky top-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Active Ticket</h2>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLines([])}
                  className="text-xs text-slate-500 hover:text-red-600"
                >
                  Clear All
                </button>
              )}
            </div>

            {completedOrder && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Receipt #{completedOrder.order_number} Paid
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </button>
                </div>
                <div className="text-xs text-emerald-800 tabular-nums">
                  Collected {formatMoney(completedOrder.total, currency)} via {completedOrder.payment_method.toUpperCase()}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone (Optional)</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+1 415..."
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto">
              {lines.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  Select products on the left to add them to this register ticket.
                </div>
              ) : (
                lines.map((line) => (
                  <div key={line.key} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate">{line.product.title}</div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {formatMoney(line.unitPrice, currency)} {line.variantLabel ? `· ${line.variantLabel}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQty(line.key, -1)}
                        className="p-1 border border-slate-200 rounded hover:bg-slate-50"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-mono tabular-nums">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(line.key, 1)}
                        className="p-1 border border-slate-200 rounded hover:bg-slate-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateQty(line.key, -line.quantity)}
                        className="p-1 text-slate-400 hover:text-red-600 ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatMoney(subtotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>POS Discount (USD)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-24 text-right px-2 py-1 text-xs font-mono border border-slate-200 rounded"
                />
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Tax ({taxRatePercent}%)</span>
                <span className="font-mono tabular-nums">{formatMoney(tax, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Due</span>
                <span className="font-mono tabular-nums">{formatMoney(total, currency)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('pos_card')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg border transition-colors ${
                  paymentMethod === 'pos_card'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-700'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                Card Terminal
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('pos_cash')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg border transition-colors ${
                  paymentMethod === 'pos_cash'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-700'
                }`}
              >
                <Banknote className="w-4 h-4" />
                Cash Drawer
              </button>
            </div>

            <button
              type="button"
              onClick={submitPosOrder}
              disabled={lines.length === 0 || submitting}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Processing Sale...' : `Complete Sale · ${formatMoney(total, currency)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
