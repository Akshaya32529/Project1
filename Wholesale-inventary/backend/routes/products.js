const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const logAudit = require('../middleware/audit');

const router = express.Router();

function duplicateBarcodeMessage(err) {
  if (err && err.code === 11000 && err.keyPattern && err.keyPattern.barcode) {
    return 'Barcode already exists. Each product must have a unique barcode.';
  }
  return null;
}

function actorLabel(req) {
  return req.user.role === 'admin' ? 'Admin' : 'Staff';
}

function changedFields(oldProduct, newProduct) {
  const fields = ['name', 'description', 'category', 'packSize', 'unit', 'price', 'stockQuantity', 'lowStockThreshold', 'barcode', 'status'];
  return fields.filter((field) => String(oldProduct[field] ?? '') !== String(newProduct[field] ?? ''));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function paginationParams(page, limit) {
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  return { currentPage, perPage, skip: (currentPage - 1) * perPage };
}

// Multer setup for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// GET /api/products - List products with search and filter
router.get('/', auth(), async (req, res) => {
  try {
    const { search, category, status, barcode, page = 1, limit = 10 } = req.query;
    const { currentPage, perPage, skip } = paginationParams(page, limit);
    let query = {};

    const searchTerm = typeof search === 'string' ? search.trim() : '';
    if (searchTerm) {
      const safeSearch = escapeRegex(searchTerm);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { barcode: { $regex: safeSearch, $options: 'i' } }
      ];
    }
    const categoryFilter = typeof category === 'string' ? category.trim() : '';
    if (categoryFilter) {
      query.category = categoryFilter;
    }
    if (status !== undefined) {
      query.status = status === 'true';
    }
    if (barcode) {
      const normalizedBarcode = Product.normalizeBarcode(barcode);
      if (normalizedBarcode) {
        query.barcode = normalizedBarcode;
      }
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .limit(perPage)
        .skip(skip)
        .sort({ createdAt: -1 })
        .lean(),
      Product.countDocuments(query),
    ]);

    res.json({
      products,
      total,
      totalPages: Math.ceil(total / perPage),
      currentPage,
      limit: perPage,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products - Add product
router.post('/', auth(), upload.single('image'), async (req, res) => {
  try {
    const { name, description, category, packSize, unit, price, stockQuantity, lowStockThreshold, barcode, status } = req.body;
    const image = req.file ? req.file.path : null;
    const normalizedBarcode = Product.normalizeBarcode(barcode);

    if (normalizedBarcode) {
      const existingBarcode = await Product.findOne({ barcode: normalizedBarcode }).select('_id').lean();
      if (existingBarcode) {
        return res.status(409).json({ message: 'Barcode already exists. Each product must have a unique barcode.' });
      }
    }

    const product = new Product({
      name,
      description,
      category,
      packSize: packSize === undefined || packSize === '' ? 1 : parseFloat(packSize),
      unit: unit || 'pcs',
      price: parseFloat(price),
      stockQuantity: parseInt(stockQuantity),
      lowStockThreshold: lowStockThreshold === undefined ? 10 : parseInt(lowStockThreshold),
      barcode: normalizedBarcode,
      image,
      status: status === undefined ? true : status === 'true',
    });

    await product.save();
    await logAudit(req.user.id, 'CREATE', 'Product', product._id, `${actorLabel(req)} created product ${product.name}`, null, product.toObject(), req);
    res.status(201).json(product);
  } catch (err) {
    const duplicateMessage = duplicateBarcodeMessage(err);
    if (duplicateMessage) {
      return res.status(409).json({ message: duplicateMessage });
    }
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', auth(), upload.single('image'), async (req, res) => {
  try {
    const oldProduct = await Product.findById(req.params.id);
    if (!oldProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { name, description, category, packSize, unit, price, stockQuantity, lowStockThreshold, barcode, status } = req.body;
    const normalizedBarcode = Product.normalizeBarcode(barcode);

    if (normalizedBarcode) {
      const existingBarcode = await Product.findOne({
        barcode: normalizedBarcode,
        _id: { $ne: req.params.id },
      }).select('_id').lean();
      if (existingBarcode) {
        return res.status(409).json({ message: 'Barcode already exists. Each product must have a unique barcode.' });
      }
    }

    const updateData = {
      name,
      description,
      category,
      packSize: packSize === undefined || packSize === '' ? oldProduct.packSize : parseFloat(packSize),
      unit: unit || oldProduct.unit,
      price: parseFloat(price),
      stockQuantity: parseInt(stockQuantity),
      lowStockThreshold: lowStockThreshold === undefined ? oldProduct.lowStockThreshold : parseInt(lowStockThreshold),
      barcode: normalizedBarcode,
      status: status === undefined ? oldProduct.status : status === 'true',
    };

    if (req.file) {
      updateData.image = req.file.path;
      // Optionally delete old image
    }

    updateData.isLowStock = updateData.stockQuantity <= updateData.lowStockThreshold;
    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    const fields = changedFields(oldProduct, product);
    const fieldSummary = fields.length ? ` (${fields.join(', ')})` : '';
    await logAudit(req.user.id, 'UPDATE', 'Product', product._id, `${actorLabel(req)} updated product ${product.name}${fieldSummary}`, oldProduct.toObject(), product.toObject(), req);
    res.json(product);
  } catch (err) {
    const duplicateMessage = duplicateBarcodeMessage(err);
    if (duplicateMessage) {
      return res.status(409).json({ message: duplicateMessage });
    }
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/products/:id - Delete product
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    // Optionally delete image file
    if (product.image) {
      fs.unlink(product.image, (err) => {
        if (err) console.log(err);
      });
    }
    await logAudit(req.user.id, 'DELETE', 'Product', product._id, `${actorLabel(req)} deleted product ${product.name}`, product.toObject(), null, req);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/barcode/:barcode - Get product by barcode
router.get('/barcode/:barcode', auth(), async (req, res) => {
  try {
    const barcode = Product.normalizeBarcode(req.params.barcode);
    if (!barcode) {
      return res.status(400).json({ message: 'Barcode is required' });
    }
    const product = await Product.findOne({ barcode }).lean();
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/low-stock - Get products with low stock
router.get('/low-stock', auth(), async (req, res) => {
  try {
    const lowStockProducts = await Product.find({
      status: true,
      $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
    }).lean();
    res.json(lowStockProducts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products/batch - Batch import from CSV
router.post('/batch', auth(), upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file required' });
    }

    const products = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        products.push({
          name: row.name,
          description: row.description,
          category: row.category,
          packSize: row.packSize ? parseFloat(row.packSize) : 1,
          unit: row.unit || 'pcs',
          price: parseFloat(row.price),
          stockQuantity: parseInt(row.stockQuantity),
          lowStockThreshold: row.lowStockThreshold ? parseInt(row.lowStockThreshold) : 10,
          barcode: Product.normalizeBarcode(row.barcode),
          status: row.status === 'true',
        });
      })
      .on('end', async () => {
        try {
          if (products.length === 0) {
            return res.status(400).json({ message: 'CSV file has no products' });
          }

          const seenBarcodes = new Set();
          for (const product of products) {
            if (!product.barcode) continue;
            if (seenBarcodes.has(product.barcode)) {
              return res.status(409).json({ message: `Duplicate barcode in CSV: ${product.barcode}` });
            }
            seenBarcodes.add(product.barcode);
          }

          const existing = await Product.find({ barcode: { $in: [...seenBarcodes] } }).select('barcode').lean();
          if (existing.length) {
            return res.status(409).json({ message: `Barcode already exists: ${existing[0].barcode}` });
          }

          const inserted = await Product.insertMany(products, { ordered: true });
          await logAudit(req.user.id, 'IMPORT', 'Product', inserted[0]._id, `${actorLabel(req)} imported ${inserted.length} products from CSV`, null, { importedCount: inserted.length }, req);
          // Delete temp CSV file
          fs.unlink(req.file.path, (err) => {
            if (err) console.log(err);
          });
          res.json({ message: `${inserted.length} products imported` });
        } catch (err) {
          res.status(400).json({ message: err.message });
        }
      });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
