const BVNPrice = require("../models/BVNPrice");
const BVNRequest = require("../models/BVNRequest");
const User = require("../models/User");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Get all BVN service prices
 * @route   GET /api/v1/bvn/prices
 * @access  Private
 */
exports.getBVNPrices = async (req, res) => {
  try {
    const prices = await BVNPrice.find().sort({ serviceType: 1 });

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} BVN prices loaded successfully`,
      count: prices.length,
      data: prices,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching BVN prices: " + error.message,
    });
  }
};

/**
 * @desc    Set or Update BVN price Admin Only
 * @route   POST /api/v1/bvn/admin/set-price
 * @access  Private/Admin
 */
exports.setBVNPrice = async (req, res) => {
  try {
    const { serviceType, amount } = req.body;

    if (!serviceType || amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        message: "Please provide both serviceType and amount",
      });
    }

    const numericAmount = Number(amount);

    if (Number.isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number",
      });
    }

    const price = await BVNPrice.findOneAndUpdate(
      { serviceType },
      {
        serviceType,
        amount: numericAmount,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: `${serviceType
        .replace("_", " ")
        .toUpperCase()} price updated successfully on ${APP_NAME}`,
      data: price,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to set BVN price: " + error.message,
    });
  }
};

/**
 * @desc    Verify BVN Main Logic
 * @route   POST /api/v1/bvn/verify
 * @access  Private
 */
exports.verifyBVN = async (req, res) => {
  try {
    const { bvnNumber, serviceType, formData, pin } = req.body;

    if (!bvnNumber || !serviceType) {
      return res.status(400).json({
        success: false,
        message: "BVN number and serviceType are required",
      });
    }

    if (String(bvnNumber).length !== 11) {
      return res.status(400).json({
        success: false,
        message: "BVN number must be 11 digits",
      });
    }

    const price = await BVNPrice.findOne({ serviceType });

    if (!price) {
      return res.status(404).json({
        success: false,
        message: "BVN service price is not configured",
      });
    }

    const user = await User.findById(req.user.id || req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found",
      });
    }

    const serviceAmount = Number(price.amount || 0);
    const walletBalance = Number(user.walletBalance || 0);

    if (walletBalance < serviceAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    if (pin && user.pin && String(user.pin) !== String(pin)) {
      return res.status(401).json({
        success: false,
        message: "Invalid transaction PIN",
      });
    }

    user.walletBalance = walletBalance - serviceAmount;
    await user.save();

    const request = await BVNRequest.create({
      user: user._id,
      bvnNumber,
      serviceType,
      amount: serviceAmount,
      formData: formData || {},
      status: "processing",
    });

    return res.status(200).json({
      success: true,
      message: `BVN verification request submitted successfully on ${APP_NAME}`,
      data: request,
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Verification failed: " + error.message,
    });
  }
};
