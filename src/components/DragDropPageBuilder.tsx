import React, { useState } from 'react';
import { GripVertical, Eye, EyeOff, ArrowUp, ArrowDown, Save, Check } from 'lucide-react';
import { HomepageSection } from '../types';
import { apiRequest } from '../lib/api';

interface DragDropPageBuilderProps {
  initialSections: HomepageSection[];
  onSaved: () => void;
}

export const DragDropPageBuilder: React.FC<DragDropPageBuilderProps> = ({
  initialSections,
  onSaved,
}) => {
  const [sections, setSections] = useState<HomepageSection[]>(initialSections);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleDrop = (targetId: number) => {
    if (draggedId === null || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    setSections((prev) => {
      const fromIdx = prev.findIndex((s) => s.id === draggedId);
      const toIdx = prev.findIndex((s) => s.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy.map((s, idx) => ({ ...s, sort_order: idx + 1 }));
    });
    setDraggedId(null);
    setDragOverId(null);
  };

  const moveSection = (id: number, dir: -1 | 1) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const nextIdx = idx + dir;
      if (idx < 0 || nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, moved);
      return copy.map((s, i) => ({ ...s, sort_order: i + 1 }));
    });
  };

  const updateField = (id: number, field: 'title' | 'subtitle' | 'is_visible', value: string | number) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const saveLayout = async () => {
    setSaving(true);
    try {
      const res = await apiRequest<{ sections: HomepageSection[] }>('/api/admin/sections/reorder', {
        method: 'PUT',
        body: JSON.stringify({
          sections: sections.map((s, idx) => ({
            id: s.id,
            title: s.title,
            subtitle: s.subtitle,
            sort_order: idx + 1,
            is_visible: s.is_visible,
            config_json: s.config_json,
          })),
        }),
      });
      setSections(res.sections);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Drag & Drop Homepage Layout Builder</h2>
          <p className="text-sm text-slate-500">
            Reorder storefront sections, edit section headlines inline, or toggle visibility. Updates take effect immediately on the Storefront.
          </p>
        </div>
        <button
          type="button"
          onClick={saveLayout}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          {savedNotice ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving Layout...' : savedNotice ? 'Layout Published' : 'Publish Homepage Layout'}
        </button>
      </div>

      <div className="space-y-4">
        {sections.map((sec, index) => (
          <div
            key={sec.id}
            draggable
            onDragStart={() => setDraggedId(sec.id)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverId(sec.id);
            }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(sec.id);
            }}
            className={`bg-white border rounded-xl p-5 transition-colors ${
              dragOverId === sec.id ? 'border-blue-600 bg-blue-50/30' : 'border-slate-200'
            } ${draggedId === sec.id ? 'opacity-50' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                <button
                  type="button"
                  className="mt-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700"
                  title="Drag section to reorder"
                >
                  <GripVertical className="w-5 h-5" />
                </button>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">0{index + 1}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{sec.section_type.replace('_', ' ')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{sec.is_visible ? 'Visible on Storefront' : 'Hidden'}</span>
                  </div>
                  <input
                    type="text"
                    value={sec.title}
                    onChange={(e) => updateField(sec.id, 'title', e.target.value)}
                    className="w-full text-base font-semibold text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
                  />
                  <input
                    type="text"
                    value={sec.subtitle}
                    onChange={(e) => updateField(sec.id, 'subtitle', e.target.value)}
                    className="w-full text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => moveSection(sec.id, -1)}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                  title="Move section up"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(sec.id, 1)}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                  title="Move section down"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => updateField(sec.id, 'is_visible', sec.is_visible ? 0 : 1)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    sec.is_visible
                      ? 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      : 'border-slate-200 text-slate-400 bg-slate-50'
                  }`}
                >
                  {sec.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {sec.is_visible ? 'Visible' : 'Hidden'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
