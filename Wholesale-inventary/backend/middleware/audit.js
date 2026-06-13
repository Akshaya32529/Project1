const AuditLog = require('../models/AuditLog');

const logAudit = async (userId, action, entity, entityId, details, oldValues = null, newValues = null, req = null) => {
  try {
    const auditLog = new AuditLog({
      user: userId,
      actorRole: req?.user?.role,
      action,
      entity,
      entityId,
      details,
      oldValues,
      newValues,
      ipAddress: req?.ip,
      userAgent: req?.get ? req.get('user-agent') : undefined,
    });
    await auditLog.save();
  } catch (err) {
    console.error('Audit log error:', err);
  }
};

module.exports = logAudit;
