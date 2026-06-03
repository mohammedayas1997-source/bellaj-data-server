const axios = require("axios");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const NIMCRequest = require("../models/NIMCRequest");
const NIMCPrice = require("../models/NIMCPrice");

const APP_NAME = "Bellaj Data Hub";
const NIMC_PROVIDER_BASE_URL =
  process.env.NIMC_PROVIDER_BASE_URL || "https://api.yourprovider.com/v1";

/**
 * @desc    User submits a new NIMC request
 * @route   POST /api/v1/nimc/submit
 * @access  Private/User
 */
exports.submitNIMCRequest = async (req, res) => {
  try {
    const { type, nin, pin, details } = req.body;

    if (!type || !nin || !pin) {
      return res.status(400).json({
        success: false,
        message: "Service type, NIN, and transaction PIN are required.",
      });
    }

    if (String(nin).length !== 11) {
      return res.status(400).json({
        success: false,
        message: "NIN must be 11 digits.",
      });
    }

    const user = await User.findById(req.user.id).select("+pin +walletBalance");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    const pricing = await NIMCPrice.findOne({
      serviceType: type,
    });

    if (!pricing) {
      return res.status(400).json({
        success: false,
        message: "This NIMC service price is not currently configured.",
      });
    }

    const amountToCharge = Number(pricing.amount || 0);

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

    if (Number(user.walletBalance || 0) < amountToCharge) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance.",
      });
    }

    user.walletBalance = Number(user.walletBalance || 0) - amountToCharge;
    await user.save();

    const transaction = await Transaction.create({
      user: user._id,
      amount: amountToCharge,
      type: "nimc_service",
      description: `${APP_NAME} payment for ${type}`,
      status: "success",
      reference: `BELLAJ_NIMC_${Date.now()}`,
    });

    const request = await NIMCRequest.create({
      user: user._id,
      serviceType: type,
      ninNumber: nin,
      formData: details || {},
      amount: amountToCharge,
      status: "pending",
      transaction: transaction._id,
    });

    return res.status(201).json({
      success: true,
      message: "NIMC request submitted successfully.",
      data: request,
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    console.error("Bellaj NIMC Submit Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Admin fetches all NIMC requests
 * @route   GET /api/v1/nimc/admin/all
 * @access  Private/Admin
 */
exports.getAllNIMCRequests = async (req, res) => {
  try {
    const requests = await NIMCRequest.find()
      .populate("user", "surname firstName phone email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "NIMC requests loaded successfully.",
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Bellaj NIMC Admin Fetch Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Admin marks request as processing
 * @route   PATCH /api/v1/nimc/processing/:id
 * @access  Private/Admin
 */
exports.updateToProcessing = async (req, res) => {
  try {
    const request = await NIMCRequest.findByIdAndUpdate(
      req.params.id,
      {
        status: "processing",
      },
      {
        new: true,
      },
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "NIMC request not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "NIMC request status updated to processing.",
      data: request,
    });
  } catch (error) {
    console.error("Bellaj NIMC Processing Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Admin approves and completes request
 * @route   PATCH /api/v1/nimc/approve/:id
 * @access  Private/Admin
 */
exports.approveRequest = async (req, res) => {
  try {
    const request = await NIMCRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "NIMC request not found.",
      });
    }

    request.status = "completed";
    request.resolvedAt = Date.now();

    if (req.body.adminNote) {
      request.adminNote = req.body.adminNote;
    }

    await request.save();

    return res.status(200).json({
      success: true,
      message: "NIMC request marked as completed successfully.",
      data: request,
    });
  } catch (error) {
    console.error("Bellaj NIMC Approval Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    User fetches their own NIMC history
 * @route   GET /api/v1/nimc/my-requests
 * @access  Private/User
 */
exports.getMyNIMCRequests = async (req, res) => {
  try {
    const requests = await NIMCRequest.find({
      user: req.user.id,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      message: "NIMC request history loaded successfully.",
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Bellaj NIMC History Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Verify NIMC using provider API
 * @route   POST /api/v1/nimc/verify
 * @access  Private/User
 */
exports.verifyNIMC = async (req, res) => {
  try {
    const { searchValue, searchType } = req.body;

    if (!searchValue) {
      return res.status(400).json({
        success: false,
        message: "Search value is required.",
      });
    }

    const apiKey = process.env.NIMC_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "NIMC provider API key is not configured.",
      });
    }

    let endpoint = "";
    let payload = {};

    switch (searchType) {
      case "phone":
        endpoint = `${NIMC_PROVIDER_BASE_URL}/nimc-phone`;
        payload = { phone: searchValue };
        break;

      case "trackingId":
        endpoint = `${NIMC_PROVIDER_BASE_URL}/nimc-tracking`;
        payload = { trackingId: searchValue };
        break;

      case "face":
        endpoint = `${NIMC_PROVIDER_BASE_URL}/nimc-face`;
        payload = { image: searchValue };
        break;

      case "nin":
      default:
        endpoint = `${NIMC_PROVIDER_BASE_URL}/nimc-nin`;
        payload = { nin: searchValue };
        break;
    }

    const response = await axios.post(endpoint, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    if (response.data?.success) {
      const citizen = response.data.data;

      return res.status(200).json({
        success: true,
        message: "NIMC verification successful.",
        data: {
          fullName: `${citizen.firstName || ""} ${
            citizen.surname || ""
          }`.trim(),
          photo: citizen.photo || citizen.image,
          nin: citizen.nin,
          phone: citizen.phone,
          gender: citizen.gender,
          dob: citizen.dob,
          trackingId: citizen.trackingId,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: response.data?.message || "No NIMC record found.",
    });
  } catch (error) {
    console.error("Bellaj NIMC Verification Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "NIMC verification failed.",
    });
  }
};
