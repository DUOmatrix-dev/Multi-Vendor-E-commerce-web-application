import React, { useEffect, useState } from 'react';
import { X, Plus, Minus, Trash2, CheckCircle2, KeyRound, Tag, Award, FileText, Truck } from 'lucide-react';
import { CartItem, CurrencyCode, Order, OrderItem, User } from '../types';
import { formatMoney } from '../lib/currency';
import { apiRequest } from '../lib/api';
import { ResilientImage } from './ResilientImage';

const LOYALTY_POINT_VALUE = 0.05; // 100 pts = $5.00

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
  onOpenAuth?: () => void;
  onTrackOrder?: (orderNumber: string) => void;
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
  onOpenAuth,
  onTrackOrder,
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'confirmed'>('cart');
  const [checkoutMode, setCheckoutMode] = useState<'account' | 'guest'>(user ? 'account' : 'guest');
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [city, setCity] = useState(user?.city || '');
  const [postal, setPostal] = useState(user?.postal_code || '');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'stripe' | 'paypal'>('cod');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<{
    order: Order;
    items: OrderItem[];
    pointsEarned?: number;
    pointsRedeemed?: number;
    loyaltyDiscount?: number;
  } | null>(null);

  useEffect(() => {
    if (user) {
      setCheckoutMode('account');
      setCustomerName((prev) => prev || user.name || '');
      setCustomerEmail((prev) => prev || user.email || '');
      setCustomerPhone((prev) => prev || user.phone || '');
      setAddress((prev) => prev || user.address || '');
      setCity((prev) => prev || user.city || '');
      setPostal((prev) => prev || user.postal_code || '');
    } else {
      setCheckoutMode('guest');
      setPointsToRedeem(0);
    }
  }, [user]);

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  useEffect(() => {
    if (items.length === 0) {
      if (step === 'checkout') {
        setStep('cart');
      }
      setAppliedCoupon(null);
      setCouponError('');
      setPointsToRedeem(0);
    }
  }, [items.length, step]);

  const appliedCouponCode = appliedCoupon?.code || '';
  useEffect(() => {
    if (!appliedCouponCode || subtotal <= 0) return;
    let active = true;
    apiRequest<{ code: string; discount: number }>('/api/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ code: appliedCouponCode, subtotal }),
    })
      .then((res) => {
        if (!active) return;
        setAppliedCoupon({ code: res.code, discount: res.discount });
        setCouponError('');
      })
      .catch((err) => {
        if (!active) return;
        setAppliedCoupon(null);
        setCouponError(err instanceof Error ? err.message : 'Coupon no longer applies to current bag total');
      });
    return () => {
      active = false;
    };
  }, [appliedCouponCode, subtotal]);

  if (!isOpen) return null;

  const isGuestCheckout = !user || checkoutMode === 'guest';
  const couponDiscount = appliedCoupon ? Math.min(subtotal, appliedCoupon.discount) : 0;
  const remainingSubtotal = Math.max(0, subtotal - couponDiscount);
  const availablePoints = user?.loyalty_points || 0;
  const maxRedeemablePoints = Math.min(
    availablePoints,
    Math.floor(remainingSubtotal / LOYALTY_POINT_VALUE)
  );
  const effectivePointsToRedeem = !isGuestCheckout
    ? Math.max(0, Math.min(Math.floor(pointsToRedeem), maxRedeemablePoints))
    : 0;
  const loyaltyDiscount = Number((effectivePointsToRedeem * LOYALTY_POINT_VALUE).toFixed(2));
  const discountTotal = Number(Math.min(subtotal, couponDiscount + loyaltyDiscount).toFixed(2));
  const taxable = Math.max(0, subtotal - discountTotal);
  const taxTotal = Number(((taxable * taxRatePercent) / 100).toFixed(2));
  const shippingTotal = taxable >= freeShippingThreshold || items.length === 0 ? 0 : flatShippingRate;
  const grandTotal = Number((taxable + taxTotal + shippingTotal).toFixed(2));
  const estimatedPointsEarned = !isGuestCheckout && grandTotal > 0 ? Math.max(1, Math.round(grandTotal)) : 0;

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
      const res = await apiRequest<{
        order: Order;
        items: OrderItem[];
        pointsEarned?: number;
        pointsRedeemed?: number;
        loyaltyDiscount?: number;
      }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          shippingAddress: address.trim(),
          shippingCity: city.trim(),
          shippingPostal: postal.trim(),
          paymentMethod,
          couponCode: appliedCoupon?.code || '',
          pointsToRedeem: effectivePointsToRedeem,
          orderNotes: orderNotes.trim(),
          checkoutAsGuest: isGuestCheckout,
          source: 'storefront',
          items: items.map((i) =>
            i.bundle
              ? {
                  bundleId: i.bundle.id,
                  quantity: i.quantity,
                  variantLabel: i.variantLabel,
                  unitPrice: i.unitPrice,
                }
              : {
                  productId: i.product?.id,
                  quantity: i.quantity,
                  variantLabel: i.variantLabel,
                  unitPrice: i.unitPrice,
                }
          ),
        }),
      });
      setConfirmedOrder(res);
      setStep('confirmed');
      setAppliedCoupon(null);
      setPointsToRedeem(0);
      setOrderNotes('');
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

              {((confirmedOrder.pointsEarned || 0) > 0 || (confirmedOrder.pointsRedeemed || 0) > 0) && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <Award className="w-4 h-4 text-blue-600" />
                    OmniMart Rewards Summary
                  </div>
                  {(confirmedOrder.pointsRedeemed || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Points Redeemed</span>
                      <span className="font-mono tabular-nums text-emerald-700">
                        −{confirmedOrder.pointsRedeemed} pts (−{formatMoney(confirmedOrder.loyaltyDiscount || 0, currency)})
                      </span>
                    </div>
                  )}
                  {(confirmedOrder.pointsEarned || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Points Earned on Purchase</span>
                      <span className="font-mono tabular-nums font-semibold text-blue-700">
                        +{confirmedOrder.pointsEarned} pts
                      </span>
                    </div>
                  )}
                </div>
              )}

              {confirmedOrder.order.order_notes && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    Order Notes
                  </div>
                  <p className="text-slate-600 whitespace-pre-line">{confirmedOrder.order.order_notes}</p>
                </div>
              )}

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

              <div className="flex gap-2">
                {onTrackOrder && (
                  <button
                    type="button"
                    onClick={() => {
                      const orderNum = confirmedOrder.order.order_number;
                      resetAndClose();
                      onTrackOrder(orderNum);
                    }}
                    className="flex-1 py-2.5 px-3 bg-white border border-slate-200 hover:border-blue-600 text-slate-800 text-sm font-medium rounded-lg inline-flex items-center justify-center gap-1.5"
                  >
                    <Truck className="w-4 h-4 text-blue-600" />
                    Track Order
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
                >
                  Continue Shopping
                </button>
              </div>
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
                {items.map((item) => {
                  const title = item.bundle ? item.bundle.title : (item.product?.title || 'Item');
                  const imageUrl = item.bundle ? item.bundle.image_url : (item.product?.image_url || '');
                  const bundleContents = item.bundle
                    ? item.bundle.items.map((bi) => `${bi.quantity}× ${bi.title}`).join(' · ')
                    : '';
                  return (
                  <div key={item.key} className="py-4 flex gap-3.5">
                    <div className="w-20 h-16 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                      <ResilientImage
                        src={imageUrl}
                        alt={title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {title}
                      </div>
                      {item.variantLabel && (
                        <div className="text-xs text-slate-500">{item.variantLabel}</div>
                      )}
                      {bundleContents && (
                        <div className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                          Includes: {bundleContents}
                        </div>
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
                          {item.bundle && item.bundle.regular_total > item.unitPrice && (
                            <span className="text-xs font-mono text-slate-400 line-through tabular-nums">
                              {formatMoney(item.bundle.regular_total * item.quantity, currency)}
                            </span>
                          )}
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
                  );
                })}
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

              {/* Loyalty Points Redemption */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                    <Award className="w-3.5 h-3.5 text-blue-600" />
                    OmniMart Rewards
                  </span>
                  {user ? (
                    <span className="font-mono tabular-nums text-slate-600">
                      {availablePoints.toLocaleString()} pts ({formatMoney(availablePoints * LOYALTY_POINT_VALUE, currency)})
                    </span>
                  ) : (
                    <span className="text-slate-400">Sign in to redeem</span>
                  )}
                </div>

                {user && availablePoints > 0 && maxRedeemablePoints > 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={maxRedeemablePoints}
                        step={20}
                        value={effectivePointsToRedeem}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setPointsToRedeem(Math.min(maxRedeemablePoints, val));
                        }}
                        aria-label="Loyalty points to redeem"
                        className="w-24 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
                      />
                      <span className="text-xs text-slate-600 flex-1 tabular-nums">
                        pts = <strong className="text-emerald-700">−{formatMoney(loyaltyDiscount, currency)}</strong>
                      </span>
                      {effectivePointsToRedeem > 0 && (
                        <button
                          type="button"
                          onClick={() => setPointsToRedeem(0)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-900"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {maxRedeemablePoints >= 100 && (
                        <button
                          type="button"
                          onClick={() => setPointsToRedeem(100)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-white border border-slate-200 hover:border-blue-500 rounded-md text-slate-700"
                        >
                          Use 100 pts (−{formatMoney(5, currency)})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPointsToRedeem(maxRedeemablePoints)}
                        className="px-2.5 py-1 text-[11px] font-medium bg-white border border-slate-200 hover:border-blue-500 rounded-md text-slate-700 tabular-nums"
                      >
                        Use Max ({maxRedeemablePoints} pts)
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {user
                      ? 'Earn 1 point per $1 spent on every order (100 pts = $5.00 off).'
                      : 'Sign in with your account to earn 1 point per $1 and redeem rewards at checkout.'}
                  </p>
                )}
              </div>
              {/* Order Notes */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <label
                  htmlFor="cart-order-notes"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-800"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  Order Notes
                </label>
                <textarea
                  id="cart-order-notes"
                  rows={2}
                  maxLength={1000}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Special delivery instructions, gate code, or gift note..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          ) : (
            <form id="checkout-form" onSubmit={handlePlaceOrder} className="space-y-4">
              {checkoutError && (
                <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg">
                  {checkoutError}
                </div>
              )}

              {/* Checkout Mode Banner / Toggle */}
              {user ? (
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCheckoutMode('account')}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                      checkoutMode === 'account'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Account Checkout
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutMode('guest')}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                      checkoutMode === 'guest'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Guest Checkout
                  </button>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900">Guest Checkout</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      No account required — only your email and shipping details are needed to place your order.
                    </p>
                  </div>
                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap shrink-0"
                    >
                      Sign In
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {isGuestCheckout ? 'Recipient Name (Optional)' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required={!isGuestCheckout}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={isGuestCheckout ? 'Guest Customer' : 'Full name'}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+1 415 555 0100"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="500 Howard Street, Apt 4B"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="San Francisco"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Postal Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={postal}
                    onChange={(e) => setPostal(e.target.value)}
                    placeholder="94105"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="checkout-order-notes"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Order Notes (Optional)
                </label>
                <textarea
                  id="checkout-order-notes"
                  rows={2}
                  maxLength={1000}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Special delivery instructions, gate code, or gift note..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
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
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Promo ({appliedCoupon?.code})</span>
                  <span className="font-mono tabular-nums">−{formatMoney(couponDiscount, currency)}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Loyalty Rewards ({effectivePointsToRedeem} pts)</span>
                  <span className="font-mono tabular-nums">−{formatMoney(loyaltyDiscount, currency)}</span>
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
              {estimatedPointsEarned > 0 && (
                <div className="flex justify-between text-[11px] text-blue-700 font-medium">
                  <span>Rewards Points Earned</span>
                  <span className="font-mono tabular-nums">+{estimatedPointsEarned} pts</span>
                </div>
              )}
            </div>

            {step === 'cart' ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!user) setCheckoutMode('guest');
                    setStep('checkout');
                  }}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {user ? 'Proceed to Checkout' : 'Checkout as Guest'}
                </button>
                {!user && onOpenAuth && (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="w-full py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Already have an account? Sign in for rewards
                  </button>
                )}
              </div>
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
                  {submitting
                    ? 'Placing Order...'
                    : `${isGuestCheckout ? 'Place Guest Order' : 'Confirm Order'} · ${formatMoney(grandTotal, currency)}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
