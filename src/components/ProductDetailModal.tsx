import React, { useEffect, useState } from 'react';
import { X, Star, ShoppingBag, ShieldCheck, ExternalLink, Heart } from 'lucide-react';
import { CurrencyCode, Product, Review, User } from '../types';
import { formatMoney, parseAttributes } from '../lib/currency';
import { apiRequest } from '../lib/api';
import { ResilientImage } from './ResilientImage';

interface ProductDetailModalProps {
  product: Product | null;
  currency: CurrencyCode;
  user: User | null;
  isWishlisted?: boolean;
  onToggleWishlist?: (productId: number) => void;
  onClose: () => void;
  onAddToCart: (product: Product, variantLabel: string, unitPrice: number, quantity: number) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  currency,
  user,
  isWishlisted = false,
  onToggleWishlist,
  onClose,
  onAddToCart,
}) => {
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [qty, setQty] = useState(1);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const attrs = product ? parseAttributes(product.attributes_json) : [];

  useEffect(() => {
    if (!product) return;
    setQty(1);
    const parsed = parseAttributes(product.attributes_json);
    const firstOpt = parsed[0]?.options?.[0];
    setSelectedVariant(firstOpt?.label || '');
    setUnitPrice(product.price + (firstOpt?.priceDelta || 0));

    apiRequest<{ reviews: Review[] }>(`/api/products/${product.id}`)
      .then((res) => setReviews(res.reviews))
      .catch(() => setReviews([]));
  }, [product]);

  if (!product) return null;

  const handleSelectOption = (label: string, priceDelta: number) => {
    setSelectedVariant(label);
    setUnitPrice(Math.max(0, product.price + priceDelta));
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmittingReview(true);
    try {
      const res = await apiRequest<{ reviews: Review[] }>(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          authorName: user?.name || authorName || 'Verified Buyer',
          rating,
          comment,
        }),
      });
      setReviews(res.reviews);
      setComment('');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl max-h-[92vh] bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{product.category_name}</span>
            <span aria-hidden="true">·</span>
            <span>{product.vendor_name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{product.sku}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            aria-label="Close product details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-6 aspect-[4/3] bg-slate-100 rounded-xl overflow-hidden">
              <ResilientImage src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
            </div>

            <div className="md:col-span-6 space-y-5">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{product.title}</h2>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-900 tabular-nums">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {product.rating.toFixed(1)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{reviews.length} reviews</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{product.product_type} item</span>
                </div>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                  {formatMoney(unitPrice, currency)}
                </span>
                {product.compare_at_price && product.compare_at_price > unitPrice && (
                  <span className="text-sm text-slate-400 line-through font-mono tabular-nums">
                    {formatMoney(product.compare_at_price, currency)}
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">{product.description}</p>

              {/* Variants */}
              {attrs.map((attr) => (
                <div key={attr.name} className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">{attr.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {attr.options.map((opt) => {
                      const active = selectedVariant === opt.label;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => handleSelectOption(opt.label, opt.priceDelta)}
                          className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                            active
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                          }`}
                        >
                          {opt.label}
                          {opt.priceDelta !== 0 &&
                            ` (${opt.priceDelta > 0 ? '+' : ''}${formatMoney(opt.priceDelta, currency)})`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Purchase Controls */}
              {product.product_type === 'affiliate' && product.affiliate_url ? (
                <a
                  href={product.affiliate_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
                >
                  Visit Partner Store
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex items-center border border-slate-200 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="px-3 py-2.5 text-sm text-slate-600 hover:text-slate-900"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-mono tabular-nums">{qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty((q) => q + 1)}
                      className="px-3 py-2.5 text-sm text-slate-600 hover:text-slate-900"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={product.product_type === 'physical' && product.stock <= 0}
                    onClick={() => {
                      onAddToCart(product, selectedVariant, unitPrice, qty);
                      onClose();
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    {product.product_type === 'physical' && product.stock <= 0
                      ? 'Out of Stock'
                      : 'Add to Bag'}
                  </button>
                  {onToggleWishlist && (
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(product.id)}
                      aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
                      className={`p-3 rounded-lg border transition-colors ${
                        isWishlisted
                          ? 'border-rose-200 bg-rose-50 text-rose-600'
                          : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                <span>
                  Fulfilled by <strong className="font-medium text-slate-700">{product.vendor_name}</strong> ·{' '}
                  {product.product_type === 'physical' ? `${product.stock} units available` : 'Instant delivery'}
                </span>
              </div>
            </div>
          </div>

          {/* Reviews Section */}
          <div className="pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7 space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Customer Reviews</h3>
              {reviews.length === 0 ? (
                <p className="text-sm text-slate-500">No reviews yet. Be the first to review this item.</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900">{rev.author_name}</span>
                        <span className="font-mono text-amber-600">{rev.rating}/5 ★</span>
                      </div>
                      <p className="text-sm text-slate-600">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={submitReview} className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="text-sm font-semibold text-slate-900">Write a Review</div>
              {!user && (
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
              )}
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value={5}>5 Stars — Exceptional</option>
                <option value={4}>4 Stars — Very Good</option>
                <option value={3}>3 Stars — Solid</option>
                <option value={2}>2 Stars — Fair</option>
                <option value={1}>1 Star — Poor</option>
              </select>
              <textarea
                rows={3}
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share material quality, fit, or setup feedback..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              />
              <button
                type="submit"
                disabled={submittingReview}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
              >
                {submittingReview ? 'Submitting...' : 'Post Review'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
