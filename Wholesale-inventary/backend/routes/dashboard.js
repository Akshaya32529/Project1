const express = require('express');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats - Dashboard statistics
router.get('/stats', auth(), async (req, res) => {
  try {
    const [totalProducts, revenueResult, totalInvoices, lowStockCount] = await Promise.all([
      Product.countDocuments({ status: true }),
      Invoice.aggregate([
        { $group: { _id: null, totalRevenue: { $sum: '$grandTotal' } } }
      ]),
      Invoice.countDocuments(),
      Product.countDocuments({
        status: true,
        $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
      }),
    ]);

    res.json({
      totalProducts,
      totalRevenue: revenueResult[0]?.totalRevenue || 0,
      totalInvoices,
      lowStockCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
