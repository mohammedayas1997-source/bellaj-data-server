const User = require("../models/User");
const mongoose = require("mongoose");

let Sale;
try {
  Sale = require("../models/Sale");
} catch (e) {
  Sale = null;
}

let Transaction;
try {
  Transaction = require("../models/Transaction");
} catch (e) {
  Transaction = null;
}

let Activity;
try {
  Activity = require("../models/Activity");
} catch (e) {
  Activity = null;
}

const APP_NAME = "Bellaj Data Hub";

// ==========================================
// 1. SUPERVISOR MAIN DASHBOARD OVERVIEW
// ==========================================
/**
 * @desc    Main Supervisor Hub (Dashboard Overview, Stats & Agents)
 * @route   GET /api/v1/supervisor/dashboard
 * @access  Supervisor
 */
exports.getSupervisorDashboard = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;

    if (!supervisorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid supervisor session",
      });
    }

    const supervisor = await User.findById(supervisorId).select("-password");
    if (!supervisor) {
      return res.status(404).json({
        success: false,
        message: "Supervisor profile not found",
      });
    }

    // Dauko dukkan agents da ke karkashin wannan supervisor
    const agents = await User.find({
      $or: [
        { assignedSupervisor: supervisorId },
        { supervisorId: supervisorId },
        { supervisorCode: supervisor.referralId || supervisor.referralCode || supervisor.phone },
      ],
      role: "agent",
    })
      .select("firstName surname name phone email walletBalance balance targets address lga state isSuspended createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const agentIds = agents.map((a) => a._id);

    // Lissafin tallace-tallace daga Sale ko Transaction
    let totalDataSold = 0;
    let totalAirtimeSold = 0;

    if (Sale && agentIds.length > 0) {
      const salesAgg = await Sale.aggregate([
        { $match: { agentId: {$in: agentIds } } },
        {
          $group: {
            _id: null,
            totalGB: { $sum: "$dataAmountGB" },
            totalAirtime: { $sum: "$airtimeAmount" },
          },
        },
      ]);
      if (salesAgg.length > 0) {
        totalDataSold = salesAgg[0].totalGB || 0;
        totalAirtimeSold = salesAgg[0].totalAirtime || 0;
      }
    } else if (Transaction && agentIds.length > 0) {
      const txAgg = await Transaction.aggregate([
        { $match: { user: {$in: agentIds }, status: "success" } },
        {
          $group: {
            _id: "$type",
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);
      txAgg.forEach((item) => {
        if (item._id === "DATA" || item._id === "SME_DATA") totalDataSold += item.totalAmount / 250;
        if (item._id === "AIRTIME") totalAirtimeSold += item.totalAmount;
      });
    }

    const totalTeamFloat = agents.reduce(
      (sum, ag) => sum + Number(ag.walletBalance || ag.balance || 0),
      0
    );

    // Logs
    let activityLogs = [];
    if (Activity) {
      activityLogs = await Activity.find({
        $or: [{ staffId: supervisorId }, { targetUser: {$in: agentIds } }],
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
    }

    const currentMonthStr = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
    const supTargets = supervisor.targets || {};

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} supervisor dashboard compiled successfully`,
      data: {
        name: supervisor.name || `${supervisor.firstName || ""} ${supervisor.surname || ""}`.trim(),
        phone: supervisor.phone,
        email: supervisor.email,
        lga: supervisor.lga || "Gombe",
        state: supervisor.state || "Gombe",
        referralCode: supervisor.referralId || supervisor.referralCode || `BLJ-${supervisor.phone?.slice(-4)}`,
        myTarget: {
          dataGoal: Number(supTargets.dataGoal || 0),
          airtimeGoal: Number(supTargets.airtimeGoal || supTargets.salesGoal || 0),
          agentGoal: Number(supTargets.agentGoal || 10),
          currentMonth: supTargets.currentMonth || currentMonthStr,
          dataSold: totalDataSold,
          airtimeSold: totalAirtimeSold,
        },
        stats: {
          totalAgents: agents.length,
          activeAgentsCount: agents.filter((a) => (a.walletBalance || 0) > 0).length,
          overallDataSold: totalDataSold,
          overallAirtimeSold: totalAirtimeSold,
          totalTeamFloat,
        },
        agents,
        activityLogs,
        targetHistory: supTargets.history || [],
      },
    });
  } catch (error) {
    console.error("Bellaj Supervisor Dashboard Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 2. SUPERVISOR DIRECT TARGET INSPECTOR
// ==========================================
/**
 * @desc    Get supervisor's own assigned targets
 * @route   GET /api/v1/supervisor/my-target
 * @access  Supervisor
 */
exports.getMyTarget = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;
    const supervisor = await User.findById(supervisorId).select("targets firstName surname name");

    if (!supervisor) {
      return res.status(404).json({ success: false, message: "Supervisor not found" });
    }

    return res.status(200).json({
      success: true,
      targets: supervisor.targets || {
        dataGoal: 0,
        airtimeGoal: 0,
        agentGoal: 10,
        currentMonth: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 3. SUPERVISOR AGENTS LISTING
// ==========================================
/**
 * @desc    Get agents assigned to the logged-in supervisor
 * @route   GET /api/v1/supervisor/agents
 * @access  Supervisor
 */
exports.getMyAgents = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;

    if (!supervisorId) {
      return res.status(401).json({ success: false, message: "Unauthorized supervisor request" });
    }

    const supervisor = await User.findById(supervisorId);

    const agents = await User.find({
      $or: [
        { assignedSupervisor: supervisorId },
        { supervisorId: supervisorId },
        { supervisorCode: supervisor?.referralId || supervisor?.phone },
      ],
      role: "agent",
    })
      .select("firstName surname name phone email walletBalance balance targets address lga state status createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} supervisor agents loaded successfully`,
      count: agents.length,
      agents,
      data: agents,
    });
  } catch (error) {
    console.error("Bellaj Get My Agents Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 4. ACTIVITY LOGS & TELEMETRY
// ==========================================
/**
 * @desc    Get supervisor & team activity logs
 * @route   GET /api/v1/supervisor/activity-logs
 * @access  Supervisor
 */
exports.getActivityLogs = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;

    if (!Activity) {
      return res.status(200).json({ success: true, logs: [], data: [] });
    }

    const logs = await Activity.find({
      $or: [{ staffId: supervisorId }, { targetUser: supervisorId }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      logs,
      data: logs,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 5. TARGET HISTORY ARCHIVE
// ==========================================
/**
 * @desc    Get target allocation history
 * @route   GET /api/v1/supervisor/target-history
 * @access  Supervisor
 */
exports.getTargetHistory = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;
    const user = await User.findById(supervisorId).select("targets");

    const history = user?.targets?.history || [];

    return res.status(200).json({
      success: true,
      history,
      data: history,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 6. SINGLE AGENT SUMMARY & AUDIT
// ==========================================
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
      return res.status(400).json({ success: false, message: "Invalid agent ID" });
    }

    const agent = await User.findOne({
      _id: agentId,
      role: "agent",
      $or: [{ assignedSupervisor: supervisorId }, { supervisorId: supervisorId }],
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found or not assigned to this supervisor",
      });
    }

    let performance = { totalGB: 0, totalAmount: 0, totalTransactions: 0 };

    if (Sale) {
      const stats = await Sale.aggregate([
        { $match: { agentId: new mongoose.Types.ObjectId(agentId) } },
        {
          $group: {
            _id: null,
            totalGB: { $sum: "$dataAmountGB" },
            totalAmount: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
          },
        },
      ]);
      if (stats.length > 0) performance = stats[0];
    }

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agent sales summary loaded successfully`,
      data: performance,
    });
  } catch (error) {
    console.error("Bellaj Agent Sales Summary Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 7. ASSIGN TARGET TO AGENT
// ==========================================
/**
 * @desc    Assign target to an agent
 * @route   PATCH /api/v1/supervisor/assign-target/:agentId
 * @access  Supervisor
 */
exports.assignTargetToAgent = async (req, res) => {
  try {
    const supervisorId = req.user?._id || req.user?.id;
    const { agentId } = req.params;
    const { dataGoal, airtimeGoal, month } = req.body;

    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({ success: false, message: "Invalid agent ID" });
    }

    const numericDataGoal = Number(dataGoal || 0);
    const numericAirtimeGoal = Number(airtimeGoal || 0);

    const agent = await User.findOneAndUpdate(
      {
        _id: agentId,
        role: "agent",
        $or: [{ assignedSupervisor: supervisorId }, { supervisorId: supervisorId }],
      },
      {
        $set: {
          "targets.dataGoal": numericDataGoal,
          "targets.airtimeGoal": numericAirtimeGoal,
          "targets.currentMonth":
            month || new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
        },
      },
      { new: true, runValidators: true }
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
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 8. LEADER DASHBOARD
// ==========================================
/**
 * @desc    Get leader dashboard network overview
 * @route   GET /api/v1/leader/dashboard
 * @access  Leader/Admin
 */
exports.getLeaderDashboard = async (req, res) => {
  try {
    const supervisors = await User.find({ role: "supervisor" })
      .select("surname firstName name phone email targets lga state")
      .lean();

    const totalAgentsCount = await User.countDocuments({ role: "agent" });

    const supervisorDetails = await Promise.all(
      supervisors.map(async (sup) => {
        const myAgentsCount = await User.countDocuments({
          $or: [{ assignedSupervisor: sup._id }, { supervisorId: sup._id }],
          role: "agent",
        });

        return {
          id: sup._id,
          name: sup.name || `${sup.surname || ""} ${sup.firstName || ""}`.trim(),
          phone: sup.phone,
          email: sup.email,
          lga: sup.lga || "Gombe",
          state: sup.state || "Gombe",
          teamSize: myAgentsCount,
          targets: sup.targets || { dataGoal: 0, agentGoal: 10 },
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Bellaj leader dashboard loaded successfully",
      networkStats: {
        totalSupervisors: supervisors.length,
        totalAgents: totalAgentsCount,
        month: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
      },
      supervisors: supervisorDetails,
    });
  } catch (error) {
    console.error("Bellaj Leader Dashboard Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};