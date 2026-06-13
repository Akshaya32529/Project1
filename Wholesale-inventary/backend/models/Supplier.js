const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{10}$/, 'Phone number must contain exactly 10 digits']
  },
  email: {
    type: String,
    trim: true
  },
  gstNumber: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true,
    minlength: [7, 'Address must be at least 7 characters']
  },
  status: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

supplierSchema.index({ phone: 1 }, { unique: true });
supplierSchema.index({ gstNumber: 1 }, { unique: true, sparse: true });
supplierSchema.index({ name: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('Supplier', supplierSchema);
