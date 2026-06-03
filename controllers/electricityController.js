const axios = require("axios");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Verify Meter Number
 * @route   POST /api/v1/electricity/verify-meter
 * @access  Private
 */
exports.verifyMeter = async (req, res) => {
  try {
    const { electricCompany, meterNo, meterType } = req.body;

    if (!electricCompany || !meterNo || !meterType) {
      return res.status(400).json({
        success: false,
        message: "Electric company, meter number and meter type are required",
      });
    }

    if (!process.env.CLUBKONNECT_USERID || !process.env.CLUBKONNECT_APIKEY) {
      return res.status(500).json({
        success: false,
        message: "Electricity provider credentials are not configured",
      });
    }

    const url = `https://www.nellobytesystems.com/APIVerifyElectricityV1.asp?UserID=${process.env.CLUBKONNECT_USERID}&APIKey=${process.env.CLUBKONNECT_APIKEY}&ElectricCompany=${electricCompany}&MeterNo=${meterNo}&MeterType=${meterType}`;

    const response = await axios.get(url, {
      timeout: 15000,
    });

    if (response.data && response.data.name) {
      return res.status(200).json({
        success: true,
        message: "Meter verified successfully",
        customerName: response.data.name,
        data: response.data,
      });
    }

    return res.status(400).json({
      success: false,
      message:
        response.data?.remark || "Invalid meter number, company or meter type",
      data: response.data,
    });
  } catch (error) {
    console.error("Bellaj Meter Verification Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Meter verification service is currently unavailable",
    });
  }
};

/**
 * @desc    Process Electricity Payment
 * @route   POST /api/v1/electricity/buy
 * @access  Private
 */
exports.buyElectricity = async (req, res) => {
  try {
    const { electricCompany, meterNo, meterType, amount, phoneNo } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized request",
      });
    }

    if (!electricCompany || !meterNo || !meterType || !amount || !phoneNo) {
      return res.status(400).json({
        success: false,
        message:
          "Electric company, meter number, meter type, amount and phone number are required",
      });
    }

    if (!process.env.CLUBKONNECT_USERID || !process.env.CLUBKONNECT_APIKEY) {
      return res.status(500).json({
        success: false,
        message: "Electricity provider credentials are not configured",
      });
    }

    const amountNum = Number(amount);

    if (Number.isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found",
      });
    }

    const walletBalance = Number(user.walletBalance || 0);

    if (walletBalance < amountNum) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    const requestId = `BELLAJ_ELEC_${Date.now()}_${Math.floor(
      Math.random() * 1000,
    )}`;

    const url = `https://www.nellobytesystems.com/APIElectricityV1.asp?UserID=${process.env.CLUBKONNECT_USERID}&APIKey=${process.env.CLUBKONNECT_APIKEY}&ElectricCompany=${electricCompany}&MeterType=${meterType}&MeterNo=${meterNo}&Amount=${amountNum}&PhoneNo=${phoneNo}&RequestID=${requestId}`;

    const response = await axios.get(url, {
      timeout: 30000,
    });

    const providerStatus = response.data?.status;

    if (
      providerStatus === "ORDER_RECEIVED" ||
      providerStatus === "ORDER_COMPLETED"
    ) {
      user.walletBalance = walletBalance - amountNum;
      await user.save();

      const transaction = await Transaction.create({
        user: userId,
        type: "electricity",
        amount: amountNum,
        status: "success",
        reference: response.data?.orderid || requestId,
        details: `Bellaj electricity payment for ${meterNo} (${electricCompany})`,
        provider: "Nellobyte",
        providerResponse: response.data,
      });

      return res.status(200).json({
        success: true,
        message: "Electricity payment successful",
        orderId: response.data?.orderid || requestId,
        token: response.data?.metertoken || "Pending",
        walletBalance: user.walletBalance,
        transaction,
      });
    }

    await Transaction.create({
      user: userId,
      type: "electricity",
      amount: amountNum,
      status: "failed",
      reference: requestId,
      details: `Failed Bellaj electricity payment for ${meterNo} (${electricCompany})`,
      provider: "Nellobyte",
      providerResponse: response.data,
    });

    return res.status(400).json({
      success: false,
      message:
        response.data?.remark || "Electricity transaction failed from provider",
      data: response.data,
    });
  } catch (error) {
    console.error("Bellaj Electricity Payment Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Electricity payment processing error",
      error: error.message,
    });
  }
};
