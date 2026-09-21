const User = require("../models/User");
const Transaction = require("../models/Transaction");
const axios = require("axios");
const DataPlan = require("../models/DataPlan");
const Sale = require("../models/Sale");
const bcrypt = require("bcryptjs");

const APP_NAME = "Bellaj Data Hub";

const generateRequestId = (prefix) =>
  `BLJ_${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const isProviderSuccess = (status) =>
  ["ORDER_RECEIVED", "ORDER_COMPLETED", "SUCCESS", "200"].includes(
    String(status || "").toUpperCase()
  );

// Helper: Fassara Network ID zuwa sunan Network da Code na Gateway
const resolveNetwork = (networkInput) => {
  const input = String(networkInput || "").toUpperCase().trim();

  if (input === "1" || input === "01" || input.includes("MTN")) {
    return { id: "1", code: "01", name: "MTN", clubkonnectId: "01" };
  }
  if (input === "2" || input === "02" || input.includes("GLO")) {
    return { id: "2", code: "02", name: "GLO", clubkonnectId: "02" };
  }
  if (input === "3" || input === "03" || input.includes("9MOBILE") || input.includes("ETISALAT")) {
    return { id: "3", code: "03", name: "9MOBILE", clubkonnectId: "03" };
  }
  if (input === "4" || input === "04" || input.includes("AIRTEL")) {
    return { id: "4", code: "04", name: "AIRTEL", clubkonnectId: "04" };
  }

  return { id: "1", code: "01", name: input || "MTN", clubkonnectId: "01" };
};

/**
 * @desc    Purchase Mobile Data (Bisa Tsarin Network ID & Plan ID)
 * @route   POST /api/v1/data/buy
 */
exports.buyData = async (req, res) => {
  try {
    const {
      network,
      networkId,
      planId,
      plan_id,
      phoneNumber,
      phone,
      transactionPin,
      pin,
    } = req.body;

    const userId = req.user?._id || req.user?.id;
    const recipientPhone = String(phoneNumber || phone || "").trim().replace(/\s+/g, "");
    const requestedPlanId = String(planId || plan_id || "").trim();
    const resolvedNet = resolveNetwork(networkId || network);
    const providedPin = String(transactionPin || pin || "").trim();

    if (!recipientPhone || !requestedPlanId) {
      return res.status(400).json({
        success: false,
        message: "Network ID, Plan ID, and recipient phone number are required.",
      });
    }

    // 1. Dauko User tare da PIN dinsa
    const user = await User.findById(userId).select("+pin +password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    // 2. Duba Transaction PIN
    if (providedPin) {
      const isPinMatch = await user.matchPin(providedPin);
      if (!isPinMatch) {
        return res.status(400).json({
          success: false,
          message: "Incorrect 4-digit transaction PIN.",
        });
      }
    }

    // 3. Nemi Plan ta Network ID da Plan ID
    let plan = await DataPlan.findOne({
      $and: [
        {
          $or: [
            { networkId: resolvedNet.id },
            { networkId: resolvedNet.code },
            { network: resolvedNet.name },
            { networkName: resolvedNet.name },
          ],
        },
        {
          $or: [
            { planId: requestedPlanId },
            { planCode: requestedPlanId },
          ],
        },
        { isActive: true },
      ],
    });

    // Idan ba a samu ba a DB, duba ko akwai shi a planId kai tsaye
    if (!plan) {
      plan = await DataPlan.findOne({
        $or: [{ planId: requestedPlanId }, { planCode: requestedPlanId }],
        isActive: true,
      });
    }

    // Farashin karshe (User Price ko Agent Wholesale Price)
    let finalPrice = 0;
    let planLabel = `${resolvedNet.name} Data`;
    let planSizeGB = 1;

    if (plan) {
      finalPrice =
        user.role === "agent"
          ? Number(plan.agentPrice || plan.retailPrice || plan.userPrice || 0)
          : Number(plan.customerPrice || plan.userPrice || plan.price || 0);
      planLabel = plan.planLabel || plan.name || `${resolvedNet.name} ${plan.volume || "Data"}`;
      planSizeGB = Number(plan.sizeGB) || 1;
    } else {
      // Fallback idan ba a sanya plan din a DB ba amma an tura ainihin adadin
      finalPrice = Number(req.body.amount || 0);
      if (!finalPrice || finalPrice <= 0) {
        return res.status(404).json({
          success: false,
          message: `Data plan with ID (${requestedPlanId}) for network ${resolvedNet.name} is currently unavailable.`,
        });
      }
    }

    // 4. Duba Balance na Wallet
    const currentBalance = Number(user.walletBalance || user.balance || 0);
    if (currentBalance < finalPrice) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Required: ₦${finalPrice.toLocaleString()}, Available: ₦${currentBalance.toLocaleString()}.`,
      });
    }

    const requestId = generateRequestId("DATA");

    // 5. Kirkiri Transaction a Database
    const transaction = await Transaction.create({
      user: user._id,
      type: "data",
      category: "data",
      service: "DATA_TOPUP",
      amount: finalPrice,
      phoneNumber: recipientPhone,
      status: "pending",
      reference: requestId,
      narration: `Data Top-up: ${planLabel} to ${recipientPhone}`,
      details: {
        networkId: resolvedNet.id,
        networkCode: resolvedNet.code,
        networkName: resolvedNet.name,
        planId: requestedPlanId,
        planLabel,
        recipient: recipientPhone,
        previousBalance: currentBalance,
        newBalance: currentBalance - finalPrice,
      },
    });

    // 6. Kira Gateway API (Clubkonnect ko Al-Ihsan)
    let isSuccess = false;
    let providerData = null;

    if (process.env.CLUBKONNECT_BASE_URL && process.env.CLUBKONNECT_USERID) {
      try {
        const response = await axios.get(
          `${process.env.CLUBKONNECT_BASE_URL}/Data.asp`,
          {
            params: {
              UserID: process.env.CLUBKONNECT_USERID,
              APIKey: process.env.CLUBKONNECT_APIKEY,
              MobileNetwork: resolvedNet.clubkonnectId,
              DataPlan: requestedPlanId,
              MobileNumber: recipientPhone,
              RequestID: requestId,
            },
            timeout: 35000,
          }
        );
        providerData = response.data;
        isSuccess = isProviderSuccess(response.data?.status);
      } catch (err) {
        providerData = { error: err.message };
      }
    } else {
      // Sandbox / Test Simulator idan ba a saita gateway ba a environment
      isSuccess = true;
      providerData = { status: "ORDER_COMPLETED", order_id: `SIM_${Date.now()}` };
    }

    // 7. Cire Kudi da Ajiye Record idan ya yi nasara
    if (isSuccess) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: -finalPrice } },
        { new: true }
      );

      transaction.status = "success";
      transaction.reference =
        providerData?.order_id || providerData?.orderid || requestId;
      transaction.providerResponse = providerData;
      await transaction.save();

      // Idan Agent ne, adana aikin a Sale record don Supervisor Target Tracking
      if (user.role === "agent" && user.assignedSupervisor && Sale) {
        await Sale.create({
          agentId: user._id,
          supervisorId: user.assignedSupervisor,
          dataAmountGB: planSizeGB,
          planName: planLabel,
          amount: finalPrice,
        }).catch(() => null);
      }

      return res.status(200).json({
        success: true,
        message: `Successfully dispatched ${planLabel} to ${recipientPhone}.`,
        reference: transaction.reference,
        newBalance: updatedUser.walletBalance,
      });
    }

    // Idan Provider ya ba da matsala
    transaction.status = "failed";
    transaction.providerResponse = providerData;
    await transaction.save();

    return res.status(400).json({
      success: false,
      message:
        providerData?.remarks ||
        providerData?.remark ||
        "The telecom data provider is temporarily unable to complete this order.",
    });
  } catch (error) {
    console.error("Data purchase execution error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal data transaction error.",
      error: error.message,
    });
  }
};

