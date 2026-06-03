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
      message: `${name} is not implemented`,
    });
  };
};

router.use(protect);
router.use(authorize("admin", "superadmin"));

// USER MANAGEMENT
router.get("/users", safeHandler(adminController.getAllUsers, "getAllUsers"));
router.get(
  "/supervisors",
  safeHandler(adminController.getSupervisors, "getSupervisors"),
);
router.get("/agents", safeHandler(adminController.getAgents, "getAgents"));
router.put(
  "/assign-target",
  safeHandler(adminController.assignTarget, "assignTarget"),
);
router.patch(
  "/suspend-user/:id",
  safeHandler(adminController.suspendUser, "suspendUser"),
);
router.patch(
  "/update-role",
  safeHandler(adminController.updateUserRole, "updateUserRole"),
);

// ADMIN POWERS
router.patch(
  "/toggle-wallet-status",
  safeHandler(adminController.toggleWalletStatus, "toggleWalletStatus"),
);
router.post("/debit-user", safeHandler(adminController.debitUser, "debitUser"));

// REFUND MANAGEMENT
router.get(
  "/pending-refunds",
  safeHandler(adminController.getPendingRefunds, "getPendingRefunds"),
);
router.post(
  "/approve-refund/:id",
  safeHandler(adminController.approveRefund, "approveRefund"),
);

// ACTIVITY LOGS & SUPPORT
router.get(
  "/activities",
  safeHandler(adminController.getSupportActivities, "getSupportActivities"),
);

router.get(
  "/track-transaction/:transactionId",
  safeHandler(adminController.trackTransaction, "trackTransaction"),
);

router.post(
  "/request-admin-fix",
  safeHandler(adminController.requestAdminFix, "requestAdminFix"),
);

router.get(
  "/all-reports",
  safeHandler(adminController.getSupportRequests, "getSupportRequests"),
);

router.patch(
  "/handle-report",
  safeHandler(adminController.handleSupportRequest, "handleSupportRequest"),
);

// NIMC MANAGEMENT
router.get(
  "/nimc-requests",
  safeHandler(adminController.getAllNIMCRequests, "getAllNIMCRequests"),
);
router.patch(
  "/nimc-processing/:id",
  safeHandler(adminController.updateToProcessing, "updateToProcessing"),
);
router.patch(
  "/approve-nimc/:id",
  safeHandler(adminController.approveRequest, "approveRequest"),
);

// BVN MANAGEMENT
router.get(
  "/bvn-requests",
  safeHandler(adminController.getAllBVNRequests, "getAllBVNRequests"),
);
router.patch(
  "/bvn-processing/:id",
  safeHandler(adminController.updateBVNStatus, "updateBVNStatus"),
);
router.patch(
  "/approve-bvn/:id",
  safeHandler(adminController.approveBVNRequest, "approveBVNRequest"),
);

// DATA PLANS
router.get("/data-plans", safeHandler(dataPlanController.getPlans, "getPlans"));

router.post(
  "/set-plan",
  safeHandler(dataPlanController.setPlanPrice, "setPlanPrice"),
);

module.exports = router;
