const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");
const BVNRequest = require("../models/BVNRequest");
const NIMCRequest = require("../models/NIMCRequest");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Search for a user by phone or email
 * @route   GET /api/v1/support/search-user/:identifier
 * @access  Support/Admin
 */
exports.searchUser = async (req, res) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Search identifier is required.",
      });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    const user = await User.findOne({
      $or: [{ phone: cleanIdentifier }, { email: cleanIdentifier }],
    }).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    const history = await Transaction.find({
      $or: [{ user: user._id }, { userId: user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} user profile loaded successfully.`,
      data: {
        profile: user,
        recentTransactions: history,
      },
    });
  } catch (error) {
    console.error("Bellaj User Search Error:", error);

    return res.status(500).json({
      success: false,
      message: "Search failed.",
      error: error.message,
    });
  }
};

/**
 * @desc    Get user transaction history
 * @route   GET /api/v1/support/user-history/:userId
 * @access  Support/Admin
 */
exports.getUserTransactionHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const transactions = await Transaction.find({
      $or: [{ user: userId }, { userId }],
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Transaction history loaded successfully.",
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error("Bellaj Transaction History Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching transaction history.",
      error: error.message,
    });
  }
};

/**
 * @desc    Initiate refund request
 * @route   POST /api/v1/support/request-refund
 * @access  Support/Admin
 */
exports.requestRefund = async (req, res) => {
  try {
    const { transactionId, reason } = req.body;

    if (!transactionId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Transaction ID and refund reason are required.",
      });
    }

    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found.",
      });
    }

    transaction.status = "pending-refund";
    transaction.refundReason = reason;
    transaction.requestedBy = req.user?._id;
    await transaction.save();

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_REFUND_REQUEST",
      details: `Refund requested for transaction: ${transactionId}. Reason: ${reason}`,
      targetUser: transaction.user || transaction.userId,
    });

    return res.status(200).json({
      success: true,
      message: "Refund request logged successfully.",
      data: transaction,
    });
  } catch (error) {
    console.error("Bellaj Refund Request Error:", error);

    return res.status(500).json({
      success: false,
      message: "Refund request failed.",
      error: error.message,
    });
  }
};

/**
 * @desc    Get refund status
 * @route   GET /api/v1/support/refund-status/:transactionId
 * @access  Support/Admin
 */
exports.getRefundStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await Transaction.findById(transactionId).select(
      "status refundReason createdAt resolvedAt approvedBy",
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Refund status loaded successfully.",
      data: transaction,
    });
  } catch (error) {
    console.error("Bellaj Refund Status Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Trace service request across BVN, NIMC, data, airtime, cable, and electricity
 * @route   GET /api/v1/support/trace/:type/:identifier
 * @access  Support/Admin
 */
exports.traceServiceRequest = async (req, res) => {
  try {
    const { type, identifier } = req.params;

    if (!type || !identifier) {
      return res.status(400).json({
        success: false,
        message: "Service type and identifier are required.",
      });
    }

    const serviceType = type.toLowerCase();
    const cleanIdentifier = identifier.trim();

    let result = [];

    if (serviceType === "bvn") {
      result = await BVNRequest.find({
        $or: [
          { bvnNumber: cleanIdentifier },
          { phoneNumber: cleanIdentifier },
          { transactionId: cleanIdentifier },
          { reference: cleanIdentifier },
        ],
      }).populate("user", "firstName surname email phone");
    } else if (serviceType === "nimc") {
      result = await NIMCRequest.find({
        $or: [
          { ninNumber: cleanIdentifier },
          { phoneNumber: cleanIdentifier },
          { transactionId: cleanIdentifier },
          { reference: cleanIdentifier },
        ],
      }).populate("user", "firstName surname email phone");
    } else if (
      ["data", "vtu", "airtime", "cable", "utility", "electricity"].includes(
        serviceType,
      )
    ) {
      result = await Transaction.find({
        $or: [{ type: serviceType }, { category: serviceType }],
        $and: [
          {
            $or: [
              { reference: cleanIdentifier },
              { "details.recipient": cleanIdentifier },
              { "details.smartCard": cleanIdentifier },
              { "details.phone": cleanIdentifier },
              { "details.meterNo": cleanIdentifier },
              { "metadata.recipient": cleanIdentifier },
              { "metadata.phone": cleanIdentifier },
              { "metadata.meterNo": cleanIdentifier },
            ],
          },
        ],
      }).populate("user", "firstName surname email phone");
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid service type.",
      });
    }

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No ${serviceType.toUpperCase()} records found for this identifier.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${serviceType.toUpperCase()} records traced successfully.`,
      service: serviceType.toUpperCase(),
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Bellaj Trace Service Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error tracing service request.",
      error: error.message,
    });
  }
};
