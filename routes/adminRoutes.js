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

// Dynamic Resolution Safe Handler (Yana bincikar controller din da ke dauke da aikin)
const safeHandler = (methodName, primaryController = adminController) => {
  return (req, res, next) => {
    // 1. Gwada primary controller (misali dataPlanController)
    if (primaryController && typeof primaryController[methodName] === "function") {
      return primaryController[methodName](req, res, next);
    }
    // 2. Idan ba a samu ba, duba adminController a matsayin fallback
    if (adminController && typeof adminController[methodName] === "function") {
      return adminController[methodName](req, res, next);
    }

    return res.status(501).json({
      success: false,
      message: `Endpoint method '${methodName}' is not implemented on server build.`,
    });
  };
};

// ========================================================
// KARIYA: Masu izinin Admin da SuperAdmin kadai
// ========================================================
router.use(protect);
router.use(authorize("admin", "superadmin", "leader"));

// ========================================================
// 0. SYSTEM HEALTH & AUDIT INSPECTOR
// ========================================================
router.get("/system/health-check", safeHandler("getSystemHealth"));
router.get("/health", safeHandler("getSystemHealth"));

// ========================================================
// 1. FINANCIAL DASHBOARD & TRANSACTIONS (INFLOW / OUTFLOW)
// ========================================================
router.get("/dashboard-stats", safeHandler("getDashboardStats"));
router.get("/sales-stats", safeHandler("getSalesStats"));
router.get("/transactions", safeHandler("getAllTransactions"));
router.get("/track-transaction/:transactionId", safeHandler("trackTransaction"));

// ========================================================
// 2. BROADCAST NOTIFICATIONS
// ========================================================
router.post("/notifications/broadcast", safeHandler("broadcastNotification"));
router.post("/broadcast", safeHandler("broadcastNotification"));

// ========================================================
// 3. USER MANAGEMENT, REGISTRATION & AUDITING
// ========================================================
// Cikakken Rajista na sabon User / Supervisor / Agent / Staff
router.post("/create-supervisor", safeHandler("createSupervisor"));
router.post("/users/create", safeHandler("createSupervisor"));
router.post("/register-user", safeHandler("createSupervisor"));

// Jerin rukunonin masu amfani (Customers, Agents, Supervisors)
router.get("/users", safeHandler("getAllUsers"));
router.get("/supervisors", safeHandler("getSupervisors"));
router.get("/agents", safeHandler("getAgents"));

// Dakatarwa da Kunna Mai Amfani (Suspend / Unsuspend)
router.patch("/users/:id/status", safeHandler("suspendUser"));
router.put("/users/:id/status", safeHandler("suspendUser"));
router.patch("/suspend-user/:id", safeHandler("suspendUser"));
router.patch("/supervisors/:id/status", safeHandler("toggleSupervisorStatus"));
router.put("/supervisors/:id/status", safeHandler("toggleSupervisorStatus"));

// GOGE MAI AMFANI HAR ABADA (Permanent Deletion)
router.delete("/users/:id", safeHandler("deleteUserPermanently"));
router.delete("/users/delete/:id", safeHandler("deleteUserPermanently"));

// Canza Role da canja Supervisor ga Agent
router.patch("/update-role", safeHandler("updateUserRole"));
router.put("/transfer-agent", safeHandler("transferAgent"));
router.post("/assign-supervisor", safeHandler("transferAgent"));

// Targets & Quotas
router.post("/targets", safeHandler("assignTarget"));
router.post("/assign-target", safeHandler("assignTarget"));
router.put("/assign-target", safeHandler("assignTarget"));

// ========================================================
// 4. SERVICE PRICING (NIMC, SLIPS, BVN, CABLE TV, VAS)
// ==========================================
router.get("/pricing", safeHandler("getAllPricing"));
router.put("/pricing", safeHandler("updatePricing"));
router.post("/pricing", safeHandler("updatePricing"));
router.post("/pricing/update", safeHandler("updatePricing"));

// ========================================================
// 5. DATA PLANS & TARIFF PUBLISHING (PLAN ID & NETWORK ID)
// ========================================================
router.get("/data-plans", safeHandler("getPlans", dataPlanController));
router.get("/plans", safeHandler("getPlans", dataPlanController));
router.post("/set-plan", safeHandler("setPlanPrice", dataPlanController));
router.post("/data-plans/set", safeHandler("setPlanPrice", dataPlanController));
router.patch("/disable-plan/:id", safeHandler("disablePlan", dataPlanController));
router.patch("/enable-plan/:id", safeHandler("enablePlan", dataPlanController));

// ========================================================
// 6. WALLET CONTROLS & DIRECT REFUNDS
// ========================================================
router.post("/wallet/refund", safeHandler("processDirectRefund"));
router.post("/refund", safeHandler("processDirectRefund"));
router.patch("/toggle-wallet-status", safeHandler("toggleWalletStatus"));
router.post("/debit-user", safeHandler("debitUser"));
router.get("/pending-refunds", safeHandler("getPendingRefunds"));
router.post("/approve-refund/:id", safeHandler("approveRefund"));
router.patch("/refunds/:id/approve", safeHandler("approveRefund"));

// ========================================================
// 7. CUSTOMER SERVICE, TICKETS & ACTIVITY LOGS
// ========================================================
router.get("/activities", safeHandler("getSupportActivities"));
router.get("/reports", safeHandler("getSupportRequests"));
router.get("/all-reports", safeHandler("getSupportRequests"));
router.patch("/reports/:id/resolve", safeHandler("resolveSupportTicket"));
router.put("/reports/:id", safeHandler("resolveSupportTicket"));
router.post("/request-admin-fix", safeHandler("requestAdminFix"));
router.patch("/handle-report", safeHandler("handleSupportRequest"));

// ========================================================
// 8. IDENTITY SERVICES: NIMC & BVN QUEUE
// ========================================================
router.get("/nimc-requests", safeHandler("getAllNIMCRequests"));
router.patch("/nimc-processing/:id", safeHandler("updateToProcessing"));
router.patch("/approve-nimc/:id", safeHandler("approveRequest"));

router.get("/bvn-requests", safeHandler("getAllBVNRequests"));
router.patch("/bvn-processing/:id", safeHandler("updateBVNStatus"));
router.patch("/approve-bvn/:id", safeHandler("approveBVNRequest"));

module.exports = router;