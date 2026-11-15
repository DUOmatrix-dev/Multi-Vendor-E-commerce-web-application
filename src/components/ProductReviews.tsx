import React, { useMemo, useState } from 'react';
import { Star, CheckCircle2, MessageSquare } from 'lucide-react';
import { Review, User } from '../types';
import { apiRequest } from '../lib/api';

interface ProductReviewsProps {
  productId: number;
  initialRating: number;
  reviews: Review[];
  user: User | null;
  canReview?: boolean;
  onReviewsUpdated: (reviews: Review[], updatedRating: number) => void;
  onOpenAuth?: () => void;
}

export const ProductReviews: React.FC<ProductReviewsProps> = ({
  productId,
  initialRating,
  reviews,
  user,
  canReview = false,
  onReviewsUpdated,
  onOpenAuth,
}) => {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ratingBreakdown = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of reviews) {
      const clamped = Math.min(5, Math.max(1, Math.round(r.rating)));
      counts[clamped] = (counts[clamped] || 0) + 1;
    }
    const total = reviews.length;
    return [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: counts[stars],
      percent: total > 0 ? Math.round((counts[stars] / total) * 100) : 0,
    }));
  }, [reviews]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    setReviewError('');
    setReviewSuccess('');
    try {
      const res = await apiRequest<{ reviews: Review[]; rating: number; review_count: number }>(
        `/api/products/${productId}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify({
            rating,
            comment: comment.trim(),
          }),
        }
      );
      setComment('');
      setRating(5);
      setReviewSuccess('Thank you! Your review has been published.');
      onReviewsUpdated(res.reviews, res.rating);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Unable to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="pt-6 border-t border-slate-200 space-y-6" aria-label="Product reviews">
      {/* Summary Header & Rating Distribution */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
              {initialRating.toFixed(1)}
            </span>
            <span className="text-sm text-slate-400 font-mono">/ 5.0</span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-0.5" aria-label={`Average rating ${initialRating.toFixed(1)} out of 5`}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= Math.round(initialRating)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-300'
                  }`}
                />
              ))}
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              Based on {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
            </div>
          </div>
        </div>

        <div className="w-full sm:w-64 space-y-1">
          {ratingBreakdown.map((row) => (
            <div key={row.stars} className="flex items-center gap-2 text-[11px] text-slate-600 tabular-nums">
              <span className="w-6 font-mono text-right">{row.stars}★</span>
              <progress
                value={row.percent}
                max={100}
                aria-label={`${row.stars} star reviews: ${row.percent}%`}
                className="flex-1 h-1.5 rounded-full overflow-hidden appearance-none bg-slate-100 [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:bg-amber-400 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-amber-400 [&::-moz-progress-bar]:rounded-full"
              />
              <span className="w-6 font-mono text-slate-400 text-right">{row.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reviews List + Submit Review Form */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-7 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-500" />
            Written Customer Reviews ({reviews.length})
          </h3>

          {reviews.length === 0 ? (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
              No reviews yet. Be the first signed-in shopper to share your experience.
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((rev) => (
                <article
                  key={rev.id}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                      <span className="font-semibold text-slate-900">{rev.author_name}</span>
                      {Boolean(rev.verified_purchase) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified Purchase
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums font-mono">{rev.created_at.slice(0, 10)}</span>
                    </div>
                    <div
                      className="flex items-center gap-0.5"
                      aria-label={`Rated ${rev.rating} out of 5 stars`}
                    >
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= rev.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{rev.comment}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-5">
          {!user ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="text-sm font-semibold text-slate-900">Submit a Review</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sign in with your OmniMart account to rate this product and publish a written review.
              </p>
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Sign In to Review
                </button>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">Submit Review</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Reviewing as <span className="font-medium text-slate-800">{user.name}</span>
                  {canReview ? ' · Verified Buyer' : ''}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">Star Rating</span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {hoverRating || rating} / 5 stars
                  </span>
                </div>
                <div
                  className="flex items-center gap-1.5"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = star <= (hoverRating || rating);
                    return (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHoverRating(star)}
                        onClick={() => setRating(star)}
                        aria-label={`Rate ${star} out of 5 stars`}
                        className="p-1 rounded-md hover:bg-white transition-colors"
                      >
                        <Star
                          className={`w-5 h-5 transition-colors ${
                            active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`review-comment-${productId}`} className="block text-xs font-medium text-slate-700">
                  Written Review
                </label>
                <textarea
                  id={`review-comment-${productId}`}
                  rows={3}
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share build quality, performance, or everyday experience..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              {reviewError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg">
                  {reviewError}
                </div>
              )}
              {reviewSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 rounded-lg">
                  {reviewSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-slate-900 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};
