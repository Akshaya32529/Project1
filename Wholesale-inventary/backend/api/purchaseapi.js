const express = require('express');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all purchases
router.get('/', auth(), async (req, res) => {
  try {
    const purchases = await Purchase.find()
      .populate('supplier', 'name email phone')
      .populate('product', 'name category barcode packSize unit stockQuantity lowStockThreshold')
      .sort({ purchaseDate: -1 });
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add new purchase (Restock)
router.post('/', auth('admin'), async (req, res) => {
  try {
    const { supplier, product, quantity, unitCost } = req.body;
    const purchaseQuantity = Number(quantity);
    const purchaseUnitCost = Number(unitCost);

    if (!supplier || !product) {
      return res.status(400).json({ message: 'Supplier and product are required' });
    }
    if (!Number.isInteger(purchaseQuantity) || purchaseQuantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }
    if (!Number.isFinite(purchaseUnitCost) || purchaseUnitCost < 0) {
      return res.status(400).json({ message: 'Unit cost must be 0 or more' });
    }

    const [supplierExists, productExists] = await Promise.all([
      Supplier.findById(supplier).select('_id').lean(),
      Product.findById(product).select('_id').lean(),
    ]);

    if (!supplierExists) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    if (!productExists) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const totalCost = purchaseQuantity * purchaseUnitCost;
    
    const purchase = new Purchase({
      supplier,
      product,
      quantity: purchaseQuantity,
      unitCost: purchaseUnitCost,
      totalCost,
      status: 'Received'
    });

    await purchase.validate();

    const updatedProduct = await Product.findByIdAndUpdate(
      product,
      { $inc: { stockQuantity: purchaseQuantity } },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found while updating stock' });
    }

    const isLowStock = Number(updatedProduct.stockQuantity) <= Number(updatedProduct.lowStockThreshold ?? 10);
    if (updatedProduct.isLowStock !== isLowStock) {
      updatedProduct.isLowStock = isLowStock;
      await updatedProduct.save();
    }

    await purchase.save();
    await purchase.populate([
      { path: 'supplier', select: 'name email phone' },
      { path: 'product', select: 'name category barcode packSize unit stockQuantity lowStockThreshold' },
    ]);

    res.status(201).json({ purchase, updatedProduct });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
