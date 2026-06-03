const mongoose = require("mongoose");
const User = require("../models/User");
const Sale = require("../models/Sale");

const APP_NAME = "Bellaj Data Hub";

/**
 * 1. Get Agent Monthly Performance
 */
exports.getAgentPerformance = async (req, res) => {
  try {
    const agentId = req.user?._id;

    if (!agentId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized agent request",
      });
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlySales = await Sale.aggregate([
      {
        $match: {
          agentId: new mongoose.Types.ObjectId(agentId),
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalGB: { $sum: "$dataAmountGB" },
          totalSalesValue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    const performance =
      monthlySales.length > 0
        ? monthlySales[0]
        : {
            totalGB: 0,
            totalSalesValue: 0,
            totalTransactions: 0,
          };

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agent performance loaded successfully`,
      data: performance,
    });
  } catch (error) {
    console.error("Bellaj Agent Performance Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 2. Get Agent Sales History
 */
exports.getAgentSalesHistory = async (req, res) => {
  try {
    const agentId = req.user?._id;

    if (!agentId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized agent request",
      });
    }

    const sales = await Sale.find({ agentId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agent sales history loaded successfully`,
      count: sales.length,
      data: sales,
    });
  } catch (error) {
    console.error("Bellaj Agent Sales History Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 3. Get My Supervisor Info
 */
exports.getMySupervisor = async (req, res) => {
  try {
    const agentId = req.user?._id;

    if (!agentId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized agent request",
      });
    }

    const agent = await User.findById(agentId)
      .populate("assignedSupervisor", "name firstName surname phone email")
      .populate("supervisorId", "name firstName surname phone email");

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent account not found",
      });
    }

    const supervisor = agent.assignedSupervisor || agent.supervisorId || null;

    return res.status(200).json({
      success: true,
      message: supervisor
        ? `${APP_NAME} supervisor loaded successfully`
        : "No supervisor assigned yet",
      data: supervisor,
    });
  } catch (error) {
    console.error("Bellaj Supervisor Fetch Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 4. Create Agent Placeholder
 */
exports.createAgent = async (req, res) => {
  return res.status(201).json({
    success: true,
    message: `${APP_NAME} agent creation endpoint is ready`,
  });
};

/**
 * 5. Get All Agents
 */
exports.getAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: "agent" })
      .select("name firstName surname email phone status createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agents loaded successfully`,
      count: agents.length,
      data: agents,
    });
  } catch (error) {
    console.error("Bellaj Get Agents Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
