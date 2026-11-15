import React, { useState } from 'react';
import {
  GripVertical,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  CornerDownRight,
  ArrowUp,
  ArrowDown,
  Save,
  Check,
  ChevronRight,
} from 'lucide-react';
import { Category, CmsPage, MenuItem } from '../types';
import { apiRequest } from '../lib/api';

interface DragDropMenuBuilderProps {
  initialItems: MenuItem[];
  categories: Category[];
  cmsPages: CmsPage[];
  onSaved: () => void;
}

interface EditableMenuItem extends MenuItem {
  clientId: string;
  parentClientId: string | null;
}

function normalizeTree(items: MenuItem[]): EditableMenuItem[] {
  const idToClient = new Map<number, string>();
  items.forEach((it) => {
    idToClient.set(it.id, `m-${it.id}`);
  });
  return items.map((it) => ({
    ...it,
    clientId: `m-${it.id}`,
    parentClientId: it.parent_id ? idToClient.get(it.parent_id) ?? null : null,
  }));
}

export const DragDropMenuBuilder: React.FC<DragDropMenuBuilderProps> = ({
  initialItems,
  categories,
  cmsPages,
  onSaved,
}) => {
  const [items, setItems] = useState<EditableMenuItem[]>(() => normalizeTree(initialItems));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropMode, setDropMode] = useState<'reorder' | 'nest'>('reorder');
  const [newLabel, setNewLabel] = useState('');
  const [newTarget, setNewTarget] = useState('catalog');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const topLevel = items.filter((i) => !i.parentClientId);

  const getChildren = (parentClientId: string) =>
    items.filter((i) => i.parentClientId === parentClientId);

  const addCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const newItem: EditableMenuItem = {
      id: 0,
      clientId: `new-${Date.now()}`,
      label: newLabel.trim(),
      href: `#${newTarget}`,
      parent_id: null,
      parentClientId: null,
      sort_order: topLevel.length + 1,
      target_view: newTarget,
      is_visible: 1,
    };
    setItems((prev) => [...prev, newItem]);
    setNewLabel('');
  };

  const quickAddLink = (label: string, target: string) => {
    const newItem: EditableMenuItem = {
      id: 0,
      clientId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      href: `#${target}`,
      parent_id: null,
      parentClientId: null,
      sort_order: items.length + 1,
      target_view: target,
      is_visible: 1,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleDragStart = (clientId: string) => {
    setDraggedId(clientId);
  };

  const handleDropOnItem = (targetClientId: string, mode: 'reorder' | 'nest') => {
    if (!draggedId || draggedId === targetClientId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    setItems((prev) => {
      const dragged = prev.find((i) => i.clientId === draggedId);
      const target = prev.find((i) => i.clientId === targetClientId);
      if (!dragged || !target) return prev;

      // Prevent nesting a parent under its own child
      if (mode === 'nest' && target.parentClientId === dragged.clientId) {
        return prev;
      }

      const withoutDragged = prev.filter((i) => i.clientId !== draggedId);
      const targetIdx = withoutDragged.findIndex((i) => i.clientId === targetClientId);

      const updatedDragged: EditableMenuItem = {
        ...dragged,
        parentClientId: mode === 'nest' ? (target.parentClientId ?? target.clientId) : target.parentClientId,
      };

      const next = [...withoutDragged];
      next.splice(targetIdx, 0, updatedDragged);
      return next.map((item, idx) => ({ ...item, sort_order: idx + 1 }));
    });

    setDraggedId(null);
    setDragOverId(null);
  };

  const moveItem = (clientId: string, direction: -1 | 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.clientId === clientId);
      if (idx < 0) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, moved);
      return copy.map((item, i) => ({ ...item, sort_order: i + 1 }));
    });
  };

  const toggleNest = (clientId: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.clientId === clientId);
      if (idx <= 0) return prev;
      const current = prev[idx];
      if (current.parentClientId) {
        return prev.map((it) => (it.clientId === clientId ? { ...it, parentClientId: null } : it));
      }
      // Find nearest preceding top-level item
      let parentCandidate: EditableMenuItem | null = null;
      for (let i = idx - 1; i >= 0; i--) {
        if (!prev[i].parentClientId) {
          parentCandidate = prev[i];
          break;
        }
      }
      if (!parentCandidate) return prev;
      return prev.map((it) =>
        it.clientId === clientId ? { ...it, parentClientId: parentCandidate!.clientId } : it
      );
    });
  };

  const updateItemField = (clientId: string, field: keyof EditableMenuItem, value: string | number) => {
    setItems((prev) => prev.map((it) => (it.clientId === clientId ? { ...it, [field]: value } : it)));
  };

  const deleteItem = (clientId: string) => {
    setItems((prev) =>
      prev
        .filter((it) => it.clientId !== clientId)
        .map((it) => (it.parentClientId === clientId ? { ...it, parentClientId: null } : it))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const orderedPayload = items.map((it, idx) => ({
        id: it.id || undefined,
        clientId: it.clientId,
        label: it.label,
        href: it.href,
        parent_id: null,
        parentClientId: it.parentClientId,
        sort_order: idx + 1,
        target_view: it.target_view,
        is_visible: it.is_visible,
      }));
      const res = await apiRequest<{ menuItems: MenuItem[] }>('/api/admin/menus/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items: orderedPayload }),
      });
      setItems(normalizeTree(res.menuItems));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
      onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save menu');
    } finally {
      setSaving(false);
    }
  };

  const renderMenuRow = (item: EditableMenuItem, isChild: boolean) => {
    const isOver = dragOverId === item.clientId;
    return (
      <div
        key={item.clientId}
        draggable
        onDragStart={() => handleDragStart(item.clientId)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverId(item.clientId);
        }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={(e) => {
          e.preventDefault();
          handleDropOnItem(item.clientId, dropMode);
        }}
        className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
          isChild ? 'ml-8 bg-slate-50 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-900'
        } ${isOver ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-800'} ${
          draggedId === item.clientId ? 'opacity-50' : ''
        }`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          {isChild && <CornerDownRight className="w-4 h-4 text-slate-400 shrink-0" />}
          <input
            type="text"
            value={item.label}
            onChange={(e) => updateItemField(item.clientId, 'label', e.target.value)}
            className="text-sm font-medium text-slate-900 dark:text-slate-100 bg-transparent border-b border-transparent focus:border-blue-600 focus:outline-none px-1 py-0.5 min-w-[120px]"
          />
          <span className="text-xs font-mono text-slate-400 truncate max-w-[160px]">
            {item.target_view}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => moveItem(item.clientId, -1)}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            title="Move up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveItem(item.clientId, 1)}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            title="Move down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => toggleNest(item.clientId)}
            className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded whitespace-nowrap"
            title={isChild ? 'Promote to top-level' : 'Nest as submenu'}
          >
            {isChild ? 'Outdent' : 'Nest'}
          </button>
          <button
            type="button"
            onClick={() => updateItemField(item.clientId, 'is_visible', item.is_visible ? 0 : 1)}
            className={`p-1.5 rounded ${
              item.is_visible
                ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                : 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={item.is_visible ? 'Visible in header' : 'Hidden from header'}
          >
            {item.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => deleteItem(item.clientId)}
            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"
            title="Delete menu item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Drag & Drop Menu Builder</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Drag items to reorder storefront navigation or nest dropdown sub-menus. Changes publish directly to the live header.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setDropMode('reorder')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                dropMode === 'reorder'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Drop to Reorder
            </button>
            <button
              type="button"
              onClick={() => setDropMode('nest')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                dropMode === 'nest'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Drop to Nest Submenu
            </button>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
          >
            {savedNotice ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Publishing...' : savedNotice ? 'Published to Header' : 'Save & Publish Menu'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-lg">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Add Links & Quick Sources */}
        <div className="lg:col-span-4 space-y-5">
          <form onSubmit={addCustomItem} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add Custom Menu Link</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Navigation Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. New Arrivals"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Destination View / Route</label>
              <select
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="catalog">All Products Catalog</option>
                <option value="track">Order Tracking Page</option>
                {categories.map((c) => (
                  <option key={c.id} value={`category:${c.slug}`}>
                    Category: {c.name}
                  </option>
                ))}
                {cmsPages.map((p) => (
                  <option key={p.id} value={`cms:${p.slug}`}>
                    CMS Page: {p.title}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add to Menu Tree
            </button>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Quick-Add Categories</h3>
            <div className="space-y-1.5">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => quickAddLink(cat.name, `category:${cat.slug}`)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                >
                  <span>{cat.name}</span>
                  <Plus className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Interactive Drag & Drop Tree */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Active Storefront Navigation Structure</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{items.length} links configured</span>
          </div>

          {/* Live Header Preview Strip */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Live Header Preview</div>
            <div className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-800 dark:text-slate-200">
              {topLevel
                .filter((i) => i.is_visible)
                .map((top) => {
                  const kids = getChildren(top.clientId).filter((k) => k.is_visible);
                  return (
                    <span key={top.clientId} className="inline-flex items-center gap-1">
                      {top.label}
                      {kids.length > 0 && (
                        <span className="text-xs text-slate-400 inline-flex items-center">
                          <ChevronRight className="w-3 h-3" /> {kids.length}
                        </span>
                      )}
                    </span>
                  );
                })}
            </div>
          </div>

          <div className="space-y-2">
            {topLevel.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                No menu items yet. Add a link from the left panel.
              </div>
            ) : (
              topLevel.map((top) => {
                const children = getChildren(top.clientId);
                return (
                  <div key={top.clientId} className="space-y-2">
                    {renderMenuRow(top, false)}
                    {children.map((child) => renderMenuRow(child, true))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
