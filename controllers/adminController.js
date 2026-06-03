const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");
const NIMCRequest = require("../models/NIMCRequest");
const BVNRequest = require("../models/BVNRequest");
const SupportRequest = require("../models/SupportRequest");
const NIMCPrice = require("../models/NIMCPrice");
const BVNPrice = require("../models/BVNPrice");

const APP_NAME = "Bellaj Data Hub";

const sendNotification = async (userId, title, message) => {
  try {
    const user = await User.findById(userId);

    if (user) {
      if (!user.notifications) user.notifications = [];

      user.notifications.push({
        title,
        message,
        date: new Date(),
        isRead: false,
      });

      await user.save();
    }
  } catch (error) {
    console.error("Bellaj notification failed:", error);
  }
};

const assignTarget = async (req, res) => {
  try {
    const { supervisorId, agentGoal, dataGoal, month } = req.body;

    if (!supervisorId) {
      return res.status(400).json({
        success: false,
        message: "Supervisor ID is required",
      });
    }

    const supervisor = await User.findById(supervisorId);

    if (!supervisor || supervisor.role !== "supervisor") {
      return res.status(404).json({
        success: false,
        message: "Supervisor not found",
      });
    }

    const currentTargets = supervisor.targets || {};

    supervisor.targets = {
      agentGoal:
        agentGoal !== undefined
          ? Number(agentGoal)
          : currentTargets.agentGoal || 0,
      dataGoal:
        dataGoal !== undefined
          ? Number(dataGoal)
          : currentTargets.dataGoal || 0,
      currentMonth:
        month ||
        currentTargets.currentMonth ||
        new Date().toLocaleString("default", { month: "long" }),
    };

    supervisor.markModified("targets");
    await supervisor.save();

    res.status(200).json({
      success: true,
      message: "Bellaj supervisor target assigned successfully",
      data: supervisor.targets,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllNIMCRequests = async (req, res) => {
  try {
    const requests = await NIMCRequest.find()
      .populate("user", "surname firstName phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateToProcessing = async (req, res) => {
  try {
    const request = await NIMCRequest.findByIdAndUpdate(
      req.params.id,
      { status: "processing" },
      { new: true },
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "NIMC request not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Bellaj NIMC request moved to processing",
      data: request,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const approveRequest = async (req, res) => {
  try {
    const request = await NIMCRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "NIMC request not found",
      });
    }

    request.status = "completed";
    await request.save();

    await sendNotification(
      request.user,
      "NIMC Request Completed",
      `Your NIMC request has been completed successfully on ${APP_NAME}.`,
    );

    res.status(200).json({
      success: true,
      message: "Bellaj NIMC request approved successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllBVNRequests = async (req, res) => {
  try {
    const requests = await BVNRequest.find()
      .populate("user", "surname firstName phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateBVNStatus = async (req, res) => {
  try {
    const request = await BVNRequest.findByIdAndUpdate(
      req.params.id,
      { status: "processing" },
      { new: true },
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "BVN request not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Bellaj BVN request moved to processing",
      data: request,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const approveBVNRequest = async (req, res) => {
  try {
    const request = await BVNRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "BVN request not found",
      });
    }

    request.status = "completed";
    await request.save();

    await sendNotification(
      request.user,
      "BVN Request Completed",
      `Your BVN request has been completed successfully on ${APP_NAME}.`,
    );

    res.status(200).json({
      success: true,
      message: "Bellaj BVN request completed successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSupervisors = async (req, res) => {
  try {
    const supervisors = await User.find({ role: "supervisor" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: supervisors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: "agent" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: agents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const approveRefund = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction || transaction.status !== "pending-refund") {
      return res.status(400).json({
        success: false,
        message: "Invalid refund request",
      });
    }

    const userId = transaction.user || transaction.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.walletBalance =
      (user.walletBalance || 0) + Number(transaction.amount || 0);

    transaction.status = "refunded";
    transaction.approvedBy = req.user._id;
    transaction.resolvedAt = Date.now();

    await Promise.all([user.save(), transaction.save()]);

    await Activity.create({
      staffId: req.user._id,
      action: "BELLAJ_REFUND_APPROVED",
      details: `Refunded ₦${transaction.amount} via ${APP_NAME}`,
      targetUser: user._id,
    });

    await sendNotification(
      user._id,
      "Wallet Refunded",
      `Your transaction of ₦${transaction.amount} has been refunded by ${APP_NAME}.`,
    );

    res.status(200).json({
      success: true,
      message: "Bellaj refund processed successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { userId, role, newRole } = req.body;
    const finalRole = role || newRole;

    if (!userId || !finalRole) {
      return res.status(400).json({
        success: false,
        message: "User ID and role are required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: finalRole },
      { new: true, runValidators: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `User role updated to ${finalRole} successfully`,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const suspendUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.status = user.status === "suspended" ? "active" : "suspended";
    await user.save();

    res.status(200).json({
      success: true,
      message: `User status changed to ${user.status}`,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSupportActivities = async (req, res) => {
  try {
    const activities = await Activity.find()
      .populate("staffId", "surname firstName email")
      .populate("targetUser", "surname firstName phone")
      .sort({ createdAt: -1 })
      .limit(1000);

    res.status(200).json({ success: true, data: activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPendingRefunds = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending-refund" })
      .populate("user", "surname firstName phone")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const toggleWalletStatus = async (req, res) => {
  try {
    const { userId, status } = req.body;

    if (!userId || !status) {
      return res.status(400).json({
        success: false,
        message: "User ID and wallet status are required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { walletStatus: status },
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `Wallet ${status} successfully`,
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

const debitUser = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({
        success: false,
        message: "User ID and amount are required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentBalance = Number(user.walletBalance || user.balance || 0);
    const debitAmount = Number(amount);

    if (currentBalance < debitAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    user.walletBalance = currentBalance - debitAmount;

    if (!user.transactions) user.transactions = [];

    user.transactions.push({
      type: "debit",
      amount: debitAmount,
      status: "success",
      description: `Bellaj Admin Debit: ${reason || "Administrative debit"}`,
      date: new Date(),
    });

    await user.save();

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ADMIN_DEBIT",
      details: `Debited ₦${debitAmount} from user wallet. Reason: ${
        reason || "N/A"
      }`,
      targetUser: user._id,
    });

    await sendNotification(
      user._id,
      "Wallet Debit Notice",
      `₦${debitAmount} was debited from your ${APP_NAME} wallet.`,
    );

    res.status(200).json({
      success: true,
      message: `₦${debitAmount} debited successfully`,
      newBalance: user.walletBalance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

const trackTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const user = await User.findOne({
      "transactions.transactionId": transactionId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Transaction ID not found",
      });
    }

    const transaction = user.transactions.find(
      (t) => t.transactionId === transactionId,
    );

    res.status(200).json({
      success: true,
      userData: {
        id: user._id,
        name:
          user.name || `${user.firstName || ""} ${user.surname || ""}`.trim(),
        phone: user.phone,
      },
      transaction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const requestAdminFix = async (req, res) => {
  try {
    const { transactionId, userId, reason, supportNote } = req.body;

    const newRequest = await SupportRequest.create({
      transactionId,
      userId,
      requestedBy: req.user.id,
      reason,
      supportNote,
    });

    res.status(201).json({
      success: true,
      message: "Bellaj support issue reported successfully",
      data: newRequest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send report",
      error: error.message,
    });
  }
};

const getSupportRequests = async (req, res) => {
  try {
    const requests = await SupportRequest.find()
      .populate("userId", "name firstName surname phone")
      .populate("requestedBy", "name firstName surname")
      .sort("-createdAt");

    res.status(200).json({ success: true, requests });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching Bellaj support requests",
    });
  }
};

const handleSupportRequest = async (req, res) => {
  try {
    const { requestId, action, adminNote } = req.body;

    const request = await SupportRequest.findById(requestId).populate("userId");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Support request not found",
      });
    }

    if (action === "resolve") {
      const user = request.userId;

      const transaction = user.transactions.find(
        (t) => t.transactionId === request.transactionId,
      );

      if (transaction && transaction.status !== "refunded") {
        user.walletBalance =
          Number(user.walletBalance || user.balance || 0) +
          Number(transaction.amount || 0);

        transaction.status = "refunded";
        request.status = "resolved";

        await sendNotification(
          user._id,
          "Wallet Refunded",
          `Your transaction of ₦${transaction.amount} has been refunded by ${APP_NAME}.`,
        );

        await user.save();
      }
    } else if (action === "reject") {
      request.status = "rejected";

      await sendNotification(
        request.userId._id,
        "Support Request Update",
        `Your support request was declined. Note: ${adminNote || "N/A"}`,
      );
    }

    await request.save();

    res.status(200).json({
      success: true,
      message: `Support action '${action}' completed successfully.`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Process failed",
      error: error.message,
    });
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
};
