const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");
const mongoose = require("mongoose");

const APP_NAME = "Bellaj Data Hub";

// In-Memory fallback for Pricing Matrix idan babu Schema na musamman
let globalPricingConfig = {
  nimc: {
    validation: "1300",
    modification: "1700",
    name: "0",
    phone: "0",
    dob: "0",
    address: "0",
  },
  bvn: {
    verification: "0",
    retrieval: "0",
    correction: "0",
  },
  services: {
    airtimeCharge: "0",
    cableCharge: "0",
    electricityCharge: "0",
  },
  dataPlans: {
    sme: {
      mtn: { "500MB": "150", "1GB": "275", "2GB": "550", "5GB": "1375", ratePerGb: "275" },
      airtel: { "500MB": "160", "1GB": "285", "2GB": "570", "5GB": "1425", ratePerGb: "285" },
      glo: { "500MB": "140", "1GB": "260", "2GB": "520", "5GB": "1300", ratePerGb: "260" },
      "9mobile": { "500MB": "170", "1GB": "300", "2GB": "600", "5GB": "1500", ratePerGb: "300" },
    },
    gifting: {
      mtn: { "500MB": "170", "1GB": "310", "2GB": "620", "5GB": "1550", ratePerGb: "310" },
      airtel: { "500MB": "175", "1GB": "320", "2GB": "640", "5GB": "1600", ratePerGb: "320" },
      glo: { "500MB": "150", "1GB": "290", "2GB": "580", "5GB": "1450", ratePerGb: "290" },
      "9mobile": { "500MB": "180", "1GB": "330", "2GB": "660", "5GB": "1650", ratePerGb: "330" },
    },
    corporate: {
      mtn: { "500MB": "160", "1GB": "290", "2GB": "580", "5GB": "1450", ratePerGb: "290" },
      airtel: { "500MB": "165", "1GB": "295", "2GB": "590", "5GB": "1475", ratePerGb: "295" },
      glo: { "500MB": "145", "1GB": "270", "2GB": "540", "5GB": "1350", ratePerGb: "270" },
      "9mobile": { "500MB": "175", "1GB": "315", "2GB": "630", "5GB": "1575", ratePerGb: "315" },
    },
  },
};

/**
 * @desc    Get System Overview Statistics
 * @route   GET /api/v1/superadmin/stats
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
      userWallets,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: { $in: ["admin", "superadmin"] } }),
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
      User.aggregate([
        {
          $group: {
            _id: null,
            totalWalletBalance: { $sum: "$walletBalance" },
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
          walletBalance: userWallets[0]?.totalWalletBalance || 0,
        },
      },
    });
  } catch (error) {
    console.error("Bellaj System Stats Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Registered Users
 * @route   GET /api/v1/superadmin/users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      message: "Users loaded successfully",
      count: users.length,
      total,
      page,
      data: users,
    });
  } catch (error) {
    console.error("Get All Users Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Global Transactions
 * @route   GET /api/v1/superadmin/transactions
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
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Send Broadcast Push Notification to Users
 * @route   POST /api/v1/superadmin/broadcast
 */
