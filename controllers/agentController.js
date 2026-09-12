const mongoose = require("mongoose");
const User = require("../models/User");
const Sale = require("../models/Sale");
let Transaction;
try {
  Transaction = require("../models/Transaction");
} catch (e) {
  Transaction = null;
}

const APP_NAME = "Bellaj Data Hub";

/**
 * 1. Get Agent Monthly Performance
 * @route GET /api/v1/agent/performance
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

    const agentUser = await User.findById(agentId).lean();
    if (!agentUser) {
      return res.status(404).json({
        success: false,
        message: "Agent account not found",
      });
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const objectId = new mongoose.Types.ObjectId(agentId);

    // 1. Gwada samo alkaluma daga Sale model
    let totalGB = 0;
    let totalSalesValue = 0;
    let totalTransactions = 0;

    try {
      const monthlySales = await Sale.aggregate([
        {
          $match: {
            $or: [{ agentId: objectId }, { user: objectId }, { userId: objectId }],
            createdAt: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalGB: { $sum: { $ifNull: ["$dataAmountGB", { $ifNull: ["$volumeGB", 0] }] } },
            totalSalesValue: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
          },
        },
      ]);

      if (monthlySales.length > 0) {
        totalGB = monthlySales[0].totalGB || 0;
        totalSalesValue = monthlySales[0].totalSalesValue || 0;
        totalTransactions = monthlySales[0].totalTransactions || 0;
      }
    } catch {
      // Ci gaba idan babu collection din Sale
    }

    // 2. Idan babu komai a Sale, duba Transaction model
    if (totalSalesValue === 0 && Transaction) {
      try {
        const txStats = await Transaction.aggregate([
          {
            $match: {
              $or: [{ user: objectId }, { userId: objectId }, { agentId: objectId }],
              status: "success",
              createdAt: { $gte: startOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              totalGB: { $sum: { $ifNull: ["$volumeGB", 0] } },
              totalSalesValue: { $sum: "$amount" },
              totalTransactions: { $sum: 1 },
            },
          },
        ]);

        if (txStats.length > 0) {
          totalGB = txStats[0].totalGB || 0;
          totalSalesValue = txStats[0].totalSalesValue || 0;
          totalTransactions = txStats[0].totalTransactions || 0;
        }
      } catch {
        // Fallback
      }
    }

    // 3. Karbo Targets, Commissions da Bonuses daga User profile
    const userTargets = agentUser.targets || {};
    const monthlyTargetSales = Number(
      userTargets.salesGoal || userTargets.quota || userTargets.target || 100000
    );

    const commissionsEarned = Number(
      agentUser.commissionBalance || agentUser.commissions || (totalSalesValue * 0.02)
    );
    const bonusEarned = Number(agentUser.bonusBalance || agentUser.bonus || 0);

    const performanceData = {
      totalGB: Number(totalGB),
      totalSalesValue: Number(totalSalesValue),
      totalTransactions: Number(totalTransactions),
      monthlyTargetSales,
      commissionsEarned: Math.round(commissionsEarned),
      bonusEarned: Math.round(bonusEarned),
      currentMonth: userTargets.currentMonth || new Date().toLocaleString("en-US", { month: "long" }),
    };

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agent performance loaded successfully`,
      data: performanceData,
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
 * @route GET /api/v1/agent/sales-history
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

    let records = [];

    // Nemi records a Sale
    try {
      records = await Sale.find({
        $or: [{ agentId }, { user: agentId }, { userId: agentId }],
      })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
    } catch {}

    // Idan Sale babu records, duba Transaction
    if (records.length === 0 && Transaction) {
      try {
        records = await Transaction.find({
          $or: [{ user: agentId }, { userId: agentId }, { agentId }],
        })
          .sort({ createdAt: -1 })
          .limit(200)
          .lean();
      } catch {}
    }

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agent sales history loaded successfully`,
      count: records.length,
      data: records,
      sales: records,
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
 * @route GET /api/v1/agent/my-supervisor
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
      .populate("supervisorId", "name firstName surname phone email")
      .lean();

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
      supervisor,
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
 * 4. Create Agent
 * @route POST /api/v1/agent/create
 */
exports.createAgent = async (req, res) => {
  try {
    const { firstName, surname, name, email, phone, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const resolvedName = name || `${firstName || ""} ${surname || ""}`.trim() || "Agent";

    const newAgent = await User.create({
      ...req.body,
      name: resolvedName,
      email: cleanEmail,
      phone: phone || "",
      role: "agent",
      assignedSupervisor: req.user?._id || undefined,
    });

    return res.status(201).json({
      success: true,
      message: `${APP_NAME} agent enrolled successfully`,
      data: {
        _id: newAgent._id,
        name: newAgent.name,
        email: newAgent.email,
        role: newAgent.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 5. Get All Agents
 * @route GET /api/v1/agent/all
 */
exports.getAgents = async (req, res) => {
  try {
    const filter = { role: "agent" };

    // Idan supervisor ne ke nema, nuna agents dinsa kadai
    if (req.user?.role === "supervisor") {
      filter.$or = [
        { assignedSupervisor: req.user._id },
        { supervisorId: req.user._id },
      ];
    }

    const agents = await User.find(filter)
      .select("name firstName surname email phone status walletBalance createdAt targets")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agents loaded successfully`,
      count: agents.length,
      data: agents,
      agents,
    });
  } catch (error) {
    console.error("Bellaj Get Agents Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};