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

// TSARO: Dole sai mai riƙe da madafun iko na superadmin
router.use(protect);
router.use(authorize("superadmin"));

// ==========================================
// 1. STATS, USERS & TRANSACTIONS
// ==========================================
router.get(
  "/stats",
  safeHandler(superAdminController.getSystemStats, "getSystemStats")
);

router.get(
  "/users",
  safeHandler(superAdminController.getAllUsers, "getAllUsers")
);

router.get(
  "/transactions",
  safeHandler(
    superAdminController.getAllGlobalTransactions,
    "getAllGlobalTransactions"
  )
);

router.get(
  "/transactions/all",
  safeHandler(
    superAdminController.getAllGlobalTransactions,
    "getAllGlobalTransactions"
  )
);

router.get(
  "/audit-logs",
  safeHandler(superAdminController.getAuditLogs, "getAuditLogs")
);

router.get(
  "/health",
  safeHandler(superAdminController.getSystemHealth, "getSystemHealth")
);

// ==========================================
// 2. BROADCAST NOTIFICATIONS & WALLET REFUNDS
// ==========================================
router.post(
  "/broadcast",
  safeHandler(
    superAdminController.sendBroadcastNotification,
    "sendBroadcastNotification"
  )
);

router.post(
  "/refund",
  safeHandler(superAdminController.processUserRefund, "processUserRefund")
);

// ==========================================
// 3. PRICING CONFIGURATION (DATA, NIMC, BVN)
// ==========================================
router.get(
  "/pricing",
  safeHandler(superAdminController.getPricingMatrix, "getPricingMatrix")
);

router.put(
  "/pricing",
  safeHandler(superAdminController.updatePricingMatrix, "updatePricingMatrix")
);

router.post(
  "/pricing/update",
  safeHandler(superAdminController.updatePricingMatrix, "updatePricingMatrix")
);

// ==========================================
// 4. OPERATIONAL TARGETS & SUPERVISOR ENROLLMENT
// ==========================================
router.post(
  "/targets",
  safeHandler(superAdminController.assignTarget, "assignTarget")
);

router.post(
  "/create-supervisor",
  safeHandler(superAdminController.createSupervisor, "createSupervisor")
);

router.post(
  "/supervisors/create",
  safeHandler(superAdminController.createSupervisor, "createSupervisor")
);

// ==========================================
// 5. ROLE MANAGEMENT
// ==========================================
router.post(
  "/make-admin",
  safeHandler(superAdminController.makeAdmin, "makeAdmin")
);

router.patch(
  "/make-admin",
  safeHandler(superAdminController.makeAdmin, "makeAdmin")
);

router.put(
  "/manage-role",
  safeHandler(superAdminController.manageUserRole, "manageUserRole")
);

router.patch(
  "/manage-role",
  safeHandler(superAdminController.manageUserRole, "manageUserRole")
);

module.exports = router;