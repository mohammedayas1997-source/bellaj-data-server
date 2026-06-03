const User = require("../models/User");
const Transaction = require("../models/Transaction");
const axios = require("axios");
const DataPlan = require("../models/DataPlan");
const Sale = require("../models/Sale");

const APP_NAME = "Bellaj Data Hub";

const generateRequestId = (prefix) =>
  `BELLAJ_${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const isProviderSuccess = (status) =>
  ["ORDER_RECEIVED", "ORDER_COMPLETED", "SUCCESS"].includes(status);

/**
 * @desc    Purchase Mobile Data with Agent Target Tracking
 */
exports.buyData = async (req, res) => {
  try {
    const { network, planId, phoneNumber } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!network || !planId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Network, plan ID, and phone number are required.",
      });
    }

    const [user, plan] = await Promise.all([
      User.findById(userId),
      DataPlan.findOne({
        networkId: String(network),
        planCode: String(planId),
        isActive: true,
      }),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Invalid or inactive data plan selected.",
      });
    }

    const finalPrice =
      user.role === "agent" ? Number(plan.agentPrice) : Number(plan.userPrice);

    if (Number(user.walletBalance || 0) < finalPrice) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance.",
      });
    }

    const requestId = generateRequestId("DATA");

    const transaction = await Transaction.create({
      user: user._id,
      type: "data",
      category: "data",
      amount: finalPrice,
      phoneNumber,
      status: "pending",
      reference: requestId,
      details: {
        network,
        planId,
        planLabel: plan.planLabel,
        recipient: phoneNumber,
      },
    });

    const response = await axios.get(
      `${process.env.CLUBKONNECT_BASE_URL}/Data.asp`,
      {
        params: {
          UserID: process.env.CLUBKONNECT_USERID,
          APIKey: process.env.CLUBKONNECT_APIKEY,
          MobileNetwork: network,
          DataPlan: planId,
          MobileNumber: phoneNumber,
          RequestID: requestId,
        },
        timeout: 30000,
      },
    );

    if (isProviderSuccess(response.data?.status)) {
      await User.findByIdAndUpdate(userId, {
        $inc: { walletBalance: -finalPrice },
      });

      transaction.status = "success";
      transaction.reference =
        response.data?.order_id || response.data?.orderid || requestId;
      transaction.providerResponse = response.data;
      await transaction.save();

      if (user.role === "agent" && user.assignedSupervisor) {
        await Sale.create({
          agentId: user._id,
          supervisorId: user.assignedSupervisor,
          dataAmountGB: Number(plan.sizeGB) || 0,
          planName: plan.planLabel,
          amount: finalPrice,
        });
      }

      return res.status(200).json({
        success: true,
        message: `Successfully sent ${plan.planLabel} to ${phoneNumber}.`,
        reference: transaction.reference,
      });
    }

    transaction.status = "failed";
    transaction.providerResponse = response.data;
    await transaction.save();

    return res.status(400).json({
      success: false,
      message:
        response.data?.remarks ||
        response.data?.remark ||
        "The network provider is currently unavailable.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal data transaction error.",
      error: error.message,
    });
  }
};

/**
 * @desc    Purchase Mobile Airtime
 */
exports.buyAirtime = async (req, res) => {
  try {
    const { network, phoneNumber, amount } = req.body;
    const userId = req.user?._id || req.user?.id;
    const amountNum = Number(amount);

    if (!network || !phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        message: "Network, phone number, and amount are required.",
      });
    }

    if (Number.isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number.",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (Number(user.walletBalance || 0) < amountNum) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance.",
      });
    }

    const requestId = generateRequestId("AIRTIME");

    const transaction = await Transaction.create({
      user: userId,
      type: "airtime",
      category: "vtu",
      amount: amountNum,
      phoneNumber,
      status: "pending",
      reference: requestId,
      details: {
        network,
        recipient: phoneNumber,
      },
    });

    const response = await axios.get(
      `${process.env.CLUBKONNECT_BASE_URL}/Airtime.asp`,
      {
        params: {
          UserID: process.env.CLUBKONNECT_USERID,
          APIKey: process.env.CLUBKONNECT_APIKEY,
          MobileNetwork: network,
          Amount: amountNum,
          MobileNumber: phoneNumber,
          RequestID: requestId,
        },
        timeout: 30000,
      },
    );

    if (isProviderSuccess(response.data?.status)) {
      await User.findByIdAndUpdate(userId, {
        $inc: { walletBalance: -amountNum },
      });

      transaction.status = "success";
      transaction.reference =
        response.data?.order_id || response.data?.orderid || requestId;
      transaction.providerResponse = response.data;
      await transaction.save();

      return res.status(200).json({
        success: true,
        message: "Airtime purchase successful.",
        reference: transaction.reference,
      });
    }

    transaction.status = "failed";
    transaction.providerResponse = response.data;
    await transaction.save();

    return res.status(400).json({
      success: false,
      message:
        response.data?.remarks ||
        response.data?.remark ||
        "Airtime provider error.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Airtime processing error.",
      error: error.message,
    });
  }
};

/**
 * @desc    NIMC Identity Validation
 */
exports.nimcValidation = async (req, res) => {
  try {
    const { nin } = req.body;
    const cost = 1000;
    const user = await User.findById(req.user?._id || req.user?.id);

    if (!nin || String(nin).length !== 11) {
      return res.status(400).json({
        success: false,
        message: "A valid 11-digit NIN is required.",
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (Number(user.walletBalance || 0) < cost) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance. ₦1,000 is required.",
      });
    }

    const response = await axios.post(
      process.env.NIMC_API_ENDPOINT,
      { api_key: process.env.NIMC_API_KEY, nin },
      { timeout: 40000 },
    );

    if (response.data?.status === "success") {
      await User.findByIdAndUpdate(user._id, {
        $inc: { walletBalance: -cost },
      });

      await Transaction.create({
        user: user._id,
        type: "nimc_validation",
        category: "nimc",
        amount: cost,
        status: "success",
        reference: generateRequestId("NIMC"),
        details: { nin },
      });

      return res.status(200).json({
        success: true,
        message: "NIMC verification successful.",
        data: response.data.slip_details,
      });
    }

    return res.status(400).json({
      success: false,
      message: "NIMC verification failed.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "NIMC service error.",
      error: error.message,
    });
  }
};

/**
 * @desc    Get Transaction History
 */
exports.getTransactionHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      user: req.user?._id || req.user?.id,
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not fetch transaction history.",
      error: error.message,
    });
  }
};

exports.verifyMeter = async (req, res) => {
  return res.status(501).json({
    success: false,
    message: "Electricity verification is not configured in this controller.",
  });
};

exports.purchaseElectricity = async (req, res) => {
  return res.status(501).json({
    success: false,
    message: "Electricity purchase is not configured in this controller.",
  });
};

exports.verifySmartCard = async (req, res) => {
  return res.status(501).json({
    success: false,
    message: "Cable verification is not configured in this controller.",
  });
};

exports.purchaseCable = async (req, res) => {
  return res.status(501).json({
    success: false,
    message: "Cable purchase is not configured in this controller.",
  });
};

exports.getTransactionStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    const transaction = await Transaction.findOne({ reference });

    return res.status(200).json({
      success: true,
      status: transaction?.status || "processing",
      reference,
      data: transaction || null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
