import { useCallback, useEffect, useMemo, useState } from 'react';

const fallbackApiBase = 'https://project1-5-ihkm.onrender.com/api';
const normalizeApiBase = (value, fallback = fallbackApiBase) => {
  const apiBase = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(apiBase)) return fallback;
  return /\/api$/i.test(apiBase) ? apiBase : `${apiBase}/api`;
};
const rawApiBase = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE
  ? String(import.meta.env.VITE_API_BASE).trim()
  : '';
const normalizedApiBase = normalizeApiBase(rawApiBase);
const savedApiBase = typeof window !== 'undefined' ? localStorage.getItem('apiBase') : '';
const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const API_BASE = isLocalhost
  ? (savedApiBase && !/localhost|127\.0\.0\.1/.test(savedApiBase) ? normalizeApiBase(savedApiBase) : 'http://localhost:5000/api')
  : normalizedApiBase;

const emptyProductFilters = { search: '', category: '', barcode: '', status: '', page: 1 };
const emptyInvoiceFilters = { status: '', customer: '', page: 1 };
const emptyAuditFilters = { action: '', entity: '', search: '', page: 1 };

function currency(value) {
  return Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
}

function productPackLabel(product) {
  if (!product?.packSize || !product?.unit) return '';
  return `${product.packSize} ${product.unit}`;
}

function params(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.append(key, value);
  });
  return query.toString();
}

function isObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || '').trim());
}

function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  return { toast, showToast };
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [view, setView] = useState('dashboard');
  const { toast, showToast } = useToast();

  const request = useCallback(async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.blob();

    if (!response.ok) {
      if (response.status === 401 && token) {
        setToken('');
        setRole('');
        setView('dashboard');
        localStorage.removeItem('token');
        localStorage.removeItem('role');
      }
      throw new Error(data.message || `Request failed: ${response.status}`);
    }
    return data;
  }, [token]);

  const onLogin = (auth) => {
    setToken(auth.token);
    setRole(auth.role);
    localStorage.setItem('token', auth.token);
    localStorage.setItem('role', auth.role);
  };

  const logout = () => {
    setToken('');
    setRole('');
    setView('dashboard');
    localStorage.removeItem('token');
    localStorage.removeItem('role');
  };

  if (!token) {
    return <AuthPage request={request} onLogin={onLogin} showToast={showToast} toast={toast} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 lg:grid lg:grid-cols-[260px_1fr]">
      <Sidebar role={role} view={view} setView={setView} logout={logout} />
      <main className="min-w-0 p-4 md:p-6">
        {view === 'dashboard' && <Dashboard request={request} role={role} setView={setView} showToast={showToast} />}
        {view === 'products' && <Products request={request} role={role} showToast={showToast} />}
        {view === 'suppliers' && <Suppliers request={request} role={role} showToast={showToast} />}
        {view === 'purchases' && <Purchases request={request} role={role} showToast={showToast} />}
        {view === 'billing' && <Billing request={request} setView={setView} showToast={showToast} />}
        {view === 'invoices' && <Invoices request={request} role={role} showToast={showToast} />}
        {view === 'analytics' && role === 'admin' && <Analytics request={request} showToast={showToast} />}
        {view === 'users' && role === 'admin' && <ManageUsers request={request} showToast={showToast} />}
        {view === 'low-stock' && <LowStock request={request} showToast={showToast} />}
        {view === 'audit' && role === 'admin' && <AuditLogs request={request} showToast={showToast} />}
      </main>
      <Toast toast={toast} />
    </div>
  );
}

