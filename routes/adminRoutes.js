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

// Dynamic Resolution Safe Handler (Yana duba aikin a ainihin lokacin da request ya shigo)
const safeHandler = (methodName, controller = adminController) => {
  return (req, res, next) => {
    if (controller && typeof controller[methodName] === "function") {
      return controller[methodName](req, res, next);
    }
    return res.status(501).json({
      success: false,
      message: `Endpoint method '${methodName}' is not available on this server build.`,
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
router.get("/system/health-check", safeHandler("getSystemHealth"));
router.get("/health", safeHandler("getSystemHealth"));

// ========================================================
// 1. DASHBOARD ANALYTICS & TRANSACTIONS
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
// 3. SUPERVISORS & AGENTS DIRECT MANAGEMENT
// ========================================================
// Kirkirar Sabon Supervisor (Babu Double Hash)
router.post("/create-supervisor", safeHandler("createSupervisor"));
router.post("/users/create", safeHandler("createSupervisor"));

// Dakatar / Kunna Supervisor (Status Toggle)
router.patch("/supervisors/:id/status", safeHandler("toggleSupervisorStatus"));
router.put("/supervisors/:id/status", safeHandler("toggleSupervisorStatus"));

// Transfer Agent zuwa wani Supervisor
router.put("/transfer-agent", safeHandler("transferAgent"));
router.post("/assign-supervisor", safeHandler("transferAgent"));

// Sauya Farashin Riba da Duba Farashi (Pricing Controls)
router.get("/pricing", safeHandler("getAllPricing"));
router.put("/pricing", safeHandler("updatePricing"));
router.post("/pricing", safeHandler("updatePricing"));
router.post("/pricing/update", safeHandler("updatePricing"));

// ========================================================
// 4. USER DIRECTORY, SECURITY, SUSPEND & PERMANENT DELETE
// ========================================================
router.get("/users", safeHandler("getAllUsers"));
router.get("/supervisors", safeHandler("getSupervisors"));
router.get("/agents", safeHandler("getAgents"));

// Dakatar da kowane irin user (Supervisor, Agent, User)
router.patch("/users/:id/status", safeHandler("suspendUser"));
router.put("/users/:id/status", safeHandler("suspendUser"));
router.patch("/suspend-user/:id", safeHandler("suspendUser"));

// GOGE USER HAR ABADA (Permanent Deletion)
router.delete("/users/:id", safeHandler("deleteUserPermanently"));
router.delete("/users/delete/:id", safeHandler("deleteUserPermanently"));

router.patch("/update-role", safeHandler("updateUserRole"));

// Targets & Quotas
router.post("/targets", safeHandler("assignTarget"));
router.post("/assign-target", safeHandler("assignTarget"));
router.put("/assign-target", safeHandler("assignTarget"));

// ========================================================
// 5. WALLET MANAGEMENT & DIRECT REFUNDS
// ========================================================
router.patch("/toggle-wallet-status", safeHandler("toggleWalletStatus"));
router.post("/debit-user", safeHandler("debitUser"));
router.post("/wallet/refund", safeHandler("processDirectRefund"));
router.post("/refund", safeHandler("processDirectRefund"));
router.get("/pending-refunds", safeHandler("getPendingRefunds"));
router.post("/approve-refund/:id", safeHandler("approveRefund"));
router.patch("/refunds/:id/approve", safeHandler("approveRefund"));

// ========================================================
// 6. ACTIVITY LOGS & CUSTOMER SERVICE TICKETS
// ========================================================
router.get("/activities", safeHandler("getSupportActivities"));
router.get("/reports", safeHandler("getSupportRequests"));
router.get("/all-reports", safeHandler("getSupportRequests"));

router.patch("/reports/:id/resolve", safeHandler("resolveSupportTicket"));
router.put("/reports/:id", safeHandler("resolveSupportTicket"));
router.post("/request-admin-fix", safeHandler("requestAdminFix"));
router.patch("/handle-report", safeHandler("handleSupportRequest"));

// ========================================================
// 7. NIMC REQUESTS
// ========================================================
router.get("/nimc-requests", safeHandler("getAllNIMCRequests"));
router.patch("/nimc-processing/:id", safeHandler("updateToProcessing"));
router.patch("/approve-nimc/:id", safeHandler("approveRequest"));

// ========================================================
// 8. BVN REQUESTS
// ========================================================
router.get("/bvn-requests", safeHandler("getAllBVNRequests"));
router.patch("/bvn-processing/:id", safeHandler("updateBVNStatus"));
router.patch("/approve-bvn/:id", safeHandler("approveBVNRequest"));

// ========================================================
// 9. DATA PLANS CONFIGURATION
// ========================================================
router.get("/data-plans", safeHandler("getPlans", dataPlanController));
router.post("/set-plan", safeHandler("setPlanPrice", dataPlanController));

module.exports = router;