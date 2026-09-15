const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");

const adminController = require("../controllers/adminController");
let dataPlanController;
try {
  dataPlanController = require("../controllers/dataPlanController");
} catch (e) {
  dataPlanController = null;
}

const safeHandler = (handler, name) => {
  if (typeof handler === "function") return handler;

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `${name} is not implemented in adminController`,
    });
  };
};

// ========================================================
// KARIYA: Sai mai admin ko superadmin zai iya shiga
// ========================================================
router.use(protect);
router.use(authorize("admin", "superadmin"));

// ========================================================
// 0. SYSTEM HEALTH & AUDIT INSPECTION
// ========================================================
router.get(
  "/system/health-check",
  safeHandler(adminController.getSystemHealth, "getSystemHealth")
);
router.get(
  "/health",
  safeHandler(adminController.getSystemHealth, "getSystemHealth")
);

// ========================================================
// 1. DASHBOARD ANALYTICS & TRANSACTIONS
// ========================================================
router.get(
  "/dashboard-stats",
  safeHandler(adminController.getDashboardStats, "getDashboardStats")
);

router.get(
  "/sales-stats",
  safeHandler(adminController.getSalesStats, "getSalesStats")
);

router.get(
  "/transactions",
  safeHandler(adminController.getAllTransactions, "getAllTransactions")
);

router.get(
  "/track-transaction/:transactionId",
  safeHandler(adminController.trackTransaction, "trackTransaction")
);

// ========================================================
// 2. BROADCAST NOTIFICATIONS
// ========================================================
router.post(
  "/notifications/broadcast",
  safeHandler(adminController.broadcastNotification, "broadcastNotification")
);

router.post(
  "/broadcast",
  safeHandler(adminController.broadcastNotification, "broadcastNotification")
);

// ========================================================
// 3. SUPERVISORS & AGENTS DIRECT MANAGEMENT
// ========================================================
// Kirkirar Sabon Supervisor
router.post(
  "/create-supervisor",
  safeHandler(adminController.createSupervisor, "createSupervisor")
);
router.post(
  "/users/create",
  safeHandler(adminController.createSupervisor, "createSupervisor")
);

// Dakatar / Kunna Supervisor (Status Toggle)
router.patch(
  "/users/:id/status",
  safeHandler(adminController.toggleSupervisorStatus, "toggleSupervisorStatus")
);
router.put(
  "/users/:id",
  safeHandler(adminController.toggleSupervisorStatus, "toggleSupervisorStatus")
);

// Transfer Agent zuwa wani Supervisor
router.put(
  "/transfer-agent",
  safeHandler(adminController.transferAgent, "transferAgent")
);
router.post(
  "/assign-supervisor",
  safeHandler(adminController.transferAgent, "transferAgent")
);

// Sauya Farashin Riba da Duba Farashi (Pricing Controls)
router.get(
  "/pricing",
  safeHandler(adminController.getAllPricing, "getAllPricing")
);
router.put(
  "/pricing",
  safeHandler(adminController.updatePricing, "updatePricing")
);
router.post(
  "/pricing",
  safeHandler(adminController.updatePricing, "updatePricing")
);
router.post(
  "/pricing/update",
  safeHandler(adminController.updatePricing, "updatePricing")
);

// ========================================================
// 4. USER DIRECTORY & TARGETS
// ========================================================
router.get("/users", safeHandler(adminController.getAllUsers, "getAllUsers"));

router.get(
  "/supervisors",
  safeHandler(adminController.getSupervisors, "getSupervisors")
);

router.get("/agents", safeHandler(adminController.getAgents, "getAgents"));

router.post(
  "/targets",
  safeHandler(adminController.assignTarget, "assignTarget")
);

router.post(
  "/assign-target",
  safeHandler(adminController.assignTarget, "assignTarget")
);

router.put(
  "/assign-target",
  safeHandler(adminController.assignTarget, "assignTarget")
);

router.patch(
  "/suspend-user/:id",
  safeHandler(adminController.suspendUser, "suspendUser")
);

router.patch(
  "/update-role",
  safeHandler(adminController.updateUserRole, "updateUserRole")
);

// ========================================================
// 5. WALLET MANAGEMENT & DIRECT REFUNDS
// ========================================================
router.patch(
  "/toggle-wallet-status",
  safeHandler(adminController.toggleWalletStatus, "toggleWalletStatus")
);

router.post(
  "/debit-user",
  safeHandler(adminController.debitUser, "debitUser")
);

router.post(
  "/wallet/refund",
  safeHandler(adminController.processDirectRefund, "processDirectRefund")
);

router.post(
  "/refund",
  safeHandler(adminController.processDirectRefund, "processDirectRefund")
);

router.get(
  "/pending-refunds",
  safeHandler(adminController.getPendingRefunds, "getPendingRefunds")
);

router.post(
  "/approve-refund/:id",
  safeHandler(adminController.approveRefund, "approveRefund")
);

router.patch(
  "/refunds/:id/approve",
  safeHandler(adminController.approveRefund, "approveRefund")
);

// ========================================================
// 6. ACTIVITY LOGS & CUSTOMER SERVICE TICKETS
// ========================================================
router.get(
  "/activities",
  safeHandler(adminController.getSupportActivities, "getSupportActivities")
);

router.get(
  "/reports",
  safeHandler(adminController.getSupportRequests, "getSupportRequests")
);

router.get(
  "/all-reports",
  safeHandler(adminController.getSupportRequests, "getSupportRequests")
);

router.patch(
  "/reports/:id/resolve",
  safeHandler(adminController.resolveSupportTicket, "resolveSupportTicket")
);

router.put(
  "/reports/:id",
  safeHandler(adminController.resolveSupportTicket, "resolveSupportTicket")
);

router.post(
  "/request-admin-fix",
  safeHandler(adminController.requestAdminFix, "requestAdminFix")
);

router.patch(
  "/handle-report",
  safeHandler(adminController.handleSupportRequest, "handleSupportRequest")
);

// ========================================================
// 7. NIMC REQUESTS
// ========================================================
router.get(
  "/nimc-requests",
  safeHandler(adminController.getAllNIMCRequests, "getAllNIMCRequests")
);

router.patch(
  "/nimc-processing/:id",
  safeHandler(adminController.updateToProcessing, "updateToProcessing")
);

router.patch(
  "/approve-nimc/:id",
  safeHandler(adminController.approveRequest, "approveRequest")
);

// ========================================================
// 8. BVN REQUESTS
// ========================================================
router.get(
  "/bvn-requests",
  safeHandler(adminController.getAllBVNRequests, "getAllBVNRequests")
);

router.patch(
  "/bvn-processing/:id",
  safeHandler(adminController.updateBVNStatus, "updateBVNStatus")
);

router.patch(
  "/approve-bvn/:id",
  safeHandler(adminController.approveBVNRequest, "approveBVNRequest")
);

// ========================================================
// 9. DATA PLANS CONFIGURATION
// ========================================================
router.get(
  "/data-plans",
  safeHandler(dataPlanController?.getPlans, "getPlans")
);

router.post(
  "/set-plan",
  safeHandler(dataPlanController?.setPlanPrice, "setPlanPrice")
);

module.exports = router;