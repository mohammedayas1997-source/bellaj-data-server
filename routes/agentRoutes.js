const express = require("express");
const router = express.Router();

const {
  getAgentPerformance,
  getAgentSalesHistory,
  getMySupervisor,
  createAgent,
  getAgents,
} = require("../controllers/agentController");

const { protect, authorize } = require("../middleware/authMiddleware");

// Kariya daga server crash
const safeHandler = (handler, name) => {
  if (typeof handler === "function") return handler;

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `${name} is not implemented in agentController`,
    });
  };
};

// Dole ne mutum ya yi login
router.use(protect);

// ==========================================
// 1. AGENT PERSONAL TERMINAL DATA
// Izini ga agent da manyan jami'ai masu duba su
// ==========================================
router.get(
  "/performance",
  authorize("agent", "supervisor", "admin", "superadmin", "leader"),
  safeHandler(getAgentPerformance, "getAgentPerformance")
);

router.get(
  "/my-performance",
  authorize("agent", "supervisor", "admin", "superadmin", "leader"),
  safeHandler(getAgentPerformance, "getAgentPerformance")
);

router.get(
  "/stats",
  authorize("agent", "supervisor", "admin", "superadmin", "leader"),
  safeHandler(getAgentPerformance, "getAgentPerformance")
);

router.get(
  "/sales-history",
  authorize("agent", "supervisor", "admin", "superadmin", "leader"),
  safeHandler(getAgentSalesHistory, "getAgentSalesHistory")
);

router.get(
  "/my-supervisor",
  authorize("agent", "supervisor", "admin", "superadmin", "leader"),
  safeHandler(getMySupervisor, "getMySupervisor")
);

router.get(
  "/supervisor",
  authorize("agent", "supervisor", "admin", "superadmin", "leader"),
  safeHandler(getMySupervisor, "getMySupervisor")
);

// ==========================================
// 2. AGENT MANAGEMENT & PROVISIONING
// ==========================================
router.post(
  "/create",
  authorize("supervisor", "admin", "superadmin", "leader"),
  safeHandler(createAgent, "createAgent")
);

router.get(
  "/all",
  authorize("supervisor", "admin", "superadmin", "leader"),
  safeHandler(getAgents, "getAgents")
);

router.get(
  "/",
  authorize("supervisor", "admin", "superadmin", "leader"),
  safeHandler(getAgents, "getAgents")
);

module.exports = router;