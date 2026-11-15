import React, { useState } from 'react';
import { Clock, Flag, Gift, GripVertical } from 'lucide-react';
import { CurrencyCode, Order, OrderTag } from '../types';
import { formatMoney } from '../lib/currency';

const ORDER_TAGS: OrderTag[] = ['Priority', 'Backorder', 'Gift'];

const TAG_META: Record<
  OrderTag,
  {
    icon: React.ReactNode;
    activeClass: string;
    inactiveClass: string;
    textClass: string;
  }
> = {
  Priority: {
    icon: <Flag className="w-3 h-3 shrink-0" />,
    activeClass:
      'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
    inactiveClass:
      'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700 dark:hover:text-slate-200',
    textClass: 'text-red-700 dark:text-red-300',
  },
  Backorder: {
    icon: <Clock className="w-3 h-3 shrink-0" />,
    activeClass:
      'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    inactiveClass:
      'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700 dark:hover:text-slate-200',
    textClass: 'text-amber-700 dark:text-amber-300',
  },
  Gift: {
    icon: <Gift className="w-3 h-3 shrink-0" />,
    activeClass:
      'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    inactiveClass:
      'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700 dark:hover:text-slate-200',
    textClass: 'text-blue-700 dark:text-blue-300',
  },
};

interface OrderKanbanBoardProps {
  orders: Order[];
  currency: CurrencyCode;
  onStatusChange: (orderId: number, newStatus: Order['order_status']) => Promise<void>;
  onTagsChange?: (orderId: number, tags: OrderTag[]) => Promise<void>;
}

const COLUMNS: Array<{ key: Order['order_status']; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

export const OrderKanbanBoard: React.FC<OrderKanbanBoardProps> = ({
  orders,
  currency,
  onStatusChange,
  onTagsChange,
}) => {
  const [dragOrderId, setDragOrderId] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);

  const handleDrop = async (targetStatus: Order['order_status']) => {
    if (dragOrderId === null) return;
    const order = orders.find((o) => o.id === dragOrderId);
    setDragOrderId(null);
    setHoverCol(null);
    if (!order || order.order_status === targetStatus) return;
    await onStatusChange(order.id, targetStatus);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const colOrders = orders.filter((o) => o.order_status === col.key);
        const isHover = hoverCol === col.key;
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverCol(col.key);
            }}
            onDragLeave={() => setHoverCol(null)}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.key);
            }}
            className={`rounded-xl border p-3 min-h-[340px] transition-colors ${
              isHover
                ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center justify-between px-1 pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{col.label}</span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">{colOrders.length}</span>
            </div>

            <div className="space-y-2.5">
              {colOrders.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                  Drag an order here
                </div>
              ) : (
                colOrders.map((order) => {
                  const activeTags = order.tags || [];
                  return (
                    <div
                      key={order.id}
                      draggable
                      onDragStart={() => setDragOrderId(order.id)}
                      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-slate-300 dark:hover:border-slate-700 transition-colors ${
                        dragOrderId === order.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {order.order_number}
                        </span>
                        <GripVertical className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {order.customer_name}
                      </div>

                      {onTagsChange ? (
                        <div
                          className="flex flex-wrap items-center gap-1.5 mt-2.5"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {ORDER_TAGS.map((tag) => {
                            const isActive = activeTags.includes(tag);
                            const meta = TAG_META[tag];
                            return (
                              <button
                                key={tag}
                                type="button"
                                aria-pressed={isActive}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextTags = isActive
                                    ? activeTags.filter((t) => t !== tag)
                                    : [...activeTags, tag];
                                  onTagsChange(order.id, nextTags);
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                  isActive ? meta.activeClass : meta.inactiveClass
                                }`}
                              >
                                {meta.icon}
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      ) : activeTags.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-medium">
                          {activeTags.map((tag) => (
                            <span
                              key={tag}
                              className={`inline-flex items-center gap-1 ${TAG_META[tag].textClass}`}
                            >
                              {TAG_META[tag].icon}
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        <span className="uppercase">{order.payment_method}</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {formatMoney(order.total, currency)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
