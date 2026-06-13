const express = require('express');
const PDFDocument = require('pdfkit');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const logAudit = require('../middleware/audit');

const router = express.Router();

function actorLabel(req) {
  return req.user.role === 'admin' ? 'Admin' : 'Staff';
}

function money(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function shortText(value, length = 28) {
  const text = String(value || '-');
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
}

// Helper function to generate invoice number
async function generateInvoiceNumber() {
  const currentYear = new Date().getFullYear();
  const lastInvoice = await Invoice.findOne({ invoiceNumber: new RegExp(`^INV-${currentYear}-`) })
    .sort({ invoiceNumber: -1 });

  let nextNumber = 1;
  if (lastInvoice) {
    const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `INV-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;
}

async function findProductForInvoiceItem(item) {
  if (item.product) {
    return Product.findById(item.product);
  }

  if (item.barcode) {
    const barcode = Product.normalizeBarcode(item.barcode);
    if (!barcode) {
      return null;
    }
    return Product.findOne({ barcode, status: true });
  }

  return null;
}

async function rollbackStockDeductions(deductions) {
  if (!deductions.length) {
    return;
  }

  await Product.bulkWrite(deductions.map(({ product, quantity }) => ({
    updateOne: {
      filter: { _id: product._id },
      update: { $inc: { stockQuantity: quantity } },
    },
  })));

  const products = await Product.find({
    _id: { $in: deductions.map(({ product }) => product._id) },
  });
  await Promise.all(products.map((product) => {
    product.isLowStock = Number(product.stockQuantity) <= Number(product.lowStockThreshold ?? 10);
    return product.save();
  }));
}

// GET /api/invoices - List invoices
router.get('/', auth(), async (req, res) => {
  try {
    const { status, customer, page = 1, limit = 10 } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    }
    if (customer) {
      query.customerName = { $regex: customer, $options: 'i' };
    }

    const invoices = await Invoice.find(query)
      .populate('items.product')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Invoice.countDocuments(query);

    res.json({
      invoices,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/invoices - Create invoice
router.post('/', auth(), async (req, res) => {
  try {
    const { customerName, customerEmail, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one invoice item is required' });
    }

    // Validate items and calculate totals
    let totalAmount = 0;
    const gstRate = 0.18; // 18% GST
    const invoiceItems = [];
    const stockDeductions = new Map();

    for (const item of items) {
      const product = await findProductForInvoiceItem(item);
      if (!product) {
        const identifier = item.barcode || item.product || 'unknown';
        return res.status(400).json({ message: `Product ${identifier} not found` });
      }

      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: `Invalid quantity for ${product.name}` });
      }
      if (product.stockQuantity < quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }

      const invoiceItem = {
        product: product._id,
        quantity,
        price: product.price, // Use current price
        barcode: product.barcode,
      };
      invoiceItems.push(invoiceItem);
      totalAmount += invoiceItem.price * invoiceItem.quantity;

      const productKey = product._id.toString();
      const existing = stockDeductions.get(productKey);
      if (existing) {
        existing.quantity += quantity;
      } else {
        stockDeductions.set(productKey, { product, quantity });
      }
    }

    for (const { product, quantity } of stockDeductions.values()) {
      if (product.stockQuantity < quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
    }

    const gstAmount = totalAmount * gstRate;
    const grandTotal = totalAmount + gstAmount;

    const invoiceNumber = await generateInvoiceNumber();

    const invoice = new Invoice({
      invoiceNumber,
      customerName,
      customerEmail,
      items: invoiceItems,
      totalAmount,
      gstAmount,
      grandTotal,
    });

    await invoice.validate();

    const deductions = Array.from(stockDeductions.values());
    const appliedDeductions = [];
    for (const { product, quantity } of deductions) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: product._id, stockQuantity: { $gte: quantity } },
        { $inc: { stockQuantity: -quantity } },
        { new: true, runValidators: true }
      );

      if (!updatedProduct) {
        await rollbackStockDeductions(appliedDeductions);
        return res.status(400).json({ message: 'Stock changed while creating invoice. Please try again.' });
      }

      updatedProduct.isLowStock = Number(updatedProduct.stockQuantity) <= Number(updatedProduct.lowStockThreshold ?? 10);
      await updatedProduct.save();
      appliedDeductions.push({ product, quantity });
    }

    try {
      await invoice.save();
    } catch (err) {
      await rollbackStockDeductions(appliedDeductions);
      throw err;
    }

    await invoice.populate('items.product');
    await logAudit(req.user.id, 'CREATE', 'Invoice', invoice._id, `${actorLabel(req)} created invoice ${invoice.invoiceNumber} for ${invoice.customerName}`, null, invoice.toObject(), req);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/invoices/:id/status - Update invoice status
router.put('/:id/status', auth(), async (req, res) => {
  try {
    const { status } = req.body;
    const oldInvoice = await Invoice.findById(req.params.id);
    if (!oldInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = await Invoice.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true })
      .populate('items.product');

    await logAudit(req.user.id, 'UPDATE', 'Invoice', invoice._id, `${actorLabel(req)} updated invoice ${invoice.invoiceNumber} status from ${oldInvoice.status} to ${status}`, oldInvoice.toObject(), invoice.toObject(), req);
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/invoices/:id - Delete invoice
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    await logAudit(req.user.id, 'DELETE', 'Invoice', invoice._id, `${actorLabel(req)} deleted invoice ${invoice.invoiceNumber}`, invoice.toObject(), null, req);
    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/invoices/:id/pdf - Generate PDF
router.get('/:id/pdf', auth(), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('items.product');
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const doc = new PDFDocument({
      size: [226, 720],
      margin: 14,
      bufferPages: true,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${invoice.invoiceNumber}.pdf`);
    doc.pipe(res);

    const line = () => {
      doc.moveDown(0.4);
      doc.text('-'.repeat(38), { align: 'center' });
      doc.moveDown(0.25);
    };
    const row = (label, value, options = {}) => {
      const x = doc.x;
      const y = doc.y;
      doc.text(label, x, y, { width: 108, continued: false });
      doc.text(value, x + 108, y, { width: 90, align: options.align || 'right' });
    };

    doc.font('Helvetica-Bold').fontSize(13).text('WHOLESALE INVENTORY ERP', { align: 'center' });
    doc.font('Helvetica').fontSize(8)
      .text('Retail Tax Invoice / Customer Copy', { align: 'center' })
      .text('Thank you for shopping with us', { align: 'center' });
    line();

    doc.fontSize(8);
    row('Bill No', invoice.invoiceNumber);
    row('Date', invoice.createdAt.toLocaleString('en-IN'));
    row('Status', String(invoice.status || 'unpaid').toUpperCase());
    row('Customer', shortText(invoice.customerName, 18));
    if (invoice.customerEmail) {
      row('Email', shortText(invoice.customerEmail, 18));
    }
    line();

    doc.font('Helvetica-Bold');
    doc.text('ITEM', 14, doc.y, { width: 84 });
    doc.text('QTY', 98, doc.y - 9, { width: 28, align: 'right' });
    doc.text('RATE', 128, doc.y - 9, { width: 42, align: 'right' });
    doc.text('AMT', 172, doc.y - 9, { width: 44, align: 'right' });
    doc.font('Helvetica');
    line();

    invoice.items.forEach((item, index) => {
      const productName = item.product?.name || 'Deleted product';
      const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
      const y = doc.y;
      doc.fontSize(8).text(`${index + 1}. ${shortText(productName, 24)}`, 14, y, { width: 84 });
      doc.text(String(item.quantity), 98, y, { width: 28, align: 'right' });
      doc.text(Number(item.price || 0).toFixed(2), 128, y, { width: 42, align: 'right' });
      doc.text(itemTotal.toFixed(2), 172, y, { width: 44, align: 'right' });
      if (item.barcode) {
        doc.fontSize(7).fillColor('#555555').text(`Barcode: ${item.barcode}`, 20, doc.y + 1);
        doc.fillColor('#000000');
      }
      doc.moveDown(0.35);
    });
    line();

    doc.fontSize(8);
    row('Sub Total', money(invoice.totalAmount));
    row('GST 18%', money(invoice.gstAmount));
    doc.font('Helvetica-Bold').fontSize(10);
    row('TOTAL', money(invoice.grandTotal));
    doc.font('Helvetica').fontSize(8);
    line();

    doc.text('Payment Mode: Cash / UPI / Card', { align: 'center' });
    doc.text('Goods once sold will not be taken back', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('*** CUSTOMER COPY ***', { align: 'center' });
    doc.font('Helvetica').fontSize(7).text('Generated by Wholesale Inventory ERP', { align: 'center' });

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
