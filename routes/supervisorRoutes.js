const express = require("express");
const router = express.Router();

const supervisorController = require("../controllers/supervisorController");

const { protect, authorize } = require("../middleware/authMiddleware");

const safeHandler = (handler, name) => {
  if (typeof handler === "function") return handler;

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `${name} is not implemented in supervisorController`,
    });
  };
};

// SUPERVISOR ROUTES
router.use(protect);
router.use(authorize("supervisor", "admin"));

// Get all agents under supervisor
router.get(
  "/my-agents",
  safeHandler(supervisorController.getMyAgents, "getMyAgents"),
);

// Agent performance
router.get(
  "/agent-performance/:agentId",
  safeHandler(
    supervisorController.getAgentSalesSummary,
    "getAgentSalesSummary",
  ),
);

// Assign monthly target
router.put(
  "/assign-target/:agentId",
  safeHandler(supervisorController.assignTargetToAgent, "assignTargetToAgent"),
);

module.exports = router;
