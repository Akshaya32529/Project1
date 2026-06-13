const express = require('express');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/analytics/total-sales - Total quantity sold
router.get('/total-sales', auth(), async (req, res) => {
  try {
    const result = await Invoice.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$items.quantity' }
        }
      }
    ]);
    const totalSales = result.length > 0 ? result[0].totalSales : 0;
    res.json({ totalSales });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/monthly-sales - Monthly sales data
router.get('/monthly-sales', auth(), async (req, res) => {
  try {
    const result = await Invoice.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalSales: { $sum: { $sum: '$items.quantity' } },
          totalRevenue: { $sum: '$grandTotal' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);
    const monthlySales = result.map(item => ({
      month: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
      sales: item.totalSales,
      revenue: item.totalRevenue
    }));
    res.json(monthlySales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/top-products - Top-selling products
router.get('/top-products', auth(), async (req, res) => {
  try {
    const result = await Invoice.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSold: { $sum: '$items.quantity' }
        }
      },
      {
        $sort: { totalSold: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $project: {
          product: '$product.name',
          totalSold: 1
        }
      }
    ]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/total-revenue - Total revenue
router.get('/total-revenue', auth(), async (req, res) => {
  try {
    const result = await Invoice.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$grandTotal' }
        }
      }
    ]);
    const totalRevenue = result.length > 0 ? result[0].totalRevenue : 0;
    res.json({ totalRevenue });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/total-invoices - Total number of invoices
router.get('/total-invoices', auth(), async (req, res) => {
  try {
    const totalInvoices = await Invoice.countDocuments();
    res.json({ totalInvoices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;