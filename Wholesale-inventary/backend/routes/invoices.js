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

      // Deduct stock
      product.stockQuantity -= quantity;
      await product.save();
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

    await invoice.save();
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

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${invoice.invoiceNumber}.pdf`);
    doc.pipe(res);

    // PDF content
    doc.fontSize(20).text('Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice Number: ${invoice.invoiceNumber}`);
    doc.text(`Customer: ${invoice.customerName}`);
    if (invoice.customerEmail) {
      doc.text(`Email: ${invoice.customerEmail}`);
    }
    doc.text(`Date: ${invoice.createdAt.toDateString()}`);
    doc.text(`Status: ${invoice.status}`);
    doc.moveDown();

    // Items table
    doc.text('Items:', { underline: true });
    invoice.items.forEach((item, index) => {
      const barcode = item.barcode ? ` - Barcode: ${item.barcode}` : '';
      doc.text(`${index + 1}. ${item.product.name}${barcode} - Qty: ${item.quantity} - Price: $${item.price} - Total: $${(item.price * item.quantity).toFixed(2)}`);
    });
    doc.moveDown();

    doc.text(`Total Amount: $${invoice.totalAmount.toFixed(2)}`);
    doc.text(`GST (18%): $${invoice.gstAmount.toFixed(2)}`);
    doc.text(`Grand Total: $${invoice.grandTotal.toFixed(2)}`);

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
