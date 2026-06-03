const ValidationRequest = require("../models/ValidationRequest");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Submit Validation Request
 * @route   POST /api/v1/validation/submit
 * @access  Private
 */
exports.submitValidation = async (req, res) => {
  try {
    const { type, nin, pin, amount, userId, details } = req.body;

    if (!type || !nin || !amount || !userId || !pin) {
      return res.status(400).json({
        success: false,
        message: "Type, NIN, amount, transaction PIN and userId are required.",
      });
    }

    if (String(nin).length !== 11) {
      return res.status(400).json({
        success: false,
        message: "NIN must be exactly 11 digits.",
      });
    }

    const chargeAmount = Number(amount);

    if (Number.isNaN(chargeAmount) || chargeAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid validation amount.",
      });
    }

    const user = await User.findById(userId).select("+pin +walletBalance");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    const isPinValid =
      typeof user.matchPin === "function"
        ? await user.matchPin(pin)
        : String(user.pin) === String(pin);

    if (!isPinValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction PIN.",
      });
    }

    const currentBalance = Number(user.walletBalance || 0);

    if (currentBalance < chargeAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance.",
      });
    }

    // Debit wallet
    user.walletBalance = currentBalance - chargeAmount;
    await user.save();

    // Save transaction record
    const transaction = await Transaction.create({
      user: user._id,
      amount: chargeAmount,
      type: "nin_validation",
      status: "success",
      reference: `BELLAJ_VAL_${Date.now()}`,
      description: `${APP_NAME} validation payment for ${type}`,
    });

    // Save validation request
    const newRequest = await ValidationRequest.create({
      userId: user._id,
      type,
      nin,
      amount: chargeAmount,
      details: details || {},
      transactionId: transaction._id,
      status: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Validation request submitted successfully.",
      walletBalance: user.walletBalance,
      data: newRequest,
    });
  } catch (error) {
    console.error("Bellaj Validation Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get User Validation History
 * @route   GET /api/v1/validation/history
 * @access  Private
 */
exports.getMyValidationHistory = async (req, res) => {
  try {
    const requests = await ValidationRequest.find({
      userId: req.user.id,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Bellaj Validation History Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Admin Get All Validation Requests
 * @route   GET /api/v1/admin/validation/all
 * @access  Admin
 */
exports.getAllValidationRequests = async (req, res) => {
  try {
    const requests = await ValidationRequest.find()
      .populate("userId", "firstName surname phone email")
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Bellaj Validation Admin Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Update Validation Status
 * @route   PATCH /api/v1/admin/validation/:id
 * @access  Admin
 */
exports.updateValidationStatus = async (req, res) => {
  try {
    const { status, adminNote } = req.body;

    const request = await ValidationRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Validation request not found.",
      });
    }

    request.status = status || request.status;

    if (adminNote) {
      request.adminNote = adminNote;
    }

    if (status === "completed") {
      request.completedAt = new Date();
    }

    await request.save();

    return res.status(200).json({
      success: true,
      message: "Validation request updated successfully.",
      data: request,
    });
  } catch (error) {
    console.error("Bellaj Validation Update Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
