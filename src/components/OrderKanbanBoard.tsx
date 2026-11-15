import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { CurrencyCode, Order } from '../types';
import { formatMoney } from '../lib/currency';

interface OrderKanbanBoardProps {
  orders: Order[];
  currency: CurrencyCode;
  onStatusChange: (orderId: number, newStatus: Order['order_status']) => Promise<void>;
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
              isHover ? 'border-blue-600 bg-blue-50/40' : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between px-1 pb-3 mb-3 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-900">{col.label}</span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">{colOrders.length}</span>
            </div>

            <div className="space-y-2.5">
              {colOrders.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Drag an order here
                </div>
              ) : (
                colOrders.map((order) => (
                  <div
                    key={order.id}
                    draggable
                    onDragStart={() => setDragOrderId(order.id)}
                    className={`bg-white border border-slate-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-slate-300 transition-colors ${
                      dragOrderId === order.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-mono font-semibold text-slate-900">
                        {order.order_number}
                      </span>
                      <GripVertical className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {order.customer_name}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                      <span className="uppercase">{order.payment_method}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatMoney(order.total, currency)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
