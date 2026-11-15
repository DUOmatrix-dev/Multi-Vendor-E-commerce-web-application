import React, { useState } from 'react';
import { X, Plus, Minus, Trash2, CheckCircle2, KeyRound, Tag } from 'lucide-react';
import { CartItem, CurrencyCode, Order, OrderItem, User } from '../types';
import { formatMoney } from '../lib/currency';
import { apiRequest } from '../lib/api';
import { ResilientImage } from './ResilientImage';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currency: CurrencyCode;
  taxRatePercent: number;
  freeShippingThreshold: number;
  flatShippingRate: number;
  user: User | null;
  onUpdateQty: (key: string, delta: number) => void;
  onClearCart: () => void;
  onOrderSuccess: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  currency,
  taxRatePercent,
  freeShippingThreshold,
  flatShippingRate,
  user,
  onUpdateQty,
  onClearCart,
  onOrderSuccess,
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'confirmed'>('cart');
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [city, setCity] = useState(user?.city || '');
  const [postal, setPostal] = useState(user?.postal_code || '');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'stripe' | 'paypal'>('cod');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<{ order: Order; items: OrderItem[] } | null>(null);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const discountTotal = appliedCoupon ? Math.min(subtotal, appliedCoupon.discount) : 0;
  const taxable = Math.max(0, subtotal - discountTotal);
  const taxTotal = Number(((taxable * taxRatePercent) / 100).toFixed(2));
  const shippingTotal = taxable >= freeShippingThreshold || items.length === 0 ? 0 : flatShippingRate;
  const grandTotal = Number((taxable + taxTotal + shippingTotal).toFixed(2));

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponError('');
    try {
      const res = await apiRequest<{ code: string; discount: number }>('/api/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: couponInput.trim(), subtotal }),
      });
      setAppliedCoupon({ code: res.code, discount: res.discount });
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err instanceof Error ? err.message : 'Invalid coupon');
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCheckoutError('');
    try {
      const res = await apiRequest<{ order: Order; items: OrderItem[] }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerPhone,
          shippingAddress: address,
          shippingCity: city,
          shippingPostal: postal,
          paymentMethod,
          couponCode: appliedCoupon?.code || '',
          source: 'storefront',
          items: items.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
            variantLabel: i.variantLabel,
            unitPrice: i.unitPrice,
          })),
        }),
      });
      setConfirmedOrder(res);
      setStep('confirmed');
      setAppliedCoupon(null);
      onClearCart();
      onOrderSuccess();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to place order');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    if (step === 'confirmed') {
      setStep('cart');
      setConfirmedOrder(null);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {step === 'cart' && `Shopping Bag (${items.reduce((s, i) => s + i.quantity, 0)})`}
            {step === 'checkout' && 'Secure Checkout'}
            {step === 'confirmed' && 'Order Confirmed'}
          </h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'confirmed' && confirmedOrder ? (
            <div className="space-y-5">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Order {confirmedOrder.order.order_number} Confirmed
                </div>
                <p className="text-xs text-emerald-800">
                  {confirmedOrder.order.payment_method === 'cod'
                    ? 'Preparing shipment · Cash on Delivery verified.'
                    : 'Payment captured · Preparing studio dispatch.'}
                </p>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-500">Order Receipt</div>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {confirmedOrder.items.map((it) => (
                    <div key={it.id} className="p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-900">
                          {it.title} ×{it.quantity}
                        </span>
                        <span className="font-mono tabular-nums font-medium">
                          {formatMoney(it.total_price, currency)}
                        </span>
                      </div>
                      {it.license_key && (
                        <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-800">
                          <KeyRound className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>License Key: {it.license_key}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="p-3.5 flex items-center justify-between text-sm font-semibold text-slate-900 bg-slate-50">
                    <span>Total Paid / Due</span>
                    <span className="font-mono tabular-nums">
                      {formatMoney(confirmedOrder.order.total, currency)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={resetAndClose}
                className="w-full py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg"
              >
                Continue Shopping
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm text-slate-500">Your shopping bag is currently empty.</p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:underline"
              >
                Browse Featured Collection
              </button>
            </div>
          ) : step === 'cart' ? (
            <div className="space-y-5">
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.key} className="py-4 flex gap-3.5">
                    <div className="w-20 h-16 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                      <ResilientImage
                        src={item.product.image_url}
                        alt={item.product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {item.product.title}
                      </div>
                      {item.variantLabel && (
                        <div className="text-xs text-slate-500">{item.variantLabel}</div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1 border border-slate-200 rounded-md">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.key, -1)}
                            className="p-1 text-slate-600 hover:text-slate-900"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.key, 1)}
                            className="p-1 text-slate-600 hover:text-slate-900"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                            {formatMoney(item.unitPrice * item.quantity, currency)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.key, -item.quantity)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon Input */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Promo code (try OMNI15)"
                      className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                  >
                    Apply
                  </button>
                </div>
                {couponError && <p className="text-xs text-red-600">{couponError}</p>}
                {appliedCoupon && (
                  <p className="text-xs text-emerald-700 font-medium">
                    Coupon {appliedCoupon.code} applied (−{formatMoney(appliedCoupon.discount, currency)})
                  </p>
                )}
              </div>
            </div>
          ) : (
            <form id="checkout-form" onSubmit={handlePlaceOrder} className="space-y-4">
              {checkoutError && (
                <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg">
                  {checkoutError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+1 415 555 0100"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Postal Code</label>
                  <input
                    type="text"
                    required
                    value={postal}
                    onChange={(e) => setPostal(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold text-slate-700">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cod', label: 'Cash on Delivery' },
                    { id: 'stripe', label: 'Card / Stripe' },
                    { id: 'paypal', label: 'PayPal' },
                  ].map((pm) => (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id as 'cod' | 'stripe' | 'paypal')}
                      className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors ${
                        paymentMethod === pm.id
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer Summary */}
        {step !== 'confirmed' && items.length > 0 && (
          <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatMoney(subtotal, currency)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount ({appliedCoupon?.code})</span>
                  <span className="font-mono tabular-nums">−{formatMoney(discountTotal, currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping (Free over {formatMoney(freeShippingThreshold, currency)})</span>
                <span className="font-mono tabular-nums">
                  {shippingTotal === 0 ? 'Free' : formatMoney(shippingTotal, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Tax ({taxRatePercent}%)</span>
                <span className="font-mono tabular-nums">{formatMoney(taxTotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-slate-900 pt-2 border-t border-slate-200">
                <span>Order Total</span>
                <span className="font-mono tabular-nums">{formatMoney(grandTotal, currency)}</span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Proceed to Checkout
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="px-4 py-3 text-sm font-medium text-slate-700 border border-slate-200 bg-white rounded-lg"
                >
                  Back
                </button>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={submitting}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Placing Order...' : `Confirm Order · ${formatMoney(grandTotal, currency)}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
