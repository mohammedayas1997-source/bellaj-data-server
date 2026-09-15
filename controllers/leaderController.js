const User = require("../models/User");
const TargetHistory = require("../models/TargetHistory");
const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const APP_NAME = "Bellaj Data Hub";

// Helper don nemo User ta hanyar ID, Email ko Phone
const findSupervisor = async (identifier) => {
  if (!identifier) return null;
  const cleanId = String(identifier).trim();

  let query = { role: "supervisor" };
  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    query._id = cleanId;
  } else {
    query.$or = [
      { email: cleanId.toLowerCase() },
      { phone: cleanId },
    ];
  }
  return await User.findOne(query);
};

/**
 * @desc    Leader assigns target to a Supervisor
 * @route   POST /api/v1/leader/assign-target
 * @access  Leader/Admin
 */
exports.assignSupervisorTarget = async (req, res) => {
  try {
    const { supervisorId, targetUserId, dataGoal, agentGoal, salesGoal, month, note } = req.body;
    const targetRef = supervisorId || targetUserId || req.body.id;

    if (!targetRef) {
      return res.status(400).json({
        success: false,
        message: "Please provide supervisorId, email, or phone",
      });
    }

    const supervisor = await findSupervisor(targetRef);

    if (!supervisor) {
      return res.status(404).json({
        success: false,
        message: "Supervisor profile could not be found",
      });
    }

    const currentTargets = supervisor.targets || {};

    const newTargets = {
      dataGoal: dataGoal !== undefined ? Number(dataGoal) : currentTargets.dataGoal || 0,
      agentGoal: agentGoal !== undefined ? Number(agentGoal) : currentTargets.agentGoal || 0,
      salesGoal: salesGoal !== undefined ? Number(salesGoal) : currentTargets.salesGoal || 0,
      currentMonth:
        month ||
        currentTargets.currentMonth ||
        new Date().toLocaleString("en-US", { month: "long" }) + " " + new Date().getFullYear(),
    };

    if (
      Number.isNaN(newTargets.dataGoal) ||
      Number.isNaN(newTargets.agentGoal) ||
      Number.isNaN(newTargets.salesGoal)
    ) {
      return res.status(400).json({
        success: false,
        message: "All goal targets must be valid numbers",
      });
    }

    supervisor.targets = newTargets;
    if (req.user?._id) supervisor.assignedLeader = req.user._id;
    supervisor.markModified("targets");

    await supervisor.save();

    if (TargetHistory) {
      await TargetHistory.create({
        assignedTo: supervisor._id,
        assignedBy: req.user?._id,
        dataGoal: newTargets.dataGoal,
        agentGoal: newTargets.agentGoal,
        salesGoal: newTargets.salesGoal,
        month: newTargets.currentMonth,
        note: note || `${APP_NAME} supervisor target assigned`,
      }).catch(() => null);
    }

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} supervisor target assigned successfully`,
      targets: supervisor.targets,
      supervisor: {
        id: supervisor._id,
        name: supervisor.name || `${supervisor.firstName || ""} ${supervisor.surname || ""}`.trim(),
        email: supervisor.email,
      },
    });
  } catch (error) {
    console.error("Bellaj Assign Target Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc    Get Detailed Stats for Leader Dashboard
 * @route   GET /api/v1/leader/dashboard
 * @access  Leader/Admin
 */
exports.getLeaderDashboard = async (req, res) => {
  try {
    let query = { role: "supervisor" };
    if (req.user?._id && req.user.role === "leader") {
      const assignedCount = await User.countDocuments({
        role: "supervisor",
        assignedLeader: req.user._id,
      });
      if (assignedCount > 0) {
        query.assignedLeader = req.user._id;
      }
    }

    const supervisors = await User.find(query).select("-password").lean();

    const supDetails = await Promise.all(
      supervisors.map(async (sup) => {
        const [agentsCount, agentIds] = await Promise.all([
          User.countDocuments({
            role: "agent",
            assignedSupervisor: sup._id,
          }),
          User.find({ role: "agent", assignedSupervisor: sup._id }).distinct("_id"),
        ]);

        let teamPerformance = 0;
        let revenue = 0;

        if (Transaction && agentIds.length > 0) {
          const txAggregate = await Transaction.aggregate([
            { $match: { user: { $in: agentIds }, status: "success" } },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalGB: { $sum: "$volumeGB" },
              },
            },
          ]);

          if (txAggregate.length > 0) {
            revenue = txAggregate[0].totalRevenue || 0;
            teamPerformance = txAggregate[0].totalGB || 0;
          }
        }

        return {
          id: sup._id,
          _id: sup._id,
          name:
            sup.name ||
            sup.fullName ||
            `${sup.firstName || ""} ${sup.surname || ""}`.trim() ||
            "Supervisor",
          phone: sup.phone || "",
          email: sup.email || "",
          address: sup.address || "",
          isSuspended: sup.isSuspended || sup.status === "suspended" || false,
          teamSize: agentsCount || sup.totalAgents || (sup.agents ? sup.agents.length : 0),
          teamPerformance: teamPerformance || sup.totalGB || 0,
          revenue: revenue || sup.totalSalesValue || 0,
          targets: sup.targets || {
            dataGoal: 0,
            agentGoal: 0,
            salesGoal: 0,
            currentMonth: new Date().toLocaleString("en-US", { month: "long" }),
          },
        };
      })
    );

    const totalAgentsCount = supDetails.reduce((sum, s) => sum + Number(s.teamSize || 0), 0);
    const overallDataSold = supDetails.reduce((sum, s) => sum + Number(s.teamPerformance || 0), 0);
    const totalRevenue = supDetails.reduce((sum, s) => sum + Number(s.revenue || 0), 0);

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} leader dashboard loaded successfully`,
      networkStats: {
        totalSupervisors: supDetails.length,
        totalAgents: totalAgentsCount,
        overallDataSold,
        totalRevenue,
      },
      count: supDetails.length,
      supervisors: supDetails,
      data: {
        networkStats: {
          totalSupervisors: supDetails.length,
          totalAgents: totalAgentsCount,
          overallDataSold,
          totalRevenue,
        },
        supervisors: supDetails,
      },
    });
  } catch (error) {
    console.error("Bellaj Leader Dashboard Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Toggle Supervisor Status (Suspend/Activate)
 * @route   PATCH /api/v1/leader/supervisor-status/:supervisorId
 * @access  Leader/Admin
 */
exports.toggleSupervisorStatus = async (req, res) => {
  try {
    const { supervisorId } = req.params;
    const supervisor = await findSupervisor(supervisorId);

    if (!supervisor) {
      return res.status(404).json({
        success: false,
        message: "Supervisor profile not found",
      });
    }

    supervisor.isSuspended = !supervisor.isSuspended;
    supervisor.status = supervisor.isSuspended ? "suspended" : "active";
    await supervisor.save();

    return res.status(200).json({
      success: true,
      message: supervisor.isSuspended
        ? "Supervisor suspended successfully"
        : "Supervisor activated successfully",
      isSuspended: supervisor.isSuspended,
      status: supervisor.status,
    });
  } catch (error) {
    console.error("Bellaj Toggle Supervisor Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc    Create New Supervisor (GYARTACCE TARE DA BCRYPT DA CIKAKKEN SCHEMA)
 * @route   POST /api/v1/leader/create-supervisor
 * @access  Leader/Admin
 */
exports.createNewSupervisor = async (req, res) => {
  try {
    const { firstName, surname, name, email, phone, password } = req.body;

    if (!email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, email, phone, and password are required",
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    const existingUser = await User.findOne({
      $or: [{ email: cleanEmail }, { phone: cleanPhone }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email or phone number already exists",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const resolvedFirstName = firstName || (name ? name.split(" ")[0] : "Supervisor");
    const resolvedSurname = surname || (name && name.split(" ")[1] ? name.split(" ")[1] : "Field");

    const newSupervisor = await User.create({
      firstName: resolvedFirstName.trim(),
      surname: resolvedSurname.trim(),
      name: (name || `${resolvedFirstName} ${resolvedSurname}`).trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password: hashedPassword,
      role: "supervisor",
      isSuspended: false,
      status: "active",
      walletBalance: 0,
      pin: "0000",
      bankName: "Wema Bank",
      assignedLeader: req.user?._id || undefined,
    });

    return res.status(201).json({
      success: true,
      message: `${APP_NAME} supervisor created successfully`,
      data: {
        _id: newSupervisor._id,
        name: newSupervisor.name,
        email: newSupervisor.email,
        phone: newSupervisor.phone,
        role: newSupervisor.role,
      },
    });
  } catch (error) {
    console.error("Bellaj Create Supervisor Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc    Download Supervisor Report
 * @route   GET /api/v1/leader/supervisor-report/:supervisorId
 * @access  Leader/Admin
 */
exports.downloadSupervisorReport = async (req, res) => {
  try {
    const { supervisorId } = req.params;
    const supervisor = await findSupervisor(supervisorId);

    if (!supervisor) {
      return res.status(404).json({ success: false, message: "Supervisor not found" });
    }

    let history = [];
    if (TargetHistory) {
      history = await TargetHistory.find({ assignedTo: supervisor._id })
        .sort({ createdAt: -1 })
        .lean();
    }

    return res.status(200).json({
      success: true,
      message: "Supervisor target report loaded successfully",
      count: history.length,
      supervisor: {
        id: supervisor._id,
        name: supervisor.name,
        email: supervisor.email,
      },
      data: history,
    });
  } catch (error) {
    console.error("Bellaj Supervisor Report Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc    Assign Agent to Supervisor
 * @route   PATCH /api/v1/leader/assign-agent
 * @access  Leader/Admin
 */
exports.assignAgentToSupervisor = async (req, res) => {
  try {
    const { agentId, supervisorId } = req.body;

    if (!agentId || !supervisorId) {
      return res.status(400).json({
        success: false,
        message: "agentId and supervisorId are required",
      });
    }

    const supervisor = await findSupervisor(supervisorId);
    if (!supervisor) {
      return res.status(404).json({ success: false, message: "Supervisor not found" });
    }

    let agentQuery = { role: "agent" };
    if (mongoose.Types.ObjectId.isValid(agentId)) {
      agentQuery._id = agentId;
    } else {
      agentQuery.$or = [{ email: agentId.toLowerCase().trim() }, { phone: agentId.trim() }];
    }

    const agent = await User.findOneAndUpdate(
      agentQuery,
      { assignedSupervisor: supervisor._id },
      { new: true }
    );

    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent account not found" });
    }

    return res.status(200).json({
      success: true,
      message: `Agent assigned to ${supervisor.name} successfully`,
      data: agent,
    });
  } catch (error) {
    console.error("Bellaj Assign Agent Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc    Get All Agents
 * @route   GET /api/v1/leader/agents
 * @access  Leader/Admin
 */
exports.getAllAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: "agent" })
      .populate("assignedSupervisor", "name firstName surname phone email")
      .select("-password")
      .lean();

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} agents loaded successfully`,
      count: agents.length,
      agents,
      data: agents,
    });
  } catch (error) {
    console.error("Bellaj Get Agents Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};