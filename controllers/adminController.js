const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");
const NIMCRequest = require("../models/NIMCRequest");
const BVNRequest = require("../models/BVNRequest");
const SupportRequest = require("../models/SupportRequest");
const mongoose = require("mongoose");

const APP_NAME = "Bellaj Data Hub";

// Helper: Tura notification ga mai amfani guda daya
const sendNotification = async (userId, title, message) => {
  try {
    const user = await User.findById(userId);
    if (user) {
      if (!user.notifications) user.notifications = [];
      user.notifications.unshift({
        title,
        message,
        date: new Date(),
        isRead: false,
      });
      await user.save();
    }
  } catch (error) {
    console.error("Bellaj notification failed:", error.message);
  }
};

/**
 * @desc    Tura Notification ga kowa ko rukuni na musamman
 * @route   POST /api/v1/admin/notifications/broadcast
 */
const broadcastNotification = async (req, res) => {
  try {
    const { title, message, target } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message body are required",
      });
    }

    let filter = {};
    if (target === "AGENTS") filter = { role: "agent" };
    if (target === "SUPERVISORS") filter = { role: "supervisor" };
    if (target === "SUBSCRIBERS") filter = { role: "user" };

    const newNotification = {
      title,
      message,
      date: new Date(),
      isRead: false,
    };

    const updateResult = await User.updateMany(filter, {
      $push: { notifications: { $each: [newNotification], $position: 0 } },
    });

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ADMIN_BROADCAST",
      details: `Broadcast: "${title}" delivered to ${updateResult.modifiedCount || 0} user(s).`,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Notification broadcasted to ${updateResult.modifiedCount || 0} user(s).`,
      recipientCount: updateResult.modifiedCount || 0,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Admin Live Dashboard Statistics
 * @route   GET /api/v1/admin/dashboard-stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalAgents,
      totalSupervisors,
      nimcCount,
      bvnCount,
      supportCount,
      txCount,
      revenueResult,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "agent" }),
      User.countDocuments({ role: "supervisor" }),
      NIMCRequest ? NIMCRequest.countDocuments() : 0,
      BVNRequest ? BVNRequest.countDocuments() : 0,
      SupportRequest ? SupportRequest.countDocuments() : 0,
      Transaction.countDocuments(),
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
      message: `${APP_NAME} live analytics compiled`,
      totalUsers,
      totalAgents,
      totalSupervisors,
      nimcRequests: nimcCount,
      bvnRequests: bvnCount,
      reports: supportCount,
      transactions: txCount,
      finance: {
        totalRevenue: revenueResult[0]?.totalRevenue || 0,
        successfulTransactions: revenueResult[0]?.successfulTransactions || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Sales Statistics
 * @route   GET /api/v1/admin/sales-stats
 */
const getSalesStats = async (req, res) => {
  try {
    const [revenueData, totalSalesCount] = await Promise.all([
      Transaction.aggregate([
        { $match: { status: "success" } },
        {
          $group: {
            _id: null,
            totalSales: { $sum: "$amount" },
          },
        },
      ]),
      Transaction.countDocuments({ status: "success" }),
    ]);

    const totalRevenue = revenueData[0]?.totalSales || 0;

    return res.status(200).json({
      success: true,
      totalSales: totalRevenue,
      total: totalRevenue,
      count: totalSalesCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Direct User Wallet Refund
 * @route   POST /api/v1/admin/wallet/refund
 */
const processDirectRefund = async (req, res) => {
  try {
    const { userId, email, amount, reason, transactionId, reference } = req.body;
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
      query.$or = [{ email: String(userId).toLowerCase().trim() }, { phone: String(userId).trim() }];
    } else {
      return res.status(400).json({
        success: false,
        message: "User identifier (Email, ID, or Phone) is required",
      });
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Recipient user could not be found",
      });
    }

    const prevBalance = Number(user.walletBalance || user.balance || 0);
    user.walletBalance = prevBalance + refundAmount;

    if (!user.transactions) user.transactions = [];
    const generatedRef = reference || `REF_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    user.transactions.unshift({
      transactionId: generatedRef,
      type: "credit",
      amount: refundAmount,
      status: "success",
      description: `Wallet Refund: ${reason || "Administrative Balance Adjustment"}`,
      date: new Date(),
    });

    await user.save();

    const ledgerTx = await Transaction.create({
      user: user._id,
      type: "WALLET_REFUND",
      service: "ADMIN_REVERSAL",
      amount: refundAmount,
      status: "success",
      reference: generatedRef,
      narration: reason || "Administrative Direct Refund",
      details: {
        originalTransactionId: transactionId || null,
        previousBalance: prevBalance,
        newBalance: user.walletBalance,
        refundedBy: req.user?._id || "ADMIN",
      },
    }).catch(() => null);

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ADMIN_REFUND_EXECUTED",
      details: `Credited ₦${refundAmount.toLocaleString()} to ${user.email}. Reason: ${reason || "N/A"}`,
      targetUser: user._id,
    }).catch(() => null);

    await sendNotification(
      user._id,
      "Wallet Refund Credited",
      `₦${refundAmount.toLocaleString()} has been credited back to your ${APP_NAME} wallet.`,
    );

    return res.status(200).json({
      success: true,
      message: `₦${refundAmount.toLocaleString()} credited successfully to ${user.email}`,
      data: {
        newBalance: user.walletBalance,
        transaction: ledgerTx,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Approve Pending Transaction Refund
 * @route   PATCH /api/v1/admin/refunds/:id/approve
 */
const approveRefund = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction || transaction.status !== "pending-refund") {
      return res.status(400).json({
        success: false,
        message: "Transaction is not pending a refund",
      });
    }

    const userId = transaction.user || transaction.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account linked to transaction not found",
      });
    }

    const refundAmount = Number(transaction.amount || 0);
    user.walletBalance = Number(user.walletBalance || user.balance || 0) + refundAmount;

    transaction.status = "refunded";
    transaction.approvedBy = req.user?._id;
    transaction.resolvedAt = Date.now();

    if (!user.transactions) user.transactions = [];
    user.transactions.unshift({
      transactionId: transaction.reference || `REF_${Date.now()}`,
      type: "credit",
      amount: refundAmount,
      status: "success",
      description: `Refund Approved: ${transaction.service || transaction.type || "VAS Service"}`,
      date: new Date(),
    });

    await Promise.all([user.save(), transaction.save()]);

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_REFUND_APPROVED",
      details: `Approved refund of ₦${refundAmount} for transaction ${transaction._id}`,
      targetUser: user._id,
    }).catch(() => null);

    await sendNotification(
      user._id,
      "Refund Approved",
      `Your refund request of ₦${refundAmount.toLocaleString()} has been approved and credited.`,
    );

    return res.status(200).json({
      success: true,
      message: "Refund approved and balance credited successfully",
      newBalance: user.walletBalance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Assign Targets (Agent or Supervisor)
 * @route   POST /api/v1/admin/targets
 */
const assignTarget = async (req, res) => {
  try {
    const { supervisorId, agentId, target, type, agentGoal, dataGoal, month } = req.body;
    const targetUserId = supervisorId || agentId;

    if (!targetUserId || targetUserId === "ALL" || targetUserId === "GLOBAL_ALL") {
      await Activity.create({
        staffId: req.user?._id,
        action: "BELLAJ_GLOBAL_TARGET_SET",
        details: `Global operational target set: ${target || agentGoal || dataGoal || 0} (${type || "SALES"})`,
      }).catch(() => null);

      return res.status(200).json({
        success: true,
        message: "Global operational target set successfully",
        data: { target, type, month: month || new Date().toLocaleString("default", { month: "long" }) },
      });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Target user not found",
      });
    }

    const currentTargets = targetUser.targets || {};
    targetUser.targets = {
      agentGoal: agentGoal !== undefined ? Number(agentGoal) : currentTargets.agentGoal || 0,
      dataGoal: dataGoal !== undefined ? Number(dataGoal) : currentTargets.dataGoal || 0,
      quota: target !== undefined ? Number(target) : currentTargets.quota || 0,
      type: type || currentTargets.type || "SALES",
      currentMonth: month || currentTargets.currentMonth || new Date().toLocaleString("default", { month: "long" }),
    };

    targetUser.markModified("targets");
    await targetUser.save();

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_TARGET_ASSIGNED",
      details: `Assigned target to ${targetUser.email}`,
      targetUser: targetUser._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "Target assigned successfully",
      data: targetUser.targets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Global Transactions
 * @route   GET /api/v1/admin/transactions
 */
const getAllTransactions = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
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
      count: transactions.length,
      total,
      data: transactions,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    NIMC Requests Handlers
 */
const getAllNIMCRequests = async (req, res) => {
  try {
    const requests = await NIMCRequest.find()
      .populate("user", "surname firstName email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
      requests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateToProcessing = async (req, res) => {
  try {
    const request = await NIMCRequest.findByIdAndUpdate(
      req.params.id,
      { status: "processing" },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ success: false, message: "NIMC request not found" });
    }

    return res.status(200).json({
      success: true,
      message: "NIMC request updated to processing",
      data: request,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveRequest = async (req, res) => {
  try {
    const request = await NIMCRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "NIMC request not found" });
    }

    request.status = "completed";
    await request.save();

    await sendNotification(
      request.user,
      "NIMC Request Completed",
      `Your NIMC request has been completed successfully on ${APP_NAME}.`
    );

    return res.status(200).json({
      success: true,
      message: "NIMC request approved and completed",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    BVN Requests Handlers
 */
const getAllBVNRequests = async (req, res) => {
  try {
    const requests = await BVNRequest.find()
      .populate("user", "surname firstName email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
      requests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateBVNStatus = async (req, res) => {
  try {
    const request = await BVNRequest.findByIdAndUpdate(
      req.params.id,
      { status: "processing" },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ success: false, message: "BVN request not found" });
    }

    return res.status(200).json({
      success: true,
      message: "BVN request updated to processing",
      data: request,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveBVNRequest = async (req, res) => {
  try {
    const request = await BVNRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "BVN request not found" });
    }

    request.status = "completed";
    await request.save();

    await sendNotification(
      request.user,
      "BVN Request Completed",
      `Your BVN request has been completed successfully on ${APP_NAME}.`
    );

    return res.status(200).json({
      success: true,
      message: "BVN request approved and completed",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    User & Role Management Handlers
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: users.length, data: users, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSupervisors = async (req, res) => {
  try {
    const supervisors = await User.find({ role: "supervisor" })
      .select("-password")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: supervisors.length, data: supervisors });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: "agent" })
      .select("-password")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: agents.length, data: agents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { userId, role, newRole } = req.body;
    const finalRole = (role || newRole || "").toLowerCase().trim();

    if (!userId || !finalRole) {
      return res.status(400).json({
        success: false,
        message: "User ID and new role are required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: finalRole },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_USER_ROLE_CHANGED",
      details: `Role changed to ${finalRole}`,
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `User role changed to ${finalRole}`,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const suspendUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.status = user.status === "suspended" ? "active" : "suspended";
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User status updated to ${user.status}`,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const toggleWalletStatus = async (req, res) => {
  try {
    const { userId, status } = req.body;
    if (!userId || !status) {
      return res.status(400).json({
        success: false,
        message: "User ID and status are required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { walletStatus: status },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: `Wallet status changed to ${status}`,
      user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const debitUser = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    const debitAmount = Number(amount);

    if (!userId || !debitAmount || debitAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "User ID and positive debit amount are required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const currentBalance = Number(user.walletBalance || user.balance || 0);
    if (currentBalance < debitAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient user wallet balance",
      });
    }

    user.walletBalance = currentBalance - debitAmount;
    if (!user.transactions) user.transactions = [];

    user.transactions.unshift({
      transactionId: `DEBIT_${Date.now()}`,
      type: "debit",
      amount: debitAmount,
      status: "success",
      description: `Admin Debit: ${reason || "Administrative correction"}`,
      date: new Date(),
    });

    await user.save();

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ADMIN_DEBIT",
      details: `Debited ₦${debitAmount}. Reason: ${reason || "N/A"}`,
      targetUser: user._id,
    }).catch(() => null);

    await sendNotification(
      user._id,
      "Wallet Debit Notice",
      `₦${debitAmount.toLocaleString()} has been debited from your wallet. Reason: ${reason || "Adjustment"}`,
    );

    return res.status(200).json({
      success: true,
      message: `₦${debitAmount.toLocaleString()} debited successfully`,
      newBalance: user.walletBalance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Transaction Tracking
 */
const trackTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;

    let transaction = await Transaction.findOne({
      $or: [{ reference: transactionId }, { _id: mongoose.Types.ObjectId.isValid(transactionId) ? transactionId : null }],
    }).populate("user", "name firstName surname phone email");

    if (transaction) {
      return res.status(200).json({
        success: true,
        userData: transaction.user,
        transaction,
      });
    }

    const userWithTx = await User.findOne({
      "transactions.transactionId": transactionId,
    });

    if (!userWithTx) {
      return res.status(404).json({
        success: false,
        message: "Transaction identifier could not be resolved",
      });
    }

    const nestedTx = userWithTx.transactions.find((t) => t.transactionId === transactionId);

    return res.status(200).json({
      success: true,
      userData: {
        id: userWithTx._id,
        name: userWithTx.name || `${userWithTx.firstName || ""} ${userWithTx.surname || ""}`.trim(),
        phone: userWithTx.phone,
        email: userWithTx.email,
      },
      transaction: nestedTx,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Support Issue Management Handlers
 */
const requestAdminFix = async (req, res) => {
  try {
    const { transactionId, userId, reason, supportNote } = req.body;

    const newRequest = await SupportRequest.create({
      transactionId,
      userId,
      requestedBy: req.user?._id,
      reason,
      supportNote,
    });

    return res.status(201).json({
      success: true,
      message: "Support ticket generated successfully",
      data: newRequest,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSupportRequests = async (req, res) => {
  try {
    const requests = await SupportRequest.find()
      .populate("userId", "name firstName surname phone email")
      .populate("requestedBy", "name firstName surname email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
      data: requests,
      reports: requests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const handleSupportRequest = async (req, res) => {
  try {
    const { requestId, action, adminNote } = req.body;
    const request = await SupportRequest.findById(requestId).populate("userId");

    if (!request) {
      return res.status(404).json({ success: false, message: "Support ticket not found" });
    }

    const user = request.userId;

    if (action === "resolve" && user) {
      const tx = (user.transactions || []).find((t) => t.transactionId === request.transactionId);
      if (tx && tx.status !== "refunded") {
        user.walletBalance = Number(user.walletBalance || user.balance || 0) + Number(tx.amount || 0);
        tx.status = "refunded";
        request.status = "resolved";

        await sendNotification(
          user._id,
          "Transaction Resolved & Refunded",
          `Your ticket for ₦${tx.amount} has been resolved and refunded.`,
        );

        await user.save();
      } else {
        request.status = "resolved";
      }
    } else if (action === "reject") {
      request.status = "rejected";
      if (user) {
        await sendNotification(
          user._id,
          "Support Ticket Declined",
          `Your ticket was declined. Note: ${adminNote || "Closed by admin"}`,
        );
      }
    }

    await request.save();

    return res.status(200).json({
      success: true,
      message: `Support ticket status updated to '${action}'`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSupportActivities = async (req, res) => {
  try {
    const activities = await Activity.find()
      .populate("staffId", "surname firstName email role")
      .populate("targetUser", "surname firstName phone email")
      .sort({ createdAt: -1 })
      .limit(1000);

    return res.status(200).json({ success: true, count: activities.length, data: activities });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getPendingRefunds = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending-refund" })
      .populate("user", "surname firstName phone email")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  assignTarget,
  getAllNIMCRequests,
  updateToProcessing,
  approveRequest,
  getAllBVNRequests,
  updateBVNStatus,
  approveBVNRequest,
  getSupervisors,
  getAgents,
  approveRefund,
  getAllUsers,
  updateUserRole,
  suspendUser,
  getSupportActivities,
  getPendingRefunds,
  toggleWalletStatus,
  debitUser,
  trackTransaction,
  requestAdminFix,
  getSupportRequests,
  handleSupportRequest,
  // Sabbin Ayyuka da aka kara:
  broadcastNotification,
  getDashboardStats,
  getSalesStats,
  processDirectRefund,
  getAllTransactions,
};