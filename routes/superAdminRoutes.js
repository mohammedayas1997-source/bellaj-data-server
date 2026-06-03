const express = require("express");
const router = express.Router();

const superAdminController = require("../controllers/superAdminController");
const { protect, authorize } = require("../middleware/authMiddleware");

const safeHandler = (handler, name) => {
  if (typeof handler === "function") return handler;

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `${name} is not implemented in superAdminController`,
    });
  };
};

router.use(protect);
router.use(authorize("superadmin"));

router.get(
  "/stats",
  safeHandler(superAdminController.getSystemStats, "getSystemStats"),
);

router.get(
  "/transactions/all",
  safeHandler(
    superAdminController.getAllGlobalTransactions,
    "getAllGlobalTransactions",
  ),
);

router.get(
  "/audit-logs",
  safeHandler(superAdminController.getAuditLogs, "getAuditLogs"),
);

router.post(
  "/make-admin",
  safeHandler(superAdminController.makeAdmin, "makeAdmin"),
);

router.put(
  "/manage-role",
  safeHandler(superAdminController.manageUserRole, "manageUserRole"),
);

module.exports = router;
