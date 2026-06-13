const express = require('express');
const Supplier = require('../models/Supplier');
const auth = require('../middleware/auth');

const router = express.Router();

function normalizeSupplierBody(body) {
  return {
    ...body,
    name: String(body.name || '').trim(),
    phone: String(body.phone || '').trim(),
    email: String(body.email || '').trim(),
    gstNumber: String(body.gstNumber || '').trim() || undefined,
    address: String(body.address || '').trim(),
  };
}

function supplierErrorMessage(err) {
  if (err && err.code === 11000) {
    return 'Supplier already exists';
  }
  if (err?.name === 'ValidationError') {
    return Object.values(err.errors).map((error) => error.message).join(', ');
  }
  return err.message;
}

async function findDuplicateSupplier(data, currentId = null) {
  const duplicateQuery = {
    $or: [
      { phone: data.phone },
      { name: data.name, phone: data.phone },
    ],
  };

  if (data.gstNumber) {
    duplicateQuery.$or.push({ gstNumber: data.gstNumber });
  }

  if (currentId) {
    duplicateQuery._id = { $ne: currentId };
  }

  return Supplier.findOne(duplicateQuery).select('_id').lean();
}

// Get all suppliers
router.get('/', auth(), async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add new supplier
router.post('/', auth('admin'), async (req, res) => {
  try {
    const supplierData = normalizeSupplierBody(req.body);
    const existingSupplier = await findDuplicateSupplier(supplierData);
    if (existingSupplier) {
      return res.status(409).json({ message: 'Supplier already exists' });
    }

    const supplier = new Supplier(supplierData);
    await supplier.save();
    res.status(201).json(supplier);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 400).json({ message: supplierErrorMessage(err) });
  }
});

// Update supplier
router.put('/:id', auth('admin'), async (req, res) => {
  try {
    const supplierData = normalizeSupplierBody(req.body);
    const existingSupplier = await findDuplicateSupplier(supplierData, req.params.id);
    if (existingSupplier) {
      return res.status(409).json({ message: 'Supplier already exists' });
    }

    const supplier = await Supplier.findByIdAndUpdate(req.params.id, supplierData, { new: true, runValidators: true });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 400).json({ message: supplierErrorMessage(err) });
  }
});

// Delete supplier
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
