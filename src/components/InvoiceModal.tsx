import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, KeyRound } from 'lucide-react';
import { CurrencyCode, Order } from '../types';
import { formatMoney } from '../lib/currency';

interface InvoiceModalProps {
  order: Order | null;
  currency: CurrencyCode;
  storeName?: string;
  supportEmail?: string;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  order,
  currency,
  storeName = 'OmniMart',
  supportEmail = 'support@omnimart.com',
  onClose,
}) => {
  useEffect(() => {
    if (!order) return;
    document.body.classList.add('has-invoice-print');
    return () => {
      document.body.classList.remove('has-invoice-print');
    };
  }, [order]);

  if (!order || typeof document === 'undefined') return null;

  const items = order.items || [];
  const promoDiscount = Math.max(0, Number((order.discount_total - (order.loyalty_discount || 0)).toFixed(2)));
  const loyaltyDiscount = Number(order.loyalty_discount || 0);

  return createPortal(
    <div
      id="invoice-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs overflow-y-auto p-4 sm:p-8 flex items-start justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Invoice for order ${order.order_number}`}
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-auto">
        {/* Screen-only Toolbar */}
        <div className="print:hidden px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Tax &amp; Order Invoice · {order.order_number}
            </div>
            <div className="text-xs text-slate-500">
              Use "Print / Save as PDF" in your browser print dialog to export a clean PDF copy.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-lg"
              aria-label="Close invoice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Document */}
        <article id="printable-invoice" className="p-8 sm:p-10 bg-white text-slate-900 space-y-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-slate-200">
            <div className="space-y-1">
              <div className="text-2xl font-bold tracking-tight font-display text-slate-900">
                {storeName}
              </div>
              <div className="text-xs text-slate-500">
                Multi-Vendor Curated Commerce · 500 Howard Street, San Francisco, CA 94105
              </div>
              <div className="text-xs text-slate-500">{supportEmail}</div>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Official Order Invoice
              </div>
              <div className="text-lg font-bold font-mono text-slate-900">
                INV-{order.order_number}
              </div>
              <div className="text-xs text-slate-600 tabular-nums">
                Order Reference: <span className="font-mono font-medium">{order.order_number}</span>
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                Issued: {order.created_at.slice(0, 10)}
              </div>
            </div>
          </div>

          {/* Billing / Shipping & Fulfillment Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-1.5">
              <div className="font-semibold uppercase tracking-wider text-slate-400">
                Billed &amp; Shipped To
              </div>
              <div className="text-sm font-semibold text-slate-900">{order.customer_name}</div>
              <div className="text-slate-600">{order.customer_email}</div>
              {order.customer_phone && <div className="text-slate-600">{order.customer_phone}</div>}
              <div className="text-slate-600 pt-0.5">
                {order.shipping_address}
                <br />
                {order.shipping_city} {order.shipping_postal}
              </div>
            </div>

            <div className="space-y-1.5 sm:text-right">
              <div className="font-semibold uppercase tracking-wider text-slate-400">
                Payment &amp; Fulfillment
              </div>
              <div className="text-slate-700">
                Payment Method:{' '}
                <span className="font-semibold uppercase text-slate-900">{order.payment_method}</span>
              </div>
              <div className="text-slate-700">
                Payment Status:{' '}
                <span className="font-semibold capitalize text-slate-900">{order.payment_status}</span>
              </div>
              <div className="text-slate-700">
                Order Status:{' '}
                <span className="font-semibold capitalize text-slate-900">{order.order_status}</span>
              </div>
              {order.shipping_carrier && (
                <div className="text-slate-600">
                  Carrier: {order.shipping_carrier}
                  {order.tracking_code ? ` · ${order.tracking_code}` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Itemized Line Items */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-semibold">Item &amp; Specifications</th>
                  <th className="py-3 px-3 font-semibold font-mono">SKU</th>
                  <th className="py-3 px-3 font-semibold text-right">Qty</th>
                  <th className="py-3 px-3 font-semibold text-right">Unit Price</th>
                  <th className="py-3 px-4 font-semibold text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id} className="align-top">
                    <td className="py-3.5 px-4 space-y-1">
                      <div className="text-sm font-semibold text-slate-900">{it.title}</div>
                      {it.variant_label && (
                        <div className="text-xs text-slate-500 leading-relaxed">{it.variant_label}</div>
                      )}
                      {it.license_key && (
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-blue-700 pt-0.5">
                          <KeyRound className="w-3 h-3" />
                          License Key: {it.license_key}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-500 whitespace-nowrap">{it.sku}</td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {it.quantity}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatMoney(it.unit_price, currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                      {formatMoney(it.total_price, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end">
            <div className="w-full sm:w-80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatMoney(order.subtotal, currency)}</span>
              </div>
              {promoDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Promo Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
                  <span className="font-mono tabular-nums">−{formatMoney(promoDiscount, currency)}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Loyalty Rewards ({order.points_redeemed || 0} pts)</span>
                  <span className="font-mono tabular-nums">−{formatMoney(loyaltyDiscount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                <span className="font-mono tabular-nums">
                  {order.shipping_total === 0 ? 'Complimentary' : formatMoney(order.shipping_total, currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax</span>
                <span className="font-mono tabular-nums">{formatMoney(order.tax_total, currency)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-3 border-t border-slate-200 text-base font-bold text-slate-900">
                <span>Total {order.payment_status === 'paid' ? 'Paid' : 'Due'}</span>
                <span className="font-mono tabular-nums">{formatMoney(order.total, currency)}</span>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>Thank you for shopping with {storeName}. All multi-vendor items include buyer protection.</span>
            <span className="font-mono">Document ID: INV-{order.order_number}</span>
          </div>
        </article>
      </div>
    </div>,
    document.body
  );
};
