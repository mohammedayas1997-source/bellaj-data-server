const User = require("../models/User");
const TargetHistory = require("../models/TargetHistory");
const mongoose = require("mongoose");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Leader assigns target to a Supervisor
 * @route   POST /api/v1/leader/assign-target
 * @access  Leader/Admin
 */
exports.assignSupervisorTarget = async (req, res) => {
  try {
    const { supervisorId, dataGoal, agentGoal, month } = req.body;

    if (!supervisorId) {
      return res.status(400).json({
        success: false,
        message: "Please provide supervisorId",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(supervisorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid supervisorId",
      });
    }

    const supervisor = await User.findOne({
      _id: supervisorId,
      role: "supervisor",
    });

    if (!supervisor) {
      return res.status(404).json({
        success: false,
        message: "Supervisor not found",
      });
    }

    const currentTargets = supervisor.targets || {};

    const newTargets = {
      dataGoal:
        dataGoal !== undefined
          ? Number(dataGoal)
          : currentTargets.dataGoal || 0,

      agentGoal:
        agentGoal !== undefined
          ? Number(agentGoal)
          : currentTargets.agentGoal || 0,

      currentMonth:
        month ||
        currentTargets.currentMonth ||
        new Date().toLocaleString("en-US", {
          month: "long",
        }),
    };

    if (
      Number.isNaN(newTargets.dataGoal) ||
      Number.isNaN(newTargets.agentGoal)
    ) {
      return res.status(400).json({
        success: false,
        message: "dataGoal and agentGoal must be valid numbers",
      });
    }

    supervisor.targets = newTargets;
    supervisor.assignedLeader = req.user?._id;
    supervisor.markModified("targets");

    await supervisor.save();

    await TargetHistory.create({
      assignedTo: supervisor._id,
      assignedBy: req.user?._id,
      dataGoal: newTargets.dataGoal,
      agentGoal: newTargets.agentGoal,
      month: newTargets.currentMonth,
      note: `${APP_NAME} supervisor target assigned`,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "Bellaj supervisor target assigned successfully",
      targets: supervisor.targets,
    });
  } catch (error) {
    console.error("Bellaj Assign Target Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
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

    if (!mongoose.Types.ObjectId.isValid(supervisorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid supervisorId",
      });
    }

    const history = await TargetHistory.find({
      assignedTo: supervisorId,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!history || history.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No target history found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bellaj supervisor target report loaded successfully",
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error("Bellaj Supervisor Report Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Toggle Supervisor Status
 * @route   PATCH /api/v1/leader/supervisor-status/:supervisorId
 * @access  Leader/Admin
 */
exports.toggleSupervisorStatus = async (req, res) => {
  try {
    const { supervisorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(supervisorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid supervisorId",
      });
    }

    const user = await User.findOne({
      _id: supervisorId,
      role: "supervisor",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Supervisor not found",
      });
    }

    user.isSuspended = !user.isSuspended;
    await user.save();

    return res.status(200).json({
      success: true,
      message: user.isSuspended
        ? "Supervisor suspended successfully"
        : "Supervisor activated successfully",
      isSuspended: user.isSuspended,
    });
  } catch (error) {
    console.error("Bellaj Toggle Supervisor Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Create New Supervisor
 * @route   POST /api/v1/leader/create-supervisor
 * @access  Leader/Admin
 */
exports.createNewSupervisor = async (req, res) => {
  try {
    const { firstName, surname, email, phone, password } = req.body;

    if (!firstName || !surname || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "firstName, surname, email, phone and password are required",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        {
          email: email.toLowerCase().trim(),
        },
        {
          phone: phone.trim(),
        },
      ],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number already exists",
      });
    }

    const newSupervisor = await User.create({
      ...req.body,
      firstName: firstName.trim(),
      surname: surname.trim(),
      name: `${firstName} ${surname}`.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      role: "supervisor",
      assignedLeader: req.user?._id,
    });

    return res.status(201).json({
      success: true,
      message: "Bellaj supervisor created successfully",
      data: newSupervisor,
    });
  } catch (error) {
    console.error("Bellaj Create Supervisor Error:", error);

    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Get Detailed Stats for Leader Dashboard
 * @route   GET /api/v1/leader/dashboard
 * @access  Leader/Admin
 */
exports.getLeaderDashboard = async (req, res) => {
  try {
    const supervisors = await User.find({
      role: "supervisor",
      assignedLeader: req.user?._id,
    }).lean();

    const supDetails = await Promise.all(
      supervisors.map(async (sup) => {
        const agentsCount = await User.countDocuments({
          role: "agent",
          assignedSupervisor: sup._id,
        });

        return {
          id: sup._id,
          name:
            sup.name || `${sup.firstName || ""} ${sup.surname || ""}`.trim(),
          phone: sup.phone,
          email: sup.email,
          isSuspended: sup.isSuspended || false,
          teamSize: agentsCount,
          targets: sup.targets || {
            dataGoal: 0,
            agentGoal: 0,
            currentMonth: new Date().toLocaleString("en-US", {
              month: "long",
            }),
          },
        };
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Bellaj leader dashboard loaded successfully",
      count: supDetails.length,
      supervisors: supDetails,
    });
  } catch (error) {
    console.error("Bellaj Leader Dashboard Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
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

    if (
      !mongoose.Types.ObjectId.isValid(agentId) ||
      !mongoose.Types.ObjectId.isValid(supervisorId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid agentId or supervisorId",
      });
    }

    const supervisor = await User.findOne({
      _id: supervisorId,
      role: "supervisor",
    });

    if (!supervisor) {
      return res.status(404).json({
        success: false,
        message: "Supervisor not found",
      });
    }

    const agent = await User.findOneAndUpdate(
      {
        _id: agentId,
        role: "agent",
      },
      {
        assignedSupervisor: supervisorId,
      },
      {
        new: true,
      },
    );

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bellaj agent assigned to supervisor successfully",
      data: agent,
    });
  } catch (error) {
    console.error("Bellaj Assign Agent Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Get All Agents
 * @route   GET /api/v1/leader/agents
 * @access  Leader/Admin
 */
exports.getAllAgents = async (req, res) => {
  try {
    const agents = await User.find({
      role: "agent",
    })
      .populate("assignedSupervisor", "name firstName surname phone")
      .select("-password")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Bellaj agents loaded successfully",
      count: agents.length,
      agents,
    });
  } catch (error) {
    console.error("Bellaj Get Agents Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
