const express = require("express");
const router = express.Router();

const {
  getLeaderDashboard,
  getAllAgents,
  createNewSupervisor,
  toggleSupervisorStatus,
  assignSupervisorTarget,
  assignAgentToSupervisor,
  downloadSupervisorReport,
} = require("../controllers/leaderController");

const { protect, authorize } = require("../middleware/authMiddleware");

// Kariya: Idan controller bai riga ya ayyana function ba, kada sabar ta fadi
const safeHandler = (handler, name) => {
  if (typeof handler === "function") return handler;

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `${name} is not implemented in leaderController`,
    });
  };
};

// TSARO: Dole ne mutum ya yi login kuma ya kasance leader, admin, ko superadmin
router.use(protect);
router.use(authorize("leader", "admin", "superadmin"));

// ==========================================
// 1. DASHBOARD & ANALYTICS
// ==========================================
router.get(
  "/dashboard",
  safeHandler(getLeaderDashboard, "getLeaderDashboard")
);

router.get(
  "/leader-dashboard",
  safeHandler(getLeaderDashboard, "getLeaderDashboard")
);

// ==========================================
// 2. AGENT OPERATIONS & TRANSFER
// ==========================================
router.get(
  "/agents",
  safeHandler(getAllAgents, "getAllAgents")
);

router.post(
  "/assign-agent",
  safeHandler(assignAgentToSupervisor, "assignAgentToSupervisor")
);

router.patch(
  "/assign-agent",
  safeHandler(assignAgentToSupervisor, "assignAgentToSupervisor")
);

router.put(
  "/assign-agent",
  safeHandler(assignAgentToSupervisor, "assignAgentToSupervisor")
);

router.put(
  "/transfer-agent",
  safeHandler(assignAgentToSupervisor, "assignAgentToSupervisor")
);

// ==========================================
// 3. SUPERVISOR MANAGEMENT
// ==========================================
router.post(
  "/create-supervisor",
  safeHandler(createNewSupervisor, "createNewSupervisor")
);

// Fallback don karawa Admin saukin kira
router.post(
  "/supervisors/create",
  safeHandler(createNewSupervisor, "createNewSupervisor")
);

router.patch(
  "/toggle-supervisor/:supervisorId",
  safeHandler(toggleSupervisorStatus, "toggleSupervisorStatus")
);

router.patch(
  "/supervisor-status/:supervisorId",
  safeHandler(toggleSupervisorStatus, "toggleSupervisorStatus")
);

router.patch(
  "/supervisors/toggle-status/:supervisorId",
  safeHandler(toggleSupervisorStatus, "toggleSupervisorStatus")
);

// ==========================================
// 4. TARGETS & AUDIT REPORTS
// ==========================================
router.post(
  "/assign-target",
  safeHandler(assignSupervisorTarget, "assignSupervisorTarget")
);

router.put(
  "/assign-target",
  safeHandler(assignSupervisorTarget, "assignSupervisorTarget")
);

router.get(
  "/report/:supervisorId",
  safeHandler(downloadSupervisorReport, "downloadSupervisorReport")
);

router.get(
  "/supervisor-report/:supervisorId",
  safeHandler(downloadSupervisorReport, "downloadSupervisorReport")
);

router.get(
  "/reports/full",
  safeHandler(downloadSupervisorReport, "downloadSupervisorReport")
);

module.exports = router;