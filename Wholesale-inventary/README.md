# Wholesale Inventory and Billing ERP

A full-stack modern web application built with the MERN stack (MongoDB, Express, React, Node.js) to handle wholesale inventory management, barcode billing, and operational analytics. 

## Features

### Authentication & Authorization
- **Role-Based Access Control**: Separate views and permissions for `admin` and `staff` roles.
- **Secure Authentication**: JWT-based secure sign-in and user registration.

### Dashboard & Analytics
- **Live Dashboard**: View total products, revenue, invoice counts, and low-stock warnings.
- **Sales Analytics**: Visual representation of monthly sales trends and top-selling products.

### Product & Inventory Management
- **Catalog Management**: Add, edit, or remove products with names, categories, descriptions, and pricing.
- **Stock Tracking**: Automatic stock deduction on sales and visual badges for stock health.
- **Low Stock Alerts**: Define custom low-stock thresholds for each item to monitor replenishment needs.
- **Barcode Support**: Assign barcodes for fast checkout lookup.
- **Batch Import**: Bulk import inventory data using CSV files.

### Billing & Invoicing
- **Point of Sale (POS)**: Fast barcode billing interface for counter sales.
- **Invoice Generation**: Automatically generate and store transaction records.
- **PDF Export**: Download customer invoices instantly as PDF files.
- **Payment Status**: Track and update invoice payment statuses (Paid/Unpaid).

### Security & Auditing
- **Audit Logs**: (Admin Only) Track system-wide events including creation, updates, and deletion of records with exact timestamps and actor details.

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (via Mongoose)
- **Authentication**: JSON Web Tokens (JWT), bcryptjs
- **Utilities**: `pdfkit` for invoice generation, `csv-parser` for batch imports, `multer` for file handling.

## Project Structure

- `backend/` - Contains the Express server, Mongoose models, API routes, and PDF generation logic.
- `frontend/` - Contains the React single-page application and Tailwind configuration.

## Installation & Setup

### Prerequisites
- Node.js
- MongoDB running locally or a MongoDB Atlas URI

### 1. Backend Setup

```bash
cd backend
npm install
```
Ensure your `backend/.env` is configured correctly (e.g. `MONGO_URI`, `JWT_SECRET`, `PORT`).
Start the server:
```bash
npm start
# or for development:
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```
Start the frontend application:
```bash
npm run dev
```

Access the application in your browser (usually at `http://localhost:5174/`).
The frontend uses `http://localhost:5000/api` by default, so start the backend first from the `backend/` folder.
