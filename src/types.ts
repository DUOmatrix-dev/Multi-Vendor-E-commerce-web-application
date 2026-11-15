export type UserRole = 'admin' | 'vendor' | 'customer';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  loyalty_points?: number;
}

export interface Vendor {
  id: number;
  user_id: number;
  shop_name: string;
  slug: string;
  description: string;
  commission_rate: number;
  status: 'active' | 'pending' | 'suspended';
  balance: number;
  total_earnings: number;
  low_stock_threshold?: number;
  created_at: string;
  owner_name?: string;
  owner_email?: string;
  product_count?: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  is_active: number;
}

export interface ProductAttributeOption {
  label: string;
  priceDelta: number;
  stock: number;
}

export interface ProductAttribute {
  name: string;
  options: ProductAttributeOption[];
}

export interface Product {
  id: number;
  vendor_id: number;
  category_id: number;
  category_name?: string;
  category_slug?: string;
  vendor_name?: string;
  vendor_slug?: string;
  vendor_description?: string;
  title: string;
  slug: string;
  sku: string;
  product_type: 'physical' | 'digital' | 'license' | 'affiliate';
  price: number;
  compare_at_price: number | null;
  stock: number;
  image_url: string;
  short_description: string;
  description: string;
  attributes_json: string;
  digital_file_url: string;
  license_key_template: string;
  affiliate_url: string;
  is_featured: number;
  status: 'published' | 'draft';
  rating: number;
  review_count: number;
  created_at: string;
}

export interface BundleComponentItem {
  id: number;
  bundle_id: number;
  product_id: number;
  quantity: number;
  title: string;
  slug: string;
  sku: string;
  price: number;
  stock: number;
  product_type: 'physical' | 'digital' | 'license' | 'affiliate';
  image_url: string;
  short_description: string;
  category_name: string;
  status: string;
}

export interface ProductBundle {
  id: number;
  vendor_id: number;
  vendor_name: string;
  vendor_slug: string;
  title: string;
  slug: string;
  description: string;
  discount_percent: number;
  image_url: string;
  is_active: number;
  created_at: string;
  items: BundleComponentItem[];
  regular_total: number;
  bundle_price: number;
  savings: number;
  available_stock: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  bundle_id?: number | null;
  vendor_id: number;
  title: string;
  sku: string;
  variant_label: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vendor_payout: number;
  platform_commission: number;
  license_key: string;
}

export type OrderTag = 'Priority' | 'Backorder' | 'Gift';

export interface Order {
  id: number;
  order_number: string;
  user_id: number | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_postal: string;
  payment_method: string;
  payment_status: 'paid' | 'pending' | 'refunded';
  order_status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  subtotal: number;
  discount_total: number;
  tax_total: number;
  shipping_total: number;
  total: number;
  coupon_code: string;
  source: 'storefront' | 'pos';
  expected_delivery_date?: string;
  shipping_carrier?: string;
  tracking_code?: string;
  points_earned?: number;
  points_redeemed?: number;
  loyalty_discount?: number;
  order_notes?: string;
  tags?: OrderTag[];
  updated_at?: string;
  created_at: string;
  items?: OrderItem[];
}

export interface Coupon {
  id: number;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  min_spend: number;
  usage_limit: number;
  used_count: number;
  expires_at: string;
  is_active: number;
}

export interface MenuItem {
  id: number;
  clientId?: string;
  label: string;
  href: string;
  parent_id: number | null;
  parentClientId?: string | null;
  sort_order: number;
  target_view: string;
  is_visible: number;
}

export interface HomepageSection {
  id: number;
  section_key: string;
  title: string;
  subtitle: string;
  section_type: 'hero' | 'featured_grid' | 'craft_editorial' | 'category_showcase';
  sort_order: number;
  is_visible: number;
  config_json: string;
}

export interface CmsPage {
  id: number;
  title: string;
  slug: string;
  content: string;
  meta_title: string;
  meta_description: string;
  is_published: number;
  updated_at: string;
}

export interface Review {
  id: number;
  product_id: number;
  user_id?: number | null;
  author_name: string;
  rating: number;
  comment: string;
  verified_purchase?: number | boolean;
  created_at: string;
}

export interface Payout {
  id: number;
  vendor_id: number;
  shop_name?: string;
  amount: number;
  method: string;
  account_details: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  created_at: string;
}

export interface CartItem {
  key: string;
  product?: Product;
  bundle?: ProductBundle;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
}

export interface LoyaltyTransaction {
  id: number;
  user_id: number;
  order_id: number | null;
  order_number?: string;
  points_delta: number;
  type: 'earn' | 'redeem' | 'bonus';
  description: string;
  created_at: string;
}

export interface AccountNotification {
  id: number;
  user_id: number;
  product_id: number | null;
  type: 'price_drop' | 'system';
  title: string;
  message: string;
  old_price: number | null;
  new_price: number | null;
  email_dispatched_to: string;
  is_read: number;
  created_at: string;
  product_slug?: string;
  product_image_url?: string;
  current_price?: number;
}

export interface WishlistShare {
  id: number;
  user_id: number;
  share_token: string;
  title: string;
  is_public: number;
  updated_at: string;
  created_at: string;
}

export type CurrencyCode = 'USD' | 'EUR' | 'GBP';

export type AppWorkspace = 'storefront' | 'admin' | 'vendor' | 'pos';
