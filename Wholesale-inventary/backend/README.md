# Wholesale Inventory Backend

A Node.js Express backend for wholesale inventory and billing system.

## Features

- Authentication & Authorization with JWT
- Password hashing
- Role-based access (Admin, Staff)
- Product Inventory Management
  - Add, update, delete products
  - Search and filter products
  - Product categories and stock quantity
  - Barcode support
  - Product image upload
  - Batch import from CSV
  - Product status (active/inactive)
- Billing / Invoice System
  - Create invoices with multiple products
  - GST calculations (18%)
  - Automatic totals
  - Invoice history
  - PDF invoice generation and download
  - Invoice number generation (INV-YYYY-NNN)
- Automatic Stock Management
  - Stock decreases automatically on invoice creation
  - Low stock alerts (threshold-based)
  - Low stock product listing
- Sales Analytics APIs
  - Total sales quantity
  - Monthly sales and revenue
  - Top-selling products
  - Total revenue
  - Total invoices count
- Low Stock Alerts
  - Configurable minimum stock threshold
  - Automatic low stock detection
  - Low stock alerts endpoint
- Barcode System
  - Barcode uniqueness enforcement
  - Fast barcode search with indexing
  - Barcode-based product lookup
  - Barcode search in product filtering
- Audit Logs
  - Track all user actions (create, update, delete)
  - Log entity changes with old/new values
  - Professional ERP-style activity tracking
  - Admin-only audit trail API with filters and pagination
  - Captures actor role, timestamp, IP address, and browser/user agent
- Dashboard Statistics API
  - Single endpoint for key metrics
  - Total products, revenue, invoices, low stock count
- Enhanced Search & Filtering
  - Search by product name or barcode
  - Category and status filters
  - Pagination support

## Project Structure

- `api/` - API route handlers (userapi.js, productapi.js, etc.)
- `models/` - Database models
- `middleware/` - Authentication and audit middleware
- `uploads/` - Product image uploads

1. Install dependencies: `npm install`
2. Set up MongoDB and update .env MONGO_URI
3. Run: `npm run dev`

## API Documentation

Complete API documentation is available in `openapi.yaml` (OpenAPI 3.0 specification).

## API

### Auth

- POST /api/auth/register - Register user
- POST /api/auth/login - Login

### Products

- GET /api/products - List products (with search, filter, pagination)
  - Query params: search, category, status, barcode, page, limit
  - Example: `/api/products?search=rice&page=1`
  - Response includes: products, total, totalPages, currentPage, limit
- POST /api/products - Add product (admin only, supports image upload)
- PUT /api/products/:id - Update product (admin only, supports image upload)
- DELETE /api/products/:id - Delete product (admin only)
- POST /api/products/batch - Batch import products from CSV (admin only)
- GET /api/products/low-stock - Get products with low stock

### Invoices

- GET /api/invoices - List invoices (with filter, pagination)
  - Query params: status, customer, page, limit
- POST /api/invoices - Create invoice (deducts stock)
  - Items can use either product id (`product`) or scanned barcode (`barcode`)
- PUT /api/invoices/:id/status - Update invoice status
- DELETE /api/invoices/:id - Delete invoice and create an audit log
- GET /api/invoices/:id/pdf - Download invoice PDF

### Audit Logs

- GET /api/audit-logs - List audit logs (admin only)
  - Query params: action, entity, user, search, from, to, page, limit
  - Example events: `Admin updated product Rice Bag (price)`, `Staff deleted invoice INV-2026-001`
- GET /api/audit-logs/:id - View one audit log with old/new values

### Analytics

- GET /api/analytics/total-sales - Total quantity sold
- GET /api/analytics/monthly-sales - Monthly sales and revenue data
- GET /api/analytics/top-products - Top 10 selling products
- GET /api/analytics/total-revenue - Total revenue from all invoices
- GET /api/analytics/total-invoices - Total number of invoices

### Dashboard

- GET /api/dashboard/stats - Single dashboard statistics API
  - Returns: totalProducts, totalRevenue, totalInvoices, lowStockCount
  - Frontend should use this endpoint instead of calculating totals client-side

### Products (Enhanced)

- GET /api/products?search=rice&page=1 - Search by product name or barcode with pagination
- GET /api/products?category=Grains&page=1&limit=20 - Filter products by category
- GET /api/products?barcode=123456789 - Fast exact barcode filter
- GET /api/products/barcode/:barcode - Get product by barcode
- GET /api/products/low-stock - Get products with low stock

### Protected Routes

- GET /api/admin - Admin only
- GET /api/staff - Staff only
- GET /api/admin - Admin only
- GET /api/staff - Staff only
