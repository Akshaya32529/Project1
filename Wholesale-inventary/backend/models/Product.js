const mongoose = require('mongoose');

function normalizeBarcode(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const barcode = String(value).trim();
  return barcode || undefined;
}

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  packSize: {
    type: Number,
    required: true,
    min: [0.01, 'Pack size must be greater than 0'],
    default: 1,
  },
  unit: {
    type: String,
    required: true,
    enum: ['g', 'kg', 'ml', 'L', 'pcs', 'bag', 'box', 'packet'],
    default: 'pcs',
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  stockQuantity: {
    type: Number,
    required: true,
    min: 0,
  },
  lowStockThreshold: {
    type: Number,
    default: 10,
    min: 0,
  },
  isLowStock: {
    type: Boolean,
    default: false,
  },
  barcode: {
    type: String,
    sparse: true, // Allow null
    trim: true,
    set: normalizeBarcode,
  },
  image: {
    type: String, // Path to image file
  },
  status: {
    type: Boolean,
    default: true, // true for active, false for inactive
  },
}, {
  timestamps: true,
});

productSchema.index({ barcode: 1 }, { unique: true, sparse: true });
productSchema.index({ name: 1 });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ createdAt: -1 });

// Update isLowStock before saving
productSchema.pre('save', function(next) {
  this.isLowStock = this.stockQuantity <= this.lowStockThreshold;
  next();
});

productSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update && (update.stockQuantity !== undefined || update.lowStockThreshold !== undefined)) {
    const stockQuantity = update.stockQuantity ?? this.getQuery().stockQuantity;
    const lowStockThreshold = update.lowStockThreshold ?? 10;
    if (stockQuantity !== undefined) {
      update.isLowStock = Number(stockQuantity) <= Number(lowStockThreshold);
    }
  }
  next();
});

productSchema.statics.normalizeBarcode = normalizeBarcode;

module.exports = mongoose.model('Product', productSchema);
