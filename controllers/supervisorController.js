const User = require("../models/User");
const Sale = require("../models/Sale");
const mongoose = require("mongoose");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Get agents assigned to the logged-in supervisor
 * @route   GET /api/v1/supervisor/my-agents
 * @access  Supervisor
 */
exports.getMyAgents = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;

    if (!supervisorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized supervisor request",
      });
    }

    const agents = await User.find({
      assignedSupervisor: supervisorId,
      role: "agent",
    })
      .select("firstName surname name phone email targets status createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} supervisor agents loaded successfully`,
      count: agents.length,
      data: agents,
    });
  } catch (error) {
    console.error("Bellaj Get My Agents Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Get sales summary for a specific agent
 * @route   GET /api/v1/supervisor/agent-summary/:agentId
 * @access  Supervisor
 */
exports.getAgentSalesSummary = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;
    const { agentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid agent ID",
      });
    }

    const agent = await User.findOne({
      _id: agentId,
      role: "agent",
      assignedSupervisor: supervisorId,
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found or not assigned to this supervisor",
      });
    }

    const stats = await Sale.aggregate([
      {
        $match: {
          agentId: new mongoose.Types.ObjectId(agentId),
        },
      },
      {
        $group: {
          _id: null,
          totalGB: { $sum: "$dataAmountGB" },
          totalAmount: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    const performance =
      stats.length > 0
        ? stats[0]
        : {
            totalGB: 0,
            totalAmount: 0,
            totalTransactions: 0,
          };

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agent sales summary loaded successfully`,
      data: performance,
    });
  } catch (error) {
    console.error("Bellaj Agent Sales Summary Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Assign target to an agent
 * @route   PATCH /api/v1/supervisor/assign-target/:agentId
 * @access  Supervisor
 */
exports.assignTargetToAgent = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;
    const { agentId } = req.params;
    const { dataGoal, month } = req.body;

    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid agent ID",
      });
    }

    const numericDataGoal = Number(dataGoal);

    if (Number.isNaN(numericDataGoal) || numericDataGoal < 0) {
      return res.status(400).json({
        success: false,
        message: "Data goal must be a valid number",
      });
    }

    const agent = await User.findOneAndUpdate(
      {
        _id: agentId,
        role: "agent",
        assignedSupervisor: supervisorId,
      },
      {
        $set: {
          "targets.dataGoal": numericDataGoal,
          "targets.currentMonth":
            month ||
            new Date().toLocaleString("en-US", {
              month: "long",
            }),
        },
      },
      {
        new: true,
        runValidators: true,
      },
    ).select("firstName surname name phone email targets assignedSupervisor");

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found or not assigned to this supervisor",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bellaj agent target assigned successfully",
      targets: agent.targets,
      data: agent,
    });
  } catch (error) {
    console.error("Bellaj Assign Target To Agent Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Get leader dashboard network overview
 * @route   GET /api/v1/leader/dashboard
 * @access  Leader/Admin
 */
exports.getLeaderDashboard = async (req, res) => {
  try {
    const supervisors = await User.find({
      role: "supervisor",
    })
      .select("surname firstName name phone email targets")
      .lean();

    const networkSales = await Sale.aggregate([
      {
        $group: {
          _id: null,
          overallGB: { $sum: "$dataAmountGB" },
          overallAmount: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    const networkSummary =
      networkSales.length > 0
        ? networkSales[0]
        : {
            overallGB: 0,
            overallAmount: 0,
            totalTransactions: 0,
          };

    const totalAgentsCount = await User.countDocuments({
      role: "agent",
    });

    const allTeamSales = await Sale.aggregate([
      {
        $group: {
          _id: "$supervisorId",
          teamGB: { $sum: "$dataAmountGB" },
          teamAmount: { $sum: "$amount" },
        },
      },
    ]);

    const salesMap = new Map(
      allTeamSales.map((item) => [
        String(item._id),
        {
          teamGB: item.teamGB || 0,
          teamAmount: item.teamAmount || 0,
        },
      ]),
    );

    const supervisorDetails = await Promise.all(
      supervisors.map(async (sup) => {
        const myAgentsCount = await User.countDocuments({
          assignedSupervisor: sup._id,
          role: "agent",
        });

        const teamSales = salesMap.get(String(sup._id)) || {
          teamGB: 0,
          teamAmount: 0,
        };

        return {
          id: sup._id,
          name:
            sup.name || `${sup.surname || ""} ${sup.firstName || ""}`.trim(),
          phone: sup.phone,
          email: sup.email,
          teamSize: myAgentsCount,
          teamPerformance: teamSales.teamGB,
          teamRevenue: teamSales.teamAmount,
          targetAmount: sup.targets?.dataGoal || 0,
          targets: sup.targets || {
            dataGoal: 0,
            agentGoal: 0,
          },
        };
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Bellaj leader dashboard loaded successfully",
      networkStats: {
        totalSupervisors: supervisors.length,
        totalAgents: totalAgentsCount,
        overallDataSold: networkSummary.overallGB,
        overallRevenue: networkSummary.overallAmount,
        totalTransactions: networkSummary.totalTransactions,
        month: new Date().toLocaleString("en-US", {
          month: "long",
          year: "numeric",
        }),
      },
      supervisors: supervisorDetails,
    });
  } catch (error) {
    console.error("Bellaj Leader Dashboard Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