function AuthPage({ request, onLogin, showToast, toast }) {
  const [loginError, setLoginError] = useState(null);
  const [registerMessage, setRegisterMessage] = useState(null);
  const [registerError, setRegisterError] = useState(null);
  const [allowRegister, setAllowRegister] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  useEffect(() => {
    let active = true;
    request('/auth/setup')
      .then((data) => { if (active) { setAllowRegister(data.allowRegister); setSetupChecked(true); } })
      .catch(() => { if (active) { setAllowRegister(false); setSetupChecked(true); } });
    return () => { active = false; };
  }, [request]);

  async function login(event) {
    event.preventDefault();
    setLoginError(null);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const auth = await request('/auth/login', { method: 'POST', body: JSON.stringify(body) });
      onLogin(auth);
      showToast('Signed in successfully');
    } catch (err) {
      setLoginError(err.message);
      showToast(err.message, 'error');
    }
  }

  async function register(event) {
    event.preventDefault();
    setRegisterMessage(null);
    setRegisterError(null);
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    try {
      await request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
      form.reset();
      setRegisterMessage('SUCCESS: User successfully created! You can now use the Sign in form above.');
    } catch (err) {
      setRegisterError(err.message);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4 md:p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight text-blue-700">Wholesale Inventory ERP</h1>
          <p className="mt-2 text-slate-500">Sign in to your account or register a new user</p>
        </div>
        
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
          <h2 className="text-xl font-black text-slate-950">Sign in</h2>
          {loginError && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {loginError}
            </div>
          )}
          <form className="mt-4 grid gap-3" onSubmit={login}>
            <Field label="Username" name="username" required autoComplete="username" />
            <Field label="Password" name="password" type="password" required autoComplete="current-password" />
            <button className="btn btn-primary mt-2" type="submit">Sign in</button>
          </form>

          <div className="my-8 flex items-center gap-4 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Or</span>
          </div>

          <h2 className="text-xl font-black text-slate-950">Create new user</h2>
          {registerMessage && (
            <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700 border border-emerald-200">
              {registerMessage}
            </div>
          )}
          {registerError && (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 border border-red-200">
              {registerError}
            </div>
          )}
          {setupChecked ? (allowRegister ? (
            <form className="mt-4 grid gap-3" onSubmit={register}>
              <Field label="Username" name="username" required />
              <Field label="Password" name="password" type="password" required />
              <label className="field">
                <span className="label">Role</span>
                <select className="input" name="role">
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
              <button className="btn mt-2 bg-slate-100 hover:bg-slate-200 text-slate-900" type="submit">Create user</button>
            </form>
          ) : (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              User creation is disabled. Please ask an admin to create your account.
            </div>
          )) : (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Checking setup status...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Sidebar({ role, view, setView, logout }) {
  const nav = [
    ['dashboard', 'Dashboard'],
    ['products', 'Products'],
    ['suppliers', 'Suppliers'],
    ['purchases', 'Purchases'],
    ['billing', 'Billing'],
    ['invoices', 'Invoices'],
    ['low-stock', 'Low Stock'],
  ];
  if (role === 'admin') {
    nav.push(['analytics', 'Analytics']);
    nav.push(['users', 'Users']);
    nav.push(['audit', 'Audit Logs']);
  }

  return (
    <aside className="sticky top-0 z-20 flex flex-col gap-5 bg-slate-950 p-4 text-white lg:min-h-screen">
      <div className="border-b border-white/10 px-2 pb-4">
        <div className="text-xl font-black">Wholesale ERP</div>
        <div className="mt-1 text-sm capitalize text-slate-400">{role} workspace</div>
      </div>
      <nav className="grid gap-1 sm:grid-cols-3 lg:grid-cols-1">
        {nav.map(([id, label]) => (
          <button
            key={id}
            className={`rounded-md px-3 py-2 text-left text-sm font-semibold transition ${view === id ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto grid gap-2 text-xs text-slate-400">
        <span className="break-all">API: {API_BASE}</span>
        <button className="btn border-slate-700 bg-slate-900 text-white hover:bg-slate-800" onClick={logout}>Logout</button>
      </div>
    </aside>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-black text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Dashboard({ request, role, setView, showToast }) {
  const [stats, setStats] = useState(null);
  const [lowStock, setLowStock] = useState([]);

  const load = useCallback(async () => {
    try {
      const [statsData, lowStockData] = await Promise.all([
        request('/dashboard/stats'),
        request('/products/low-stock'),
      ]);
      setStats(statsData);
      setLowStock(lowStockData);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [request, showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live operating totals from the backend." action={<button className="btn btn-primary" onClick={load}>Refresh</button>} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total Products" value={stats?.totalProducts ?? '-'} />
        <Stat label="Total Revenue" value={role === 'admin' && stats ? currency(stats.totalRevenue) : 'Admin only'} />
        <Stat label="Total Invoices" value={role === 'admin' ? (stats?.totalInvoices ?? '-') : 'Admin only'} />
        <Stat label="Low Stock Count" value={stats?.lowStockCount ?? '-'} />
      </section>
      <section className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
        <div className="panel">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-black">Low Stock Watch</h2>
            <button className="btn" onClick={() => setView('low-stock')}>Open</button>
          </div>
          <LowStockTable rows={lowStock.slice(0, 6)} />
        </div>
        <div className="panel">
          <h2 className="mb-3 font-black">Quick Actions</h2>
          <div className="grid gap-2">
            <button className="btn btn-primary" onClick={() => setView('billing')}>Create barcode bill</button>
            <button className="btn" onClick={() => setView('products')}>Manage products</button>
            <button className="btn" onClick={() => setView('invoices')}>View invoices</button>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-sm font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Products({ request, role, showToast }) {
  const [filters, setFilters] = useState(emptyProductFilters);
  const [data, setData] = useState({ products: [], total: 0, totalPages: 1, currentPage: 1 });
  const [editing, setEditing] = useState(null);
  const [formVersion, setFormVersion] = useState(0);
  const canManage = role === 'admin' || role === 'staff';

  const load = useCallback(async () => {
    try {
      const result = await request(`/products?${params({ ...filters, limit: 10 })}`);
      setData(result);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [filters, request, showToast]);

  useEffect(() => { load(); }, [load]);

  async function saveProduct(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = form.get('id');
    form.delete('id');
    try {
      await request(id ? `/products/${id}` : '/products', { method: id ? 'PUT' : 'POST', body: form });
      setEditing(null);
      setFormVersion((version) => version + 1);
      await load();
      showToast(id ? 'Product updated' : 'Product added');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm('Delete this product?')) return;
    try {
      await request(`/products/${id}`, { method: 'DELETE' });
      await load();
      showToast('Product deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Inventory catalog, barcodes, pricing, and stock position."
        action={canManage ? <button className="btn btn-primary" onClick={() => { setEditing({}); setFormVersion((version) => version + 1); }}>New product</button> : null}
      />
      <section className={`grid gap-4 ${canManage ? 'xl:grid-cols-[1.35fr_.65fr]' : ''}`}>
        <div className="panel">
          <div className="mb-4 grid gap-2 md:grid-cols-5">
            <input className="input" placeholder="Search name or barcode" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} />
            <input className="input" placeholder="Category" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })} />
            <input className="input" placeholder="Exact barcode" value={filters.barcode} onChange={(e) => setFilters({ ...filters, barcode: e.target.value, page: 1 })} />
            <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
              <option value="">All status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <button className="btn btn-primary" onClick={load}>Search</button>
          </div>
          <ProductsTable rows={data.products || []} role={role} onEdit={(product) => { setEditing(product); setFormVersion((version) => version + 1); }} onDelete={deleteProduct} />
          <Pager page={data.currentPage || filters.page} totalPages={data.totalPages || 1} total={data.total} onPage={(page) => setFilters({ ...filters, page })} />
        </div>
        {canManage && (
          <div className="panel">
            <h2 className="mb-4 text-lg font-black">{editing?._id ? 'Edit product' : 'Product form'}</h2>
            <ProductForm
              key={`product-form-${editing?._id || 'new'}-${formVersion}`}
              product={editing}
              onSubmit={saveProduct}
              onClear={() => { setEditing(null); setFormVersion((version) => version + 1); }}
            />
            <div className="my-5 border-t border-slate-200" />
          </div>
        )}
      </section>
    </>
  );
}

function ProductsTable({ rows, role, onEdit, onDelete }) {
  if (!rows.length) return <Empty text="No products found." />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Name</th><th>Barcode</th><th>Category</th><th>Pack Size</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {rows.map((product) => (
            <tr key={product._id}>
              <td><strong>{product.name}</strong><div className="text-xs text-slate-500">{product.description}</div></td>
              <td>{product.barcode || '-'}</td>
              <td>{product.category}</td>
              <td>{productPackLabel(product) || '-'}</td>
              <td className="font-bold">{currency(product.price)}</td>
              <td><StockBadge product={product} /></td>
              <td><span className={`badge ${product.status ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{product.status ? 'Active' : 'Inactive'}</span></td>
              <td>
                {role === 'admin' || role === 'staff' ? (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn" onClick={() => onEdit(product)}>Edit</button>
                    {role === 'admin' && <button className="btn btn-danger" onClick={() => onDelete(product._id)}>Delete</button>}
                  </div>
                ) : <span className="text-slate-500">View only</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductForm({ product, onSubmit, onClear }) {
  const value = product || {};
  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <input type="hidden" name="id" value={value._id || ''} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name" name="name" defaultValue={value.name || ''} required />
        <Field label="Category" name="category" defaultValue={value.category || ''} required />
        <Field label="Pack size" name="packSize" type="number" step="0.01" min="0.01" defaultValue={value.packSize || 1} required />
        <label className="field">
          <span className="label">Unit</span>
          <select className="input" name="unit" defaultValue={value.unit || 'pcs'} required>
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="ml">ml</option>
            <option value="L">L</option>
            <option value="pcs">pcs</option>
            <option value="bag">bag</option>
            <option value="box">box</option>
            <option value="packet">packet</option>
          </select>
        </label>
        <Field label="Price" name="price" type="number" step="0.01" defaultValue={value.price || ''} required />
        <Field label="Stock" name="stockQuantity" type="number" defaultValue={value.stockQuantity || ''} required />
        <Field label="Low stock threshold" name="lowStockThreshold" type="number" defaultValue={value.lowStockThreshold || 10} />
        <Field label="Barcode" name="barcode" defaultValue={value.barcode || ''} />
      </div>
      <label className="field">
        <span className="label">Description</span>
        <textarea className="input min-h-20" name="description" defaultValue={value.description || ''} />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="field">
          <span className="label">Status</span>
          <select className="input" name="status" defaultValue={value.status === false ? 'false' : 'true'}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <Field label="Image" name="image" type="file" accept="image/*" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit">{value._id ? 'Update product' : 'Add product'}</button>
        <button className="btn" type="button" onClick={onClear}>Clear</button>
      </div>
    </form>
  );
}

function Billing({ request, setView, showToast }) {
  const [items, setItems] = useState([{ code: '', quantity: 1 }]);
  const [lookup, setLookup] = useState(null);
  const [invoiceMessage, setInvoiceMessage] = useState(null);

  function updateItem(index, patch) {
    setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function createInvoice(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setInvoiceMessage(null);
    const form = Object.fromEntries(new FormData(formElement));
    const invoiceItems = items
      .map((item) => {
        const code = item.code.trim();
        return {
          ...(isObjectId(code) ? { product: code } : { barcode: code }),
          quantity: Number(item.quantity || 1),
        };
      })
      .filter((item) => item.product || item.barcode);

    try {
      const invoice = await request('/invoices', {
        method: 'POST',
        body: JSON.stringify({ customerName: form.customerName, customerEmail: form.customerEmail, items: invoiceItems }),
      });
      formElement.reset();
      setItems([{ code: '', quantity: 1 }]);
      const message = invoice?.invoiceNumber
        ? `Invoice ${invoice.invoiceNumber} created successfully and stock deducted.`
        : 'Invoice created successfully and stock deducted.';
      setInvoiceMessage({ type: 'success', text: message });
      showToast(message);
      window.setTimeout(() => setView('invoices'), 1200);
    } catch (err) {
      setInvoiceMessage({ type: 'error', text: err.message });
      showToast(err.message, 'error');
    }
  }

  async function barcodeLookup(event) {
    event.preventDefault();
    const barcode = new FormData(event.currentTarget).get('barcode');
    try {
      setLookup(await request(`/products/barcode/${encodeURIComponent(barcode)}`));
    } catch (err) {
      setLookup({ error: err.message });
    }
  }

  return (
    <>
      <PageHeader title="Barcode Billing" subtitle="Counter sales, GST totals, and automatic stock deduction." />
      <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <div className="panel">
          <h2 className="mb-4 text-lg font-black">Invoice details</h2>
          {invoiceMessage && (
            <div className={`mb-4 rounded-md border p-3 text-sm font-medium ${invoiceMessage.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {invoiceMessage.text}
            </div>
          )}
          <form className="grid gap-4" onSubmit={createInvoice}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Customer name" name="customerName" required />
              <Field label="Customer email" name="customerEmail" type="email" />
            </div>
            <div className="flex items-center justify-between">
              <h3 className="font-black">Items</h3>
              <button className="btn" type="button" onClick={() => setItems([...items, { code: '', quantity: 1 }])}>Add item</button>
            </div>
            <div className="grid gap-2">
              {items.map((item, index) => (
                <div className="grid gap-2 md:grid-cols-[1fr_110px_auto]" key={index}>
                  <Field label="Barcode or Product ID" value={item.code} onChange={(e) => updateItem(index, { code: e.target.value })} placeholder="Scan barcode or paste product id" />
                  <Field label="Qty" type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} />
                  <button className="btn btn-danger self-end" type="button" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" type="submit">Create invoice</button>
          </form>
        </div>
        <div className="panel">
          <h2 className="mb-4 text-lg font-black">Fast barcode search</h2>
          <form className="grid gap-3" onSubmit={barcodeLookup}>
            <Field label="Barcode" name="barcode" required />
            <button className="btn" type="submit">Find product</button>
          </form>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {!lookup && 'Product lookup result'}
            {lookup?.error && <span className="text-red-700">{lookup.error}</span>}
            {lookup && !lookup.error && (
              <div>
                <strong className="text-slate-950">{lookup.name}</strong>
                <div>{currency(lookup.price)}{productPackLabel(lookup) ? ` - ${productPackLabel(lookup)}` : ''} - Stock {lookup.stockQuantity} - {lookup.category}</div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Invoices({ request, role, showToast }) {
  const [filters, setFilters] = useState(emptyInvoiceFilters);
  const [data, setData] = useState({ invoices: [], totalPages: 1, currentPage: 1 });

  const load = useCallback(async () => {
    try {
      setData(await request(`/invoices?${params({ ...filters, limit: 10 })}`));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [filters, request, showToast]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id, status) {
    try {
      await request(`/invoices/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      await load();
      showToast('Invoice status updated');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function downloadPdf(id) {
    try {
      const blob = await request(`/invoices/${id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function deleteInvoice(id) {
    if (!window.confirm('Delete this invoice?')) return;
    try {
      await request(`/invoices/${id}`, { method: 'DELETE' });
      await load();
      showToast('Invoice deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader title="Invoices" subtitle="Billing history, payment status, and PDF records." />
      <section className="panel">
        <div className="mb-4 grid gap-2 md:grid-cols-[180px_1fr_auto]">
          <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
            <option value="">All status</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <input className="input" placeholder="Customer search" value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value, page: 1 })} />
          <button className="btn btn-primary" onClick={load}>Filter</button>
        </div>
        <InvoicesTable rows={data.invoices || []} role={role} onStatus={updateStatus} onPdf={downloadPdf} onDelete={deleteInvoice} />
        <Pager page={data.currentPage || filters.page} totalPages={data.totalPages || 1} onPage={(page) => setFilters({ ...filters, page })} />
      </section>
    </>
  );
}

function InvoicesTable({ rows, role, onStatus, onPdf, onDelete }) {
  if (!rows.length) return <Empty text="No invoices found." />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map((invoice) => (
            <tr key={invoice._id}>
              <td><strong>{invoice.invoiceNumber}</strong><div className="text-xs text-slate-500">{new Date(invoice.createdAt).toLocaleString()}</div></td>
              <td>{invoice.customerName}<div className="text-xs text-slate-500">{invoice.customerEmail}</div></td>
              <td>{invoice.items?.length || 0}</td>
              <td className="font-bold">{currency(invoice.grandTotal)}</td>
              <td><span className={`badge ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{invoice.status}</span></td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-success" onClick={() => onStatus(invoice._id, invoice.status === 'paid' ? 'unpaid' : 'paid')}>{invoice.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}</button>
                  <button className="btn" onClick={() => onPdf(invoice._id)}>PDF</button>
                  {role === 'admin' && <button className="btn btn-danger" onClick={() => onDelete(invoice._id)}>Delete</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Analytics({ request, showToast }) {
  const [monthly, setMonthly] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  const load = useCallback(async () => {
    try {
      const [monthlyData, topData] = await Promise.all([
        request('/analytics/monthly-sales'),
        request('/analytics/top-products'),
      ]);
      setMonthly(monthlyData);
      setTopProducts(topData);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [request, showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Analytics" subtitle="Sales trends and top-selling products." action={<button className="btn btn-primary" onClick={load}>Refresh</button>} />
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartPanel title="Monthly sales" rows={monthly} labelKey="month" valueKey="revenue" currencyValue />
        <ChartPanel title="Top products" rows={topProducts} labelKey="product" valueKey="totalSold" />
      </section>
    </>
  );
}

function ChartPanel({ title, rows, labelKey, valueKey, currencyValue = false }) {
  const max = useMemo(() => Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1), [rows, valueKey]);

  return (
    <div className="panel">
      <h2 className="mb-4 text-lg font-black">{title}</h2>
      {!rows.length ? <Empty text="No analytics data yet." /> : (
        <div className="grid gap-3">
          {rows.map((row, index) => {
            const value = Number(row[valueKey] || 0);
            return (
              <div className="grid grid-cols-[110px_1fr_90px] items-center gap-3 text-sm" key={`${row[labelKey]}-${index}`}>
                <span className="truncate">{row[labelKey] || '-'}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max((value / max) * 100, 4)}%` }} />
                </div>
                <strong className="text-right">{currencyValue ? currency(value) : value}</strong>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LowStock({ request, showToast }) {
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    try {
      setRows(await request('/products/low-stock'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [request, showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Low Stock" subtitle="Items requiring replenishment." action={<button className="btn btn-primary" onClick={load}>Refresh</button>} />
      <section className="panel">
        <LowStockTable rows={rows} />
      </section>
    </>
  );
}

function LowStockTable({ rows }) {
  if (!rows.length) return <Empty text="No low-stock products found." />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Product</th><th>Barcode</th><th>Category</th><th>Pack Size</th><th>Stock</th><th>Threshold</th></tr></thead>
        <tbody>
          {rows.map((product) => (
            <tr key={product._id}>
              <td><strong>{product.name}</strong></td>
              <td>{product.barcode || '-'}</td>
              <td>{product.category}</td>
              <td>{productPackLabel(product) || '-'}</td>
              <td><span className="badge bg-amber-100 text-amber-700">{product.stockQuantity}</span></td>
              <td>{product.lowStockThreshold}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogs({ request, showToast }) {
  const [filters, setFilters] = useState(emptyAuditFilters);
  const [data, setData] = useState({ auditLogs: [], totalPages: 1, currentPage: 1 });

  const load = useCallback(async () => {
    try {
      setData(await request(`/audit-logs?${params({ ...filters, limit: 10 })}`));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [filters, request, showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Operational history with actor, action, and timestamp." />
      <section className="panel">
        <div className="mb-4 grid gap-2 md:grid-cols-[180px_1fr_1fr_auto]">
          <select className="input" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}>
            <option value="">All actions</option>
            {['CREATE', 'UPDATE', 'DELETE', 'IMPORT'].map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
          <input className="input" placeholder="Entity" value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value, page: 1 })} />
          <input className="input" placeholder="Search details" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} />
          <button className="btn btn-primary" onClick={load}>Filter</button>
        </div>
        <AuditTable rows={data.auditLogs || []} />
        <Pager page={data.currentPage || filters.page} totalPages={data.totalPages || 1} total={data.total} onPage={(page) => setFilters({ ...filters, page })} />
      </section>
    </>
  );
}

function AuditTable({ rows }) {
  if (!rows.length) return <Empty text="No audit logs found." />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
        <tbody>
          {rows.map((log) => (
            <tr key={log._id}>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.user?.username || log.actorRole || '-'}</td>
              <td><span className="badge bg-blue-100 text-blue-700">{log.action}</span></td>
              <td>{log.entity}</td>
              <td>{log.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ page, totalPages, total, onPage }) {
  return (
    <div className="mt-4 flex flex-col gap-2 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
      <span>Page {page} of {totalPages || 1}{total !== undefined ? ` - ${total} records` : ''}</span>
      <div className="flex gap-2">
        <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function Field({ label, name, className = '', ...props }) {
  return (
    <label className={`field ${className}`}>
      <span className="label">{label}</span>
      <input className="input" name={name} {...props} />
    </label>
  );
}

function StockBadge({ product }) {
  const isLow = Number(product.stockQuantity) <= Number(product.lowStockThreshold || 10);
  return <span className={`badge ${isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{product.stockQuantity}</span>;
}

function Empty({ text }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{text}</div>;
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-5 right-5 z-50 max-w-md rounded-lg border bg-white px-4 py-3 text-sm shadow-soft ${toast.type === 'error' ? 'border-red-200 text-red-700' : 'border-emerald-200 text-emerald-700'}`}>
      {toast.message}
    </div>
  );
}

function Suppliers({ request, role, showToast }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [formVersion, setFormVersion] = useState(0);
  const canManage = role === 'admin';

  const load = useCallback(async () => {
    try { setRows(await request('/suppliers')); } catch (err) { showToast(err.message, 'error'); }
  }, [request, showToast]);
  useEffect(() => { load(); }, [load]);

  async function saveSupplier(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = form.get('id');
    form.delete('id');
    try {
      await request(id ? `/suppliers/${id}` : '/suppliers', { method: id ? 'PUT' : 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      setEditing(null);
      setFormVersion((version) => version + 1);
      await load();
      showToast(id ? 'Supplier updated' : 'Supplier added');
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteSupplier(id) {
    if (!window.confirm('Delete supplier?')) return;
    try { await request(`/suppliers/${id}`, { method: 'DELETE' }); await load(); showToast('Supplier deleted'); } catch (err) { showToast(err.message, 'error'); }
  }

  return (
    <>
      <PageHeader title="Suppliers" subtitle="Manage your business vendors." action={canManage ? <button className="btn btn-primary" onClick={() => { setEditing({}); setFormVersion((version) => version + 1); }}>New Supplier</button> : null} />
      <section className={`grid gap-4 ${canManage ? 'xl:grid-cols-[1.35fr_.65fr]' : ''}`}>
        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Contact</th><th>GST</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s._id}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.phone}<div className="text-xs text-slate-500">{s.email || '-'}</div></td>
                    <td>{s.gstNumber || '-'}</td>
                    <td><span className={`badge ${s.status ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{s.status ? 'Active' : 'Inactive'}</span></td>
                    <td>{canManage ? <div className="flex gap-2"><button className="btn" onClick={() => { setEditing(s); setFormVersion((version) => version + 1); }}>Edit</button>{role === 'admin' && <button className="btn btn-danger" onClick={() => deleteSupplier(s._id)}>Delete</button>}</div> : 'View only'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty text="No suppliers found." />}
          </div>
        </div>
        {canManage && (
          <div className="panel">
            <h2 className="mb-4 text-lg font-black">{editing?._id ? 'Edit Supplier' : 'New Supplier'}</h2>
            <form className="grid gap-3" key={`supplier-form-${editing?._id || 'new'}-${formVersion}`} onSubmit={saveSupplier}>
              <input type="hidden" name="id" value={editing?._id || ''} />
              <Field label="Name" name="name" defaultValue={editing?.name || ''} required />
              <Field label="Phone" name="phone" defaultValue={editing?.phone || ''} pattern="\d{10}" maxLength="10" title="Phone number must contain exactly 10 digits" required />
              <Field label="Email" name="email" type="email" defaultValue={editing?.email || ''} />
              <Field label="GST Number" name="gstNumber" defaultValue={editing?.gstNumber || ''} />
              <label className="field"><span className="label">Address</span><textarea className="input min-h-20" name="address" minLength="7" defaultValue={editing?.address || ''} required /></label>
              <div className="flex gap-2"><button className="btn btn-primary" type="submit">Save</button><button className="btn" type="button" onClick={() => { setEditing(null); setFormVersion((version) => version + 1); }}>Clear</button></div>
            </form>
          </div>
        )}
      </section>
    </>
  );
}

function Purchases({ request, role, showToast }) {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseMessage, setPurchaseMessage] = useState(null);
  const [formVersion, setFormVersion] = useState(0);
  const canManage = role === 'admin';

  const load = useCallback(async () => {
    try {
      const [purData, supData, prodData] = await Promise.all([request('/purchases'), request('/suppliers'), request('/products?limit=100')]);
      setPurchases(Array.isArray(purData) ? purData.filter(Boolean) : []);
      setSuppliers(Array.isArray(supData) ? supData.filter(Boolean) : []);
      setProducts(Array.isArray(prodData.products) ? prodData.products.filter(Boolean) : []);
    } catch (err) { showToast(err.message, 'error'); }
  }, [request, showToast]);
  useEffect(() => { load(); }, [load]);

  async function savePurchase(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPurchaseMessage(null);
    try {
      const result = await request('/purchases', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      formElement.reset();
      setFormVersion((version) => version + 1);
      await load();
      const updatedProduct = result.updatedProduct;
      setPurchaseMessage(updatedProduct
        ? `Purchase recorded successfully. ${updatedProduct.name} stock is now ${updatedProduct.stockQuantity}.`
        : 'Purchase recorded successfully. Stock has been updated.');
      showToast('Purchase recorded successfully');
    } catch (err) {
      setPurchaseMessage(null);
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Purchase History"
        subtitle="Track incoming stock from suppliers."
        action={canManage ? <button className="btn btn-primary" onClick={() => setFormVersion((version) => version + 1)}>New Purchase</button> : null}
      />
      <section className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Product</th><th>Supplier</th><th>Qty</th><th>Stock Now</th><th>Unit Cost</th><th>Total</th></tr></thead>
              <tbody>
                {purchases.filter(Boolean).map(p => (
                  <tr key={p._id}>
                    <td>{p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString() : '-'}</td>
                    <td><strong>{p.product?.name || 'Deleted product'}</strong>{p.product && productPackLabel(p.product) ? <div className="text-xs text-slate-500">{productPackLabel(p.product)}</div> : null}</td>
                    <td>{p.supplier?.name || 'Deleted supplier'}</td>
                    <td><span className="badge bg-blue-100 text-blue-700">+{p.quantity}</span></td>
                    <td>{p.product ? <StockBadge product={p.product} /> : '-'}</td>
                    <td>{currency(p.unitCost)}</td>
                    <td className="font-bold">{currency(p.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!purchases.length && <Empty text="No purchases yet." />}
          </div>
        </div>
        {canManage && (
          <div className="panel">
            <h2 className="mb-4 text-lg font-black">Record Purchase</h2>
            {purchaseMessage && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                {purchaseMessage}
              </div>
            )}
            <form className="grid gap-3" key={`purchase-form-${formVersion}`} onSubmit={savePurchase}>
              <label className="field"><span className="label">Supplier</span>
                <select className="input" name="supplier" required>
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field"><span className="label">Product</span>
                <select className="input" name="product" required>
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name}{productPackLabel(p) ? ` - ${productPackLabel(p)}` : ''} (Stock: {p.stockQuantity})</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity" name="quantity" type="number" min="1" required />
                <Field label="Unit Cost" name="unitCost" type="number" step="0.01" min="0" required />
              </div>
              <button className="btn btn-primary mt-2" type="submit">Record Purchase</button>
            </form>
          </div>
        )}
      </section>
    </>
  );
}

function ManageUsers({ request, showToast }) {
  const [rows, setRows] = useState([]);
  const [formVersion, setFormVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      setRows(await request('/auth/users'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [request, showToast]);

  useEffect(() => { load(); }, [load]);

  async function createUser(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = Object.fromEntries(new FormData(formElement));
    try {
      await request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
      formElement.reset();
      setFormVersion(version => version + 1);
      await load();
      showToast('User created successfully');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await request(`/auth/users/${id}`, { method: 'DELETE' });
      await load();
      showToast('User deleted successfully');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader title="User Management" subtitle="Create and manage application users and roles." />
      <section className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user._id}>
                    <td><strong>{user.username}</strong></td>
                    <td>
                      <span className={`badge ${user.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-danger" onClick={() => deleteUser(user._id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty text="No users found." />}
          </div>
        </div>
        <div className="panel">
          <h2 className="mb-4 text-lg font-black">Create User</h2>
          <form className="grid gap-3" key={`user-form-${formVersion}`} onSubmit={createUser}>
            <Field label="Username" name="username" required />
            <Field label="Password" name="password" type="password" required />
            <label className="field">
              <span className="label">Role</span>
              <select className="input" name="role" required>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button className="btn btn-primary mt-2" type="submit">Create User</button>
          </form>
        </div>
      </section>
    </>
  );
}
