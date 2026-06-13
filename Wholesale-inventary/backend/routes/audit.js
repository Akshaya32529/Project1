const express = require('express');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/audit-logs - Admin audit trail with filters and pagination
router.get('/', auth('admin'), async (req, res) => {
  try {
    const {
      action,
      entity,
      user,
      search,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (action) {
      query.action = action.toUpperCase();
    }
    if (entity) {
      query.entity = entity;
    }
    if (user) {
      query.user = user;
    }
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    if (search) {
      query.details = { $regex: search, $options: 'i' };
    }

    const pageNumber = Math.max(parseInt(page, 10), 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10), 1), 100);

    const auditLogs = await AuditLog.find(query)
      .populate('user', 'username role')
      .limit(limitNumber)
      .skip((pageNumber - 1) * limitNumber)
      .sort({ createdAt: -1 });

    const total = await AuditLog.countDocuments(query);

    res.json({
      auditLogs,
      total,
      totalPages: Math.ceil(total / limitNumber),
      currentPage: pageNumber,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/audit-logs/:id - Detailed single audit record
router.get('/:id', auth('admin'), async (req, res) => {
  try {
    const auditLog = await AuditLog.findById(req.params.id).populate('user', 'username role');
    if (!auditLog) {
      return res.status(404).json({ message: 'Audit log not found' });
    }

    res.json(auditLog);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
