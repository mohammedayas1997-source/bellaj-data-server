const express = require("express");
const router = express.Router();

const superAdminController = require("../controllers/superAdminController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Dynamic Resolution Safe Handler
const safeHandler = (handler, name) => {
  if (typeof handler === "function") return handler;

  return (req, res) => {
    // Duba fallback idan an wuce sunan kai tsaye
    if (superAdminController && typeof superAdminController[name] === "function") {
      return superAdminController[name](req, res);
    }

    return res.status(501).json({
      success: false,
      message: `${name} is not implemented on superAdminController build`,
    });
  };
};

// TSARO: Dole sai mai riƙe da madafun iko na superadmin
router.use(protect);
router.use(authorize("superadmin"));

// ==========================================
// 1. STATS, SYSTEM HEALTH & AUDIT LOGS
// ==========================================
router.get(
  "/stats",
  safeHandler(superAdminController.getSystemStats, "getSystemStats")
);

router.get(
  "/system-stats",
  safeHandler(superAdminController.getSystemStats, "getSystemStats")
);

router.get(
  "/health",
  safeHandler(superAdminController.getSystemHealth, "getSystemHealth")
);

router.get(
  "/audit-logs",
  safeHandler(superAdminController.getAuditLogs, "getAuditLogs")
);

// ==========================================
// 2. USER CATEGORIZATION & DIRECTORY
// ==========================================
router.get(
  "/users",
  safeHandler(superAdminController.getAllUsers, "getAllUsers")
);

router.get(
  "/supervisors",
  safeHandler(superAdminController.getSupervisors, "getSupervisors")
);

router.get(
  "/agents",
  safeHandler(superAdminController.getAgents, "getAgents")
);

// Cikakken Rajista na sabon mai amfani (Customer, Agent, Supervisor, Support, Staff)
router.post(
  "/create-supervisor",
  safeHandler(superAdminController.createSupervisor, "createSupervisor")
);

router.post(
  "/supervisors/create",
  safeHandler(superAdminController.createSupervisor, "createSupervisor")
);

router.post(
  "/users/create",
  safeHandler(superAdminController.createSupervisor, "createSupervisor")
);

// ==========================================
// 3. SECURITY: SUSPEND & PERMANENT DELETION
// ==========================================
// Dakatarwa ko Kunnawa (Suspend / Unsuspend)
router.patch(
  "/users/:id/status",
  safeHandler(superAdminController.suspendUser, "suspendUser")
);

router.put(
  "/users/:id/status",
  safeHandler(superAdminController.suspendUser, "suspendUser")
);

router.patch(
  "/suspend-user/:id",
  safeHandler(superAdminController.suspendUser, "suspendUser")
);

// GOGE MAI AMFANI HAR ABADA DAGA DATABASE
router.delete(
  "/users/:id",
  safeHandler(superAdminController.deleteUserPermanently, "deleteUserPermanently")
);

router.delete(
  "/users/delete/:id",
  safeHandler(superAdminController.deleteUserPermanently, "deleteUserPermanently")
);

// ==========================================
// 4. TRANSACTIONS & DIRECT REFUNDS
// ==========================================
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

// Direct Wallet Refunds
router.post(
  "/refund",
  safeHandler(superAdminController.processUserRefund, "processUserRefund")
);

router.post(
  "/wallet/refund",
  safeHandler(superAdminController.processUserRefund, "processUserRefund")
);

// ==========================================
// 5. PRICING & TARIFF CONFIGURATION
// ==========================================
// NIMC, BVN, Cable TV, da VAS Pricing
router.get(
  "/pricing",
  safeHandler(superAdminController.getPricingMatrix, "getPricingMatrix")
);

router.put(
  "/pricing",
  safeHandler(superAdminController.updatePricingMatrix, "updatePricingMatrix")
);

router.post(
  "/pricing",
  safeHandler(superAdminController.updatePricingMatrix, "updatePricingMatrix")
);

router.post(
  "/pricing/update",
  safeHandler(superAdminController.updatePricingMatrix, "updatePricingMatrix")
);

// Buga Data Plan (Plan ID & Network ID Sync)
router.post(
  "/set-plan",
  safeHandler(superAdminController.setPlanPrice, "setPlanPrice")
);

// ==========================================
// 6. BROADCAST NOTIFICATIONS & TARGETS
// ==========================================
router.post(
  "/broadcast",
  safeHandler(
    superAdminController.sendBroadcastNotification,
    "sendBroadcastNotification"
  )
);

router.post(
  "/notifications/broadcast",
  safeHandler(
    superAdminController.sendBroadcastNotification,
    "sendBroadcastNotification"
  )
);

router.post(
  "/targets",
  safeHandler(superAdminController.assignTarget, "assignTarget")
);

// ==========================================
// 7. ROLE MANAGEMENT
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