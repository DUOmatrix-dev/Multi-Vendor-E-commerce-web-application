[README-omnimart.md](https://github.com/user-attachments/files/34880213/README-omnimart.md)
<div align="center">

OmniMart

 Multi-Vendor E-commerce Marketplace

A full-stack marketplace platform where customers can shop from multiple independent vendors, sellers can manage their stores, and administrators can oversee marketplace operations from one centralized system.

</div>



 Overview

OmniMart is a multi-vendor e-commerce web application built with React, TypeScript, Express, and SQLite. It combines a customer-facing storefront with dedicated workspaces for administrators, vendors, and point-of-sale operations.

The application includes product and category management, customer accounts, vendor stores, order processing, commissions, payouts, coupons, wishlists, content management, and configurable storefront sections.

The project is structured as a full-stack application: the React frontend communicates with an Express API, while a local SQLite database stores marketplace data.

 Main Features

Customer Storefront

- Browse published products from multiple vendors.
- Explore products by category.
- Search the product catalog.
- View product details, available variants, pricing, stock, and vendor information.
- Add products and variants to the shopping cart.
- Apply coupon codes during checkout.
- Submit product reviews and ratings.
- Save products to a wishlist.
- View store pages and published CMS pages.
- Browse configurable homepage sections and navigation menus.
- Select from supported display currencies.

 Vendor Portal

- Dedicated vendor workspace and dashboard.
- Manage vendor products and product details.
- Configure product types, prices, stock, images, and variants.
- View orders containing the vendor's products.
- Track vendor balances, earnings, and platform commissions.
- Request and monitor payouts.
- Manage a vendor storefront profile.

 Administrator Console

- Centralized marketplace administration.
- Manage vendors and vendor status.
- Oversee products, categories, and orders.
- Manage coupons and store settings.
- Configure homepage sections.
- Build and organize navigation menus using drag-and-drop controls.
- Create and manage content pages with a page builder.
- Review marketplace activity and operational information.

 Point of Sale (POS)

- Dedicated POS workspace for in-person sales.
- Create orders through the POS interface.
- Record POS transactions separately from storefront orders.
- Support walk-in customer transactions.

 Order and Marketplace Management

- Track order and payment statuses.
- Manage order items across different vendors.
- Calculate vendor payouts and platform commissions.
- Organize order workflows with a Kanban-style order board.
- Support physical products, digital products, licenses, and affiliate product types in the product data model.
- Generate license keys for supported license products.

 Technology Stack

| Technology | Role |
|---|---|
| React 19 | Frontend user interface |
| TypeScript | Type-safe frontend and backend code |
| Vite 8 | Frontend development server and build tool |
| Express | Backend API and HTTP server |
| SQLite | Relational database |
| better-sqlite3 | SQLite database access |
| JWT | Authentication tokens and session verification |
| bcryptjs | Password hashing |
| cookie-parser | HTTP cookie handling |
| Tailwind CSS 4 | Utility-first styling |
| Motion | Interface animations |
| Recharts | Data visualization |
| Lucide React | Interface icons |

Application Architecture

OmniMart uses a client-server architecture:

1. The React frontend renders the storefront and role-specific workspaces.
2. The frontend sends requests to the Express API using the shared API utility.
3. The backend validates requests and checks user authentication and role permissions where required.
4. The backend reads and writes marketplace records using better-sqlite3.
5. The API returns JSON responses for the frontend to display.

```text
Browser
   |
   v
React + TypeScript + Vite
   |
   | HTTP requests (/api/...)
   v
Express API (server.ts)
   |
   | Database queries
   v
SQLite Database (omnimart.db)
```

 Project Structure

```text
omnimart/
│
├── public/                         # Public static files, if added
│
├── server/
│   └── db.ts                       # SQLite connection, schema and seed data
│
├── src/
│   ├── assets/
│   │   └── images/                 # Product and storefront images
│   │
│   ├── components/
│   │   ├── AdminDashboard.tsx      # Administrator workspace
│   │   ├── AuthModal.tsx            # Login and registration interface
│   │   ├── CartDrawer.tsx           # Shopping cart drawer
│   │   ├── DragDropMenuBuilder.tsx  # Navigation menu builder
│   │   ├── DragDropPageBuilder.tsx  # CMS page builder
│   │   ├── OrderKanbanBoard.tsx     # Order workflow board
│   │   ├── PosTerminal.tsx          # Point-of-sale interface
│   │   ├── ProductDetailModal.tsx   # Product details interface
│   │   ├── ProductFormModal.tsx     # Product creation/editing form
│   │   ├── ResilientImage.tsx       # Image display with fallback handling
│   │   ├── StorefrontView.tsx       # Customer-facing storefront
│   │   ├── TopBar.tsx               # Main navigation and header
│   │   └── VendorDashboard.tsx     # Vendor workspace
│   │
│   ├── lib/
│   │   ├── api.ts                   # Shared frontend API request utility
│   │   └── currency.ts              # Currency formatting and product attributes
│   │
│   ├── App.tsx                      # Main app state and workspace routing
│   ├── index.css                    # Global application styles
│   ├── main.tsx                     # React application entry point
│   └── types.ts                     # Shared TypeScript interfaces and types
│
├── .env.example                     # Example environment variables
├── .gitignore                       # Git exclusions
├── index.html                       # HTML entry document
├── metadata.json                    # Application metadata
├── package.json                     # Dependencies and npm scripts
├── server.ts                        # Express server and API routes
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # Vite and React configuration
├── bun.lock                         # Bun dependency lockfile
└── README.md                        # Project documentation
```

 Getting Started

 Prerequisites

Install:

- [Node.js](https://nodejs.org/)
- npm (included with Node.js)

The project uses `better-sqlite3`, a native Node.js module. If your environment cannot use a prebuilt binary, make sure the tools required to compile native Node modules are installed.

 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
```

 2. Enter the project directory

```bash
cd omnimart
```

If your cloned folder has a different name, use that folder name instead.

 3. Install dependencies

```bash
npm install
```

4. Configure environment variables

Create a local environment file from the example:

```bash
cp .env.example .env
```

Open `.env` and configure the values:

```env
GEMINI_API_KEY=your_gemini_api_key
APP_URL=http://localhost:3000
JWT_SECRET=replace_with_a_long_random_secret
```

`GEMINI_API_KEY` is included in the example configuration for Gemini API integration. The current core application setup should be checked for any specific AI feature that requires it.

Security: Never commit your real `.env` file or production secrets. Use a strong, unique `JWT_SECRET` in every deployed environment. The development fallback secret in the source code must not be used in production.

 5. Start the application

```bash
npm run dev
```

The development server starts the Express backend and Vite frontend. Open:

```text
http://localhost:3000
```

The Express server initializes the SQLite database automatically when it starts.

 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Express server with the Vite development middleware using `tsx`. |
| `npm run build` | Builds the frontend for production using Vite. |
| `npm run preview` | Runs Vite's production preview server. |
| `npm run lint` | Runs the TypeScript compiler without emitting files. |
| `npm run clean` | Removes the `dist` directory and `server.js` if present. |
| `npm start` | Runs `node server.ts`; check runtime support for TypeScript before using this script in deployment. |

For local development, `npm run dev` is the recommended command.

 Database

OmniMart uses SQLite through `better-sqlite3`.

The database connection is configured in:

```text
server/db.ts
```

The database file is created in the project root as:

```text
omnimart.db
```

On startup, the application initializes the database schema and inserts demonstration data if the users table is empty.

The database schema includes tables for:

- Users and vendors
- Categories and products
- Orders and order items
- Coupons
- Navigation menu items
- Homepage sections and CMS pages
- Product reviews
- Vendor payouts
- Store settings
- Wishlist items

 Demo Accounts

The database seed routine creates demonstration accounts when the database is first initialized.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@omnimart.com` | `admin123` |
| Vendor | `vendor@omnimart.com` | `vendor123` |
| Vendor | `atelier@omnimart.com` | `vendor123` |
| Customer | `customer@omnimart.com` | `customer123` |

These are **development/demo credentials only**. Change or remove them before deploying the application publicly. Do not use these passwords for real accounts.

If the database has already been created, the seed routine does not automatically recreate missing demo accounts. For a fresh demo database, stop the server and back up or remove the local `omnimart.db` file before restarting. This resets local database data, so do not do this if you need to preserve existing records.

 Authentication and Roles

The application defines three main user roles:

| Role | Purpose |
|---|---|
| `admin` | Oversees the marketplace and manages platform settings and operations. |
| `vendor` | Manages a vendor store, products, orders, earnings, and payout requests. |
| `customer` | Shops, places orders, manages a wishlist, and interacts with products. |

The backend uses signed JWTs for authentication. Tokens are accepted through the `omnimart_token` cookie or an Authorization Bearer header. Passwords are hashed with bcryptjs.

Role-protected API routes use authentication middleware to restrict access to authorized users.

 Currency

The frontend currency utility currently supports:

- USD — US Dollar
- EUR — Euro
- GBP — British Pound

The conversion rates are defined in `src/lib/currency.ts`. They are static values in the application, not live exchange rates. Update them or connect a reliable exchange-rate service before using currency conversion for real transactions.

 Production Build

Build the frontend:

```bash
npm run build
```

Vite generates the production frontend files in:

```text
dist/
```

The current `server.ts` includes the development Vite middleware setup. Before deploying, configure the Express server to serve the built frontend from `dist/` and verify that all API routes, static assets, database paths, and environment variables work in the target hosting environment.

Because the application uses SQLite and a native Node module, choose a hosting environment that supports persistent disk storage and the required Node.js runtime. A serverless static hosting deployment alone will not run the Express API or provide persistent SQLite storage.

 Important Deployment and Security Notes

Before using OmniMart as a live marketplace:

- Replace all demo credentials and development secrets.
- Set a strong `JWT_SECRET` through the hosting provider's environment settings.
- Use HTTPS in production and configure secure cookie options.
- Review authentication, authorization, input validation, and rate limiting.
- Configure persistent storage and reliable database backups.
- Verify that vendor access is restricted to the correct vendor's products, orders, and payout data.
- Connect and test a real payment provider if online payments are required.
- Configure email delivery, order notifications, and any required shipping integrations.
- Review digital download and license-delivery access controls.
- Replace sample product content and images with assets you have permission to use.
- Review the currency conversion approach before accepting payments in multiple currencies.

The supplied project includes order and payment status fields and demo order data. Do not assume that a live payment gateway is configured merely because payment methods or statuses appear in the interface or database.

 Customization

Common starting points for extending the application:

- Storefront layout and product browsing: `src/components/StorefrontView.tsx`
- Global navigation and workspace switching: `src/components/TopBar.tsx` and `src/App.tsx`
- Administrator features: `src/components/AdminDashboard.tsx`
- Vendor features: `src/components/VendorDashboard.tsx`
- POS workflow: `src/components/PosTerminal.tsx`
- Product forms: `src/components/ProductFormModal.tsx`
- Database schema and seed data: `server/db.ts`
- API routes and business logic: `server.ts`
- Shared data models: `src/types.ts`
- API client: `src/lib/api.ts`
- Currency formatting: `src/lib/currency.ts`

 Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Run the application and test the affected workflows.
5. Run `npm run lint` and `npm run build`.
6. Submit a pull request describing your changes.

 License

No project-level license was identified in the supplied source files. Unless a license is added, the default copyright rules apply. Before redistributing this project, confirm that you have permission to distribute all included source code, images, and other assets, and add a license that reflects the permissions you intend to grant.
