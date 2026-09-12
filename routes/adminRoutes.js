const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");

const adminController = require("../controllers/adminController");
const dataPlanController = require("../controllers/dataPlanController");

const safeHandler = (handler, name) => {
  if (typeof handler === "function") return handler;

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `${name} is not implemented in adminController`,
    });
  };
};

// KARIYA: Sai mai admin ko superadmin zai iya shiga
router.use(protect);
router.use(authorize("admin", "superadmin"));

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
// 3. USER MANAGEMENT & TARGETS
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
// 4. WALLET MANAGEMENT & DIRECT REFUNDS
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
// 5. ACTIVITY LOGS & SUPPORT TICKETS
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

router.post(
  "/request-admin-fix",
  safeHandler(adminController.requestAdminFix, "requestAdminFix")
);

router.patch(
  "/handle-report",
  safeHandler(adminController.handleSupportRequest, "handleSupportRequest")
);

// ========================================================
// 6. NIMC REQUESTS
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
// 7. BVN REQUESTS
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
// 8. DATA PLANS CONFIGURATION
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