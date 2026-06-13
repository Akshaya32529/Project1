const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI || process.env.DB_URL || 'mongodb://localhost:27017/wholesale';
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected to:', mongoURI.replace(/:[^:@]{1,}@/, ':****@')))
.catch(err => console.log(err));

// Routes
app.use('/api/auth', require('./api/userapi'));
app.use('/api/products', require('./api/productapi'));
app.use('/api/invoices', require('./api/invoiceapi'));
app.use('/api/analytics', require('./api/analyticsapi'));
app.use('/api/dashboard', require('./api/dashboardapi'));
app.use('/api/audit-logs', require('./api/auditapi'));
app.use('/api/suppliers', require('./api/supplierapi'));
app.use('/api/purchases', require('./api/purchaseapi'));

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));

// Protected routes example
app.get('/api/admin', require('./middleware/auth')('admin'), (req, res) => {
  res.json({ message: 'Admin access granted' });
});

app.get('/api/staff', require('./middleware/auth')('staff'), (req, res) => {
  res.json({ message: 'Staff access granted' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