/**
 * @desc    Purchase Mobile Airtime (Bisa Tsarin Network ID)
 * @route   POST /api/v1/airtime/buy
 */
exports.buyAirtime = async (req, res) => {
  try {
    const {
      network,
      networkId,
      phoneNumber,
      phone,
      amount,
      transactionPin,
      pin,
    } = req.body;

    const userId = req.user?._id || req.user?.id;
    const recipientPhone = String(phoneNumber || phone || "").trim().replace(/\s+/g, "");
    const amountNum = Number(amount);
    const resolvedNet = resolveNetwork(networkId || network);
    const providedPin = String(transactionPin || pin || "").trim();

    if (!recipientPhone || !amountNum) {
      return res.status(400).json({
        success: false,
        message: "Network ID, phone number, and recharge amount are required.",
      });
    }

    if (Number.isNaN(amountNum) || amountNum < 50) {
      return res.status(400).json({
        success: false,
        message: "Minimum airtime recharge amount is ₦50.",
      });
    }

    // 1. Dauko User tare da PIN
    const user = await User.findById(userId).select("+pin +password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    // 2. Tabbatar da PIN
    if (providedPin) {
      const isPinMatch = await user.matchPin(providedPin);
      if (!isPinMatch) {
        return res.status(400).json({
          success: false,
          message: "Incorrect 4-digit transaction PIN.",
        });
      }
    }

    // 3. Duba Wallet Balance
    const currentBalance = Number(user.walletBalance || user.balance || 0);
    if (currentBalance < amountNum) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Required: ₦${amountNum.toLocaleString()}, Available: ₦${currentBalance.toLocaleString()}.`,
      });
    }

    const requestId = generateRequestId("AIRTIME");

    // 4. Kirkiri Transaction
    const transaction = await Transaction.create({
      user: userId,
      type: "airtime",
      category: "vtu",
      service: "AIRTIME_RECHARGE",
      amount: amountNum,
      phoneNumber: recipientPhone,
      status: "pending",
      reference: requestId,
      narration: `${resolvedNet.name} ₦${amountNum} Airtime to ${recipientPhone}`,
      details: {
        networkId: resolvedNet.id,
        networkCode: resolvedNet.code,
        networkName: resolvedNet.name,
        recipient: recipientPhone,
        previousBalance: currentBalance,
        newBalance: currentBalance - amountNum,
      },
    });

    // 5. Tura wa Clubkonnect / Telecom Gateway
    let isSuccess = false;
    let providerData = null;

    if (process.env.CLUBKONNECT_BASE_URL && process.env.CLUBKONNECT_USERID) {
      try {
        const response = await axios.get(
          `${process.env.CLUBKONNECT_BASE_URL}/Airtime.asp`,
          {
            params: {
              UserID: process.env.CLUBKONNECT_USERID,
              APIKey: process.env.CLUBKONNECT_APIKEY,
              MobileNetwork: resolvedNet.clubkonnectId,
              Amount: amountNum,
              MobileNumber: recipientPhone,
              RequestID: requestId,
            },
            timeout: 35000,
          }
        );
        providerData = response.data;
        isSuccess = isProviderSuccess(response.data?.status);
      } catch (err) {
        providerData = { error: err.message };
      }
    } else {
      isSuccess = true;
      providerData = { status: "ORDER_COMPLETED", order_id: `SIM_${Date.now()}` };
    }

    if (isSuccess) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: -amountNum } },
        { new: true }
      );

      transaction.status = "success";
      transaction.reference =
        providerData?.order_id || providerData?.orderid || requestId;
      transaction.providerResponse = providerData;
      await transaction.save();

      return res.status(200).json({
        success: true,
        message: `₦${amountNum.toLocaleString()} ${resolvedNet.name} airtime dispatched to ${recipientPhone}.`,
        reference: transaction.reference,
        newBalance: updatedUser.walletBalance,
      });
    }

    transaction.status = "failed";
    transaction.providerResponse = providerData;
    await transaction.save();

    return res.status(400).json({
      success: false,
      message:
        providerData?.remarks ||
        providerData?.remark ||
        "The airtime recharge gateway is currently unresponsive.",
    });
  } catch (error) {
    console.error("Airtime recharge execution error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal airtime processing error.",
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
      { timeout: 40000 }
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
      .limit(50)
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