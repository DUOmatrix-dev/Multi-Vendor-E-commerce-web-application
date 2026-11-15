import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Category, Product, ProductAttribute, Vendor } from '../types';
import { parseAttributes } from '../lib/currency';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>, existingId?: number) => Promise<void>;
  categories: Category[];
  vendors?: Vendor[];
  initialProduct?: Product | null;
  showVendorSelect?: boolean;
}

const STUDIO_IMAGES = [
  { label: 'Studio Headphones', url: '/src/assets/images/product_wireless_headphones_1794763519971.jpg' },
  { label: 'Chronograph Watch', url: '/src/assets/images/product_chronograph_watch_1794763521133.jpg' },
  { label: 'Leather Commuter Pack', url: '/src/assets/images/product_leather_backpack_1794763521421.jpg' },
  { label: 'Espresso Machine', url: '/src/assets/images/product_espresso_machine_1794763521156.jpg' },
  { label: 'Mechanical Keyboard', url: '/src/assets/images/product_mechanical_keyboard_1794763521199.jpg' },
  { label: 'Ceramic Table Lamp', url: '/src/assets/images/product_ceramic_lamp_1794763522525.jpg' },
  { label: 'Running Sneakers', url: '/src/assets/images/product_running_sneakers_1794763522645.jpg' },
  { label: 'Studio Hero Kit', url: '/src/assets/images/hero_omnimart_showcase_1794763520340.jpg' },
];

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categories,
  vendors = [],
  initialProduct,
  showVendorSelect = false,
}) => {
  const [title, setTitle] = useState(initialProduct?.title || '');
  const [sku, setSku] = useState(initialProduct?.sku || `OM-${Date.now().toString().slice(-5)}`);
  const [categoryId, setCategoryId] = useState(String(initialProduct?.category_id || categories[0]?.id || 1));
  const [vendorId, setVendorId] = useState(String(initialProduct?.vendor_id || vendors[0]?.id || 1));
  const [productType, setProductType] = useState<Product['product_type']>(
    initialProduct?.product_type || 'physical'
  );
  const [price, setPrice] = useState(String(initialProduct?.price ?? '149'));
  const [compareAtPrice, setCompareAtPrice] = useState(
    initialProduct?.compare_at_price ? String(initialProduct.compare_at_price) : ''
  );
  const [stock, setStock] = useState(String(initialProduct?.stock ?? '25'));
  const [imageUrl, setImageUrl] = useState(
    initialProduct?.image_url || STUDIO_IMAGES[0].url
  );
  const [shortDesc, setShortDesc] = useState(initialProduct?.short_description || '');
  const [description, setDescription] = useState(initialProduct?.description || '');
  const [licenseTemplate, setLicenseTemplate] = useState(
    initialProduct?.license_key_template || 'OMNI-PRO-XXXX-XXXX'
  );
  const [digitalUrl, setDigitalUrl] = useState(initialProduct?.digital_file_url || '');
  const [affiliateUrl, setAffiliateUrl] = useState(initialProduct?.affiliate_url || '');
  const [isFeatured, setIsFeatured] = useState(Boolean(initialProduct?.is_featured));
  const [status, setStatus] = useState<'published' | 'draft'>(
    initialProduct?.status || 'published'
  );
  const [attributes, setAttributes] = useState<ProductAttribute[]>(() =>
    initialProduct ? parseAttributes(initialProduct.attributes_json) : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const addAttributeGroup = () => {
    setAttributes((prev) => [
      ...prev,
      { name: 'Edition', options: [{ label: 'Standard', priceDelta: 0, stock: 15 }] },
    ]);
  };

  const addOptionToGroup = (groupIdx: number) => {
    setAttributes((prev) =>
      prev.map((g, idx) =>
        idx === groupIdx
          ? { ...g, options: [...g.options, { label: 'Variant', priceDelta: 20, stock: 10 }] }
          : g
      )
    );
  };

  const updateGroupName = (groupIdx: number, name: string) => {
    setAttributes((prev) => prev.map((g, idx) => (idx === groupIdx ? { ...g, name } : g)));
  };

  const updateOption = (
    groupIdx: number,
    optIdx: number,
    field: 'label' | 'priceDelta' | 'stock',
    value: string
  ) => {
    setAttributes((prev) =>
      prev.map((g, idx) =>
        idx === groupIdx
          ? {
              ...g,
              options: g.options.map((o, oIdx) =>
                oIdx === optIdx
                  ? { ...o, [field]: field === 'label' ? value : Number(value) || 0 }
                  : o
              ),
            }
          : g
      )
    );
  };

  const removeAttributeGroup = (groupIdx: number) => {
    setAttributes((prev) => prev.filter((_, idx) => idx !== groupIdx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(
        {
          title,
          sku,
          category_id: Number(categoryId),
          vendor_id: Number(vendorId),
          product_type: productType,
          price: Number(price),
          compare_at_price: compareAtPrice ? Number(compareAtPrice) : null,
          stock: Number(stock),
          image_url: imageUrl,
          short_description: shortDesc,
          description,
          digital_file_url: digitalUrl,
          license_key_template: licenseTemplate,
          affiliate_url: affiliateUrl,
          attributes_json: JSON.stringify(attributes),
          is_featured: isFeatured,
          status,
        },
        initialProduct?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {initialProduct ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Product Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Studio Reference Monitors"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">SKU</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Product Type</label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value as Product['product_type'])}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                <option value="physical">Physical Product</option>
                <option value="digital">Digital Download</option>
                <option value="license">License Key Software</option>
                <option value="affiliate">Affiliate / External Link</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {showVendorSelect && vendors.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Assigned Vendor</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={String(v.id)}>
                      {v.shop_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Price (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Compare-At Price (Optional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={compareAtPrice}
                onChange={(e) => setCompareAtPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stock Quantity</label>
              <input
                type="number"
                min="0"
                required
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Studio Image Preset</label>
              <select
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                {STUDIO_IMAGES.map((img) => (
                  <option key={img.url} value={img.url}>
                    {img.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {productType === 'license' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">License Key Pattern</label>
                <input
                  type="text"
                  value={licenseTemplate}
                  onChange={(e) => setLicenseTemplate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Download File URL</label>
                <input
                  type="text"
                  value={digitalUrl}
                  onChange={(e) => setDigitalUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {productType === 'affiliate' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">External Affiliate URL</label>
              <input
                type="url"
                value={affiliateUrl}
                onChange={(e) => setAffiliateUrl(e.target.value)}
                placeholder="https://partner.example.com/item"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Short Summary</label>
            <input
              type="text"
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              placeholder="Concise 1-line specification summary"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full Product Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Dynamic Attribute & Variant Builder */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">Attribute Variants (Price & Stock)</span>
              <button
                type="button"
                onClick={addAttributeGroup}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Attribute
              </button>
            </div>
            {attributes.map((group, gIdx) => (
              <div key={gIdx} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2.5 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={group.name}
                    onChange={(e) => updateGroupName(gIdx, e.target.value)}
                    placeholder="Attribute name (e.g. Color)"
                    className="text-sm font-medium bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addOptionToGroup(gIdx)}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + Option
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAttributeGroup(gIdx)}
                      className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {group.options.map((opt, oIdx) => (
                    <div key={oIdx} className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => updateOption(gIdx, oIdx, 'label', e.target.value)}
                        placeholder="Option label"
                        className="px-2.5 py-1 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <input
                        type="number"
                        value={opt.priceDelta}
                        onChange={(e) => updateOption(gIdx, oIdx, 'priceDelta', e.target.value)}
                        placeholder="Price +/-"
                        className="px-2.5 py-1 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <input
                        type="number"
                        value={opt.stock}
                        onChange={(e) => updateOption(gIdx, oIdx, 'stock', e.target.value)}
                        placeholder="Stock"
                        className="px-2.5 py-1 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                Featured on Homepage
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'published' | 'draft')}
                className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : initialProduct ? 'Update Product' : 'Create Product'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
