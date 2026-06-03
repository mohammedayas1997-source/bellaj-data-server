const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Get System Overview Statistics
 * @route   GET /api/v1/superadmin/stats
 * @access  Superadmin
 */
exports.getSystemStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalAdmins,
      totalSupervisors,
      totalAgents,
      totalLeaders,
      financeStats,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: "supervisor" }),
      User.countDocuments({ role: "agent" }),
      User.countDocuments({ role: "leader" }),
      Transaction.aggregate([
        { $match: { status: "success" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
            successfulTransactions: { $sum: 1 },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} system statistics loaded successfully`,
      data: {
        users: {
          totalUsers,
          totalAdmins,
          totalSupervisors,
          totalAgents,
          totalLeaders,
        },
        finance: {
          totalRevenue: financeStats[0]?.totalRevenue || 0,
          successfulTransactions: financeStats[0]?.successfulTransactions || 0,
        },
      },
    });
  } catch (error) {
    console.error("Bellaj System Stats Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get All Global Transactions
 * @route   GET /api/v1/superadmin/transactions
 * @access  Superadmin
 */
exports.getAllGlobalTransactions = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 500, 1000);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find()
        .populate("user", "surname firstName email phone role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} global transactions loaded successfully`,
      count: transactions.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: transactions,
    });
  } catch (error) {
    console.error("Bellaj Global Transactions Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get All Admin and Staff Audit Logs
 * @route   GET /api/v1/superadmin/audit-logs
 * @access  Superadmin
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await Activity.find()
      .populate("staffId", "surname firstName role email")
      .populate("targetUser", "surname firstName role")
      .sort({ createdAt: -1 })
      .limit(1000);

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} audit logs loaded successfully`,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("Bellaj Audit Logs Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Change Any User Role
 * @route   PATCH /api/v1/superadmin/manage-role
 * @access  Superadmin
 */
exports.manageUserRole = async (req, res) => {
  try {
    const { userId, newRole } = req.body;

    const allowedRoles = [
      "user",
      "agent",
      "supervisor",
      "leader",
      "admin",
      "superadmin",
    ];

    if (!userId || !newRole) {
      return res.status(400).json({
        success: false,
        message: "User ID and new role are required",
      });
    }

    if (!allowedRoles.includes(newRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role supplied",
      });
    }

    if (String(userId) === String(req.user.id) && newRole !== "superadmin") {
      return res.status(400).json({
        success: false,
        message: "You cannot demote your own superadmin account",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: newRole },
      { new: true, runValidators: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found",
      });
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ROLE_UPDATED",
      details: `User role changed to ${newRole}`,
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `User role updated to ${newRole}`,
      data: user,
    });
  } catch (error) {
    console.error("Bellaj Manage Role Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Make User Admin
 * @route   PATCH /api/v1/superadmin/make-admin
 * @access  Superadmin
 */
exports.makeAdmin = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: "admin" },
      { new: true, runValidators: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found",
      });
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ADMIN_ASSIGNED",
      details: "User role changed to admin",
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "User is now an admin",
      data: user,
    });
  } catch (error) {
    console.error("Bellaj Make Admin Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
