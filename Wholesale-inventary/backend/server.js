const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const mongoURI = process.env.MONGO_URI || process.env.DB_URL || 'mongodb://localhost:27017/wholesale';

function maskMongoURI(uri) {
  return uri.replace(/:[^:@]{1,}@/, ':****@');
}

// Middleware
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Database is not connected. Please check the backend MongoDB connection.' });
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// Routes
const authRoutes = require('./api/userapi');
const productRoutes = require('./api/productapi');
const invoiceRoutes = require('./api/invoiceapi');
const analyticsRoutes = require('./api/analyticsapi');
const dashboardRoutes = require('./api/dashboardapi');
const auditRoutes = require('./api/auditapi');
const supplierRoutes = require('./api/supplierapi');
const purchaseRoutes = require('./api/purchaseapi');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);

// Backward-compatible routes for frontends built with the API origin but no /api suffix.
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/invoices', invoiceRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/audit-logs', auditRoutes);
app.use('/suppliers', supplierRoutes);
app.use('/purchases', purchaseRoutes);

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));

// Protected routes example
app.get('/api/admin', require('./middleware/auth')('admin'), (req, res) => {
  res.json({ message: 'Admin access granted' });
});

app.get('/api/staff', require('./middleware/auth')('staff'), (req, res) => {
  res.json({ message: 'Staff access granted' });
});

async function startServer() {
  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
    });

    try {
      await mongoose.connection.db.collection('users').dropIndex('email_1');
      console.log('Dropped legacy unique email index from users collection.');
    } catch (err) {
      if (err.codeName !== 'IndexNotFound' && err.code !== 27) {
        console.warn('Legacy email index cleanup warning:', err.message);
      }
    }

    const invalidUsers = await mongoose.connection.db.collection('users').find({
      $or: [{ username: null }, { username: { $exists: false } }],
    }).project({ _id: 1 }).toArray();

    if (invalidUsers.length) {
      await mongoose.connection.db.collection('users').deleteMany({
        $or: [{ username: null }, { username: { $exists: false } }],
      });
      console.log(`Removed ${invalidUsers.length} malformed user records without a username.`);
    }

    await User.syncIndexes();
    console.log('MongoDB connected to:', maskMongoURI(mongoURI));
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.error('Check backend/.env MONGO_URI or DB_URL. Current target:', maskMongoURI(mongoURI));
    process.exit(1);
  }
}

startServer();