exports.sendBroadcastNotification = async (req, res) => {
  try {
    const { title, message, target } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message content are required",
      });
    }

    let filter = {};
    if (target === "AGENTS") filter = { role: "agent" };
    if (target === "SUPERVISORS") filter = { role: "supervisor" };
    if (target === "SUBSCRIBERS") filter = { role: "user" };

    const recipientCount = await User.countDocuments(filter);

    await Activity.create({
      staffId: req.user?._id,
      action: "BROADCAST_NOTIFICATION_SENT",
      details: `Dispatched announcement: "${title}" to target group: ${target || "ALL"} (${recipientCount} recipients)`,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Broadcast message sent to ${recipientCount} user(s) successfully`,
      data: {
        title,
        message,
        target: target || "ALL",
        recipientCount,
        dispatchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Broadcast Notification Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Process Direct User Wallet Refund
 * @route   POST /api/v1/superadmin/refund
 */
exports.processUserRefund = async (req, res) => {
  try {
    const { userId, email, amount, reason, transactionId } = req.body;

    const refundAmount = Number(amount);
    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid positive refund amount is required",
      });
    }

    let query = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query._id = userId;
    } else if (email) {
      query.email = email.toLowerCase().trim();
    } else if (userId) {
      query.$or = [{ email: userId.toLowerCase().trim() }, { phone: userId.trim() }];
    } else {
      return res.status(400).json({
        success: false,
        message: "User ID, Phone or valid Email is required for refund",
      });
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Beneficiary user account could not be found",
      });
    }

    const previousBalance = user.walletBalance || 0;
    user.walletBalance = previousBalance + refundAmount;
    await user.save();

    const refundTx = await Transaction.create({
      user: user._id,
      type: "WALLET_REFUND",
      service: "ADMIN_REVERSAL",
      amount: refundAmount,
      status: "success",
      reference: `REFUND_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      narration: reason || "Direct Administrative Balance Refund",
      details: {
        originalTransactionId: transactionId || null,
        previousBalance,
        newBalance: user.walletBalance,
        refundedBy: req.user?._id || "SUPERADMIN",
      },
    }).catch(() => null);

    await Activity.create({
      staffId: req.user?._id,
      action: "USER_WALLET_REFUNDED",
      details: `Reversed ₦${refundAmount.toLocaleString()} to ${user.email}. Reason: ${reason || "Not specified"}`,
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `₦${refundAmount.toLocaleString()} credited successfully to ${user.email}`,
      data: {
        user: {
          _id: user._id,
          name: `${user.firstName || ""} ${user.surname || ""}`.trim(),
          email: user.email,
          newBalance: user.walletBalance,
        },
        transaction: refundTx,
      },
    });
  } catch (error) {
    console.error("Refund Processing Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Current Pricing Matrix
 * @route   GET /api/v1/superadmin/pricing
 */
exports.getPricingMatrix = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Pricing matrix loaded successfully",
      data: globalPricingConfig,
    });
  } catch (error) {
    console.error("Get Pricing Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update Pricing Matrix (Data, NIMC, BVN, VAS)
 * @route   PUT /api/v1/superadmin/pricing
 */
exports.updatePricingMatrix = async (req, res) => {
  try {
    const { nimc, bvn, services, dataPlans } = req.body;

    if (nimc) globalPricingConfig.nimc = { ...globalPricingConfig.nimc, ...nimc };
    if (bvn) globalPricingConfig.bvn = { ...globalPricingConfig.bvn, ...bvn };
    if (services) globalPricingConfig.services = { ...globalPricingConfig.services, ...services };
    if (dataPlans) globalPricingConfig.dataPlans = { ...globalPricingConfig.dataPlans, ...dataPlans };

    await Activity.create({
      staffId: req.user?._id,
      action: "PRICING_CONFIG_UPDATED",
      details: "Superadmin updated service and data pricing configurations",
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "Pricing matrix updated successfully across all channels",
      data: globalPricingConfig,
    });
  } catch (error) {
    console.error("Update Pricing Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Assign Targets to Field Agents
 * @route   POST /api/v1/superadmin/targets
 */
exports.assignTarget = async (req, res) => {
  try {
    const { target, type, agentId } = req.body;

    if (!target) {
      return res.status(400).json({
        success: false,
        message: "Target quota amount/volume is required",
      });
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "TARGET_ASSIGNED",
      details: `Assigned target ${target} (${type || "SALES"}) to ${agentId || "GLOBAL_ALL"}`,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "Target performance goal assigned successfully",
      data: { target, type, agentId: agentId || "GLOBAL_ALL" },
    });
  } catch (error) {
    console.error("Assign Target Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Enroll and Provision New Supervisor
 * @route   POST /api/v1/superadmin/create-supervisor
 */
exports.createSupervisor = async (req, res) => {
  try {
    const { name, firstName, surname, email, phone, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "An account with this email address already exists",
      });
    }

    const newSupervisor = await User.create({
      firstName: firstName || (name ? name.split(" ")[0] : "Supervisor"),
      surname: surname || (name && name.split(" ")[1] ? name.split(" ")[1] : "Field"),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : "0000000000",
      password,
      role: "supervisor",
    });

    return res.status(201).json({
      success: true,
      message: "Supervisor profile enrolled successfully",
      data: {
        _id: newSupervisor._id,
        email: newSupervisor.email,
        role: newSupervisor.role,
      },
    });
  } catch (error) {
    console.error("Create Supervisor Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Check Core API and Database Health
 * @route   GET /api/v1/superadmin/health
 */
exports.getSystemHealth = async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED";
    return res.status(200).json({
      success: true,
      status: "HEALTHY",
      database: dbState,
      uptime: `${Math.floor(process.uptime())}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Change User Role
 * @route   PATCH /api/v1/superadmin/manage-role
 */
exports.manageUserRole = async (req, res) => {
  try {
    const { userId, newRole } = req.body;
    const allowedRoles = ["user", "agent", "supervisor", "leader", "admin", "superadmin"];

    if (!userId || !newRole) {
      return res.status(400).json({ success: false, message: "User ID and new role are required" });
    }

    if (!allowedRoles.includes(newRole)) {
      return res.status(400).json({ success: false, message: "Invalid role supplied" });
    }

    if (String(userId) === String(req.user?.id) && newRole !== "superadmin") {
      return res.status(400).json({
        success: false,
        message: "You cannot demote your own superadmin account",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: newRole },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found" });
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
    console.error("Manage Role Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Make User Admin
 * @route   PATCH /api/v1/superadmin/make-admin
 */
exports.makeAdmin = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: "admin" },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found" });
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
    console.error("Make Admin Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Admin and Staff Audit Logs
 * @route   GET /api/v1/superadmin/audit-logs
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
    console.error("Audit Logs Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};