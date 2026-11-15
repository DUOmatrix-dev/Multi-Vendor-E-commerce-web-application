import React, { useMemo, useState } from 'react';
import {
  ShoppingBag,
  ChevronDown,
  User as UserIcon,
  LogOut,
  LayoutDashboard,
  Store,
  Monitor,
  Search,
  Package,
  Heart,
  X,
  Award,
  Scale,
  Film,
  Headphones,
  Layers,
  Truck,
} from 'lucide-react';
import { AppWorkspace, CurrencyCode, MenuItem, Product, User } from '../types';
import { formatMoney } from '../lib/currency';
import { ResilientImage } from './ResilientImage';

interface TopBarProps {
  storeName: string;
  menuItems: MenuItem[];
  products: Product[];
  currency: CurrencyCode;
  cartCount: number;
  wishlistCount: number;
  compareCount: number;
  unreadNotificationsCount?: number;
  user: User | null;
  workspace: AppWorkspace;
  onSelectWorkspace: (ws: AppWorkspace) => void;
  onNavigateRoute: (route: string) => void;
  onSelectSearchProduct: (product: Product) => void;
  onSearchCatalog: (query: string) => void;
  onOpenCart: () => void;
  onOpenVoice: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  storeName,
  menuItems,
  products,
  currency,
  cartCount,
  wishlistCount,
  compareCount,
  unreadNotificationsCount = 0,
  user,
  workspace,
  onSelectWorkspace,
  onNavigateRoute,
  onSelectSearchProduct,
  onSearchCatalog,
  onOpenCart,
  onOpenVoice,
  onOpenAuth,
  onLogout,
}) => {
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const topLinks = menuItems.filter((m) => !m.parent_id).slice(0, 5);
  const getChildren = (parentId: number) => menuItems.filter((m) => m.parent_id === parentId);

  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.category_name || '').toLowerCase().includes(q) ||
          (p.vendor_name || '').toLowerCase().includes(q) ||
          p.short_description.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [products, searchTerm]);

  const handleLinkClick = (item: MenuItem) => {
    setOpenDropdownId(null);
    onSelectWorkspace('storefront');
    onNavigateRoute(item.target_view || 'catalog');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearchFocused(false);
    onSearchCatalog(searchTerm.trim());
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            onSelectWorkspace('storefront');
            onNavigateRoute('catalog');
          }}
          className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          {storeName || 'OmniMart'}
        </button>

        {/* Zone 2: Dynamic Drag & Drop Menu Links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {topLinks.map((item) => {
            const children = getChildren(item.id);
            if (children.length === 0) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleLinkClick(item)}
                  className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 hover:underline underline-offset-4"
                >
                  {item.label}
                </button>
              );
            }
            return (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={() => setOpenDropdownId(item.id)}
                onMouseLeave={() => setOpenDropdownId(null)}
              >
                <button
                  type="button"
                  onClick={() => handleLinkClick(item)}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1"
                >
                  {item.label}
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {openDropdownId === item.id && (
                  <div className="absolute left-0 top-full pt-1 w-48 z-50">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-1.5">
                      {children.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => handleLinkClick(child)}
                          className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Real-time Catalog Search Bar */}
        <div className="relative flex-1 max-w-xs sm:max-w-sm">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSearchFocused(true);
              }}
              placeholder="Search products, SKUs, vendors..."
              aria-label="Search catalog"
              className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 rounded-lg focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-600 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  onSearchCatalog('');
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          {searchFocused && searchTerm.trim() && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSearchFocused(false)}
              />
              <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                    No catalog products matched "{searchTerm}"
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSearchFocused(false);
                          onSelectSearchProduct(p);
                        }}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                      >
                        <div className="w-11 h-9 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                          <ResilientImage
                            src={p.image_url}
                            alt={p.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{p.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {p.category_name} · {p.vendor_name}
                          </div>
                        </div>
                        <div className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                          {formatMoney(p.price, currency)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSearchFocused(false);
                    onSearchCatalog(searchTerm.trim());
                  }}
                  className="w-full px-4 py-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border-t border-slate-200 dark:border-slate-800 text-center"
                >
                  Filter Storefront Catalog for "{searchTerm.trim()}"
                </button>
              </div>
            </>
          )}
        </div>

        {/* Zone 3: Single Primary Action & Workspace Menu */}
        <div className="flex items-center gap-2 shrink-0 relative">
          <button
            type="button"
            onClick={() => {
              onSelectWorkspace('storefront');
              onNavigateRoute('wishlist');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
            aria-label="Open saved wishlist"
          >
            <Heart className={`w-4 h-4 ${wishlistCount > 0 ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span className="font-mono tabular-nums">{wishlistCount}</span>
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
            aria-label="Open shopping bag"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="font-mono tabular-nums">{cartCount}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <UserIcon className="w-3.5 h-3.5" />
              {user ? user.name.split(' ')[0] : 'Portals & Sign In'}
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>

            {accountMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAccountMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {user ? user.name : 'Switch Workspace'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {user ? `${user.email} · ${user.role}` : 'Open Storefront, Vendor, Admin, or POS'}
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('storefront');
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        workspace === 'storefront' ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Store className="w-4 h-4" />
                      Customer Storefront
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('storefront');
                        onNavigateRoute('account');
                      }}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <Award className="w-4 h-4" />
                        Account &amp; Rewards
                      </span>
                      {user && (
                        <span className="text-xs font-mono text-blue-600 dark:text-blue-400 tabular-nums">
                          {unreadNotificationsCount > 0 ? `${unreadNotificationsCount} alert · ` : ''}
                          {(user.loyalty_points ?? 0).toLocaleString()} pts
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('storefront');
                        onNavigateRoute('orders');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Package className="w-4 h-4" />
                      My Order History
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('storefront');
                        onNavigateRoute('track');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Truck className="w-4 h-4" />
                      Track Order
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('storefront');
                        onNavigateRoute('wishlist');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Heart className="w-4 h-4" />
                      Saved Wishlist ({wishlistCount})
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('storefront');
                        onNavigateRoute('compare');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Scale className="w-4 h-4" />
                      Compare Products ({compareCount})
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('storefront');
                        onNavigateRoute('bundles');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Layers className="w-4 h-4" />
                      Bundle Builder
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('storefront');
                        onNavigateRoute('studio');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Film className="w-4 h-4" />
                      Photo-to-Video Studio
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onOpenVoice();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Headphones className="w-4 h-4" />
                      Live Voice Concierge
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('admin');
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        workspace === 'admin' ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Admin Dashboard & Builders
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('vendor');
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        workspace === 'vendor' ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Store className="w-4 h-4" />
                      Vendor Seller Portal
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSelectWorkspace('pos');
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        workspace === 'pos' ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Monitor className="w-4 h-4" />
                      POS Register Terminal
                    </button>
                  </div>

                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                    {user ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            onOpenAuth();
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Switch Account
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            onLogout();
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Sign Out
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          onOpenAuth();
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                      >
                        Sign In / Register
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
