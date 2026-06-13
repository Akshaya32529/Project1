const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  actorRole: {
    type: String,
    enum: ['admin', 'staff'],
  },
  action: {
    type: String,
    required: true, // e.g., 'CREATE', 'UPDATE', 'DELETE'
    enum: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT'],
  },
  entity: {
    type: String,
    required: true, // e.g., 'Product', 'Invoice'
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  details: {
    type: String, // Description of the action
  },
  oldValues: {
    type: mongoose.Schema.Types.Mixed, // For updates, store old values
  },
  newValues: {
    type: mongoose.Schema.Types.Mixed, // For updates, store new values
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
}, {
  timestamps: true,
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, entity: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
