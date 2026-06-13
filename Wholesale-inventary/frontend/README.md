# Wholesale Inventory Frontend

React + Tailwind CSS frontend for the wholesale inventory MERN app.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

The app uses `https://project1-5-ihkm.onrender.com/api` by default. To change it from the browser console:

```js
localStorage.setItem("apiBase", "https://project1-5-ihkm.onrender.com/api");
```

## Features

- Login and first-user registration
- Dashboard statistics from `/api/dashboard/stats`
- Product search, category/barcode filters, pagination, CRUD, CSV import
- Barcode lookup and barcode-based billing
- Invoice history, status updates, PDF download, delete
- Low stock view
- Sales analytics
- Admin audit log viewer
