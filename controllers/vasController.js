const User = require("../models/User");
const Transaction = require("../models/Transaction");
let Sale;
try {
  Sale = require("../models/Sale");
} catch (e) {
  Sale = null;
}

const ayaxService = require("../services/ayaxService");

const APP_NAME = "Bellaj Data Hub";

/**
 * 1. Dauko Data Plans daga Ayax Marketplace
 * @route GET /api/v1/services/data-plans
 */
exports.getDataPlans = async (req, res) => {
  try {
    const plansData = await ayaxService.getAvailablePlans();

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} data plans loaded successfully`,
      data: plansData?.data || plansData || [],
    });
  } catch (error) {
    console.error("[Get Data Plans Error]:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: error?.response?.data?.message || "Could not fetch data plans from telecom gateway.",
    });
  }
};

/**
 * 2. Sayar da Bundle na Data
 * @route POST /api/v1/services/buy-data
 */
exports.buyData = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { network, phone, planId, costAmount, volumeGB, networkName } = req.body;

  const cost = Number(costAmount);

  if (!network || !phone || !planId || !cost || cost <= 0) {
    return res.status(400).json({
      success: false,
      message: "Network, valid phone number, plan ID, and cost are required.",
    });
  }

  // 1. Tabbatar da walat yana da isasshen kudi
  const user = await User.findById(userId);
  if (!user || Number(user.walletBalance || 0) < cost) {
    return res.status(400).json({
      success: false,
      message: "Insufficient wallet balance. Please fund your wallet.",
    });
  }

  // 2. Cire kudin a walat kafin tura bukata
  user.walletBalance -= cost;
  await user.save();

  const reference = `BDH_DAT_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    // 3. Tura oda zuwa Ayax API
    const ayaxRes = await ayaxService.purchaseData({
      network,
      phone,
      planId,
      reference,
    });

    // 4. Rubuta tarihin ciniki a Transaction
    await Transaction.create({
      user: userId,
      userId: userId,
      type: "DEBIT",
      category: "DATA_PURCHASE",
      service: "DATA_PURCHASE",
      amount: cost,
      volumeGB: Number(volumeGB || 0),
      status: "success",
      reference,
      recipient: phone,
      narration: `${networkName || network} ${volumeGB || ""}GB Data purchase to ${phone}`,
      metadata: { ayaxResponse: ayaxRes },
    });

    // Rubuta a Sale model idan yana nan
    if (Sale) {
      await Sale.create({
        agentId: userId,
        user: userId,
        amount: cost,
        dataAmountGB: Number(volumeGB || 0),
        status: "success",
        reference,
        phone,
      }).catch(() => null);
    }

    return res.status(200).json({
      success: true,
      message: "Data purchase successful!",
      data: {
        reference,
        remainingBalance: user.walletBalance,
        ayaxResponse: ayaxRes,
      },
    });
  } catch (apiError) {
    console.error("[Data Buy Error]:", apiError?.response?.data || apiError.message);

    // 5. Mayar da kudin walat idan an samu matsala (Auto-Refund)
    user.walletBalance += cost;
    await user.save();

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "REFUND",
      category: "DATA_REFUND",
      service: "DATA_PURCHASE_FAILED",
      amount: cost,
      status: "failed",
      reference: `REV_${reference}`,
      recipient: phone,
      narration: `Refund for failed data purchase: ${phone}`,
    }).catch(() => null);

    return res.status(502).json({
      success: false,
      message:
        apiError?.response?.data?.message ||
        apiError?.response?.data?.error ||
        "Data delivery failed at telecom gateway. Your wallet has been refunded.",
    });
  }
};

/**
 * 3. Sayar da Airtime (VTU)
 * @route POST /api/v1/services/buy-airtime
 */
exports.buyAirtime = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { network, phone, amount } = req.body;
  const cost = Number(amount);

  if (!network || !phone || !cost || cost < 50) {
    return res.status(400).json({
      success: false,
      message: "Valid network, phone number, and minimum amount of ₦50 are required.",
    });
  }

  const user = await User.findById(userId);
  if (!user || Number(user.walletBalance || 0) < cost) {
    return res.status(400).json({
      success: false,
      message: "Insufficient wallet balance for airtime purchase.",
    });
  }

  user.walletBalance -= cost;
  await user.save();

  const reference = `BDH_AIR_${Date.now()}`;

  try {
    const ayaxRes = await ayaxService.purchaseAirtime({
      network,
      phone,
      amount: cost,
      reference,
    });

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "DEBIT",
      category: "AIRTIME_PURCHASE",
      service: "AIRTIME_PURCHASE",
      amount: cost,
      status: "success",
      reference,
      recipient: phone,
      narration: `₦${cost} Airtime recharge to ${phone}`,
      metadata: { ayaxResponse: ayaxRes },
    });

    return res.status(200).json({
      success: true,
      message: "Airtime purchase successful!",
      data: {
        reference,
        remainingBalance: user.walletBalance,
        ayaxResponse: ayaxRes,
      },
    });
  } catch (error) {
    console.error("[Airtime Buy Error]:", error?.response?.data || error.message);

    // Auto-Refund
    user.walletBalance += cost;
    await user.save();

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "REFUND",
      category: "AIRTIME_REFUND",
      service: "AIRTIME_PURCHASE_FAILED",
      amount: cost,
      status: "failed",
      reference: `REV_${reference}`,
      recipient: phone,
      narration: `Refund for failed airtime recharge: ${phone}`,
    }).catch(() => null);

    return res.status(502).json({
      success: false,
      message:
        error?.response?.data?.message ||
        "Airtime topup failed at telecom gateway. Wallet refunded.",
    });
  }
};

/**
 * 4. Biyan Kudin Cable TV (DStv, GOtv, StarTimes)
 * @route POST /api/v1/services/cable/buy
 */
exports.subscribeCable = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { provider, smartcardNumber, packageId, amount, phone } = req.body;
  const cost = Number(amount);

  if (!provider || !smartcardNumber || !cost || cost <= 0) {
    return res.status(400).json({
      success: false,
      message: "Provider, smartcard number, and a valid amount are required.",
    });
  }

  const user = await User.findById(userId);
  if (!user || Number(user.walletBalance || 0) < cost) {
    return res.status(400).json({
      success: false,
      message: "Insufficient wallet balance for cable subscription.",
    });
  }

  user.walletBalance -= cost;
  await user.save();

  const reference = `BDH_CAB_${Date.now()}`;

  try {
    const ayaxRes = await ayaxService.purchaseCableSubscription({
      provider,
      smartcardNumber,
      packageId,
      phone,
      reference,
    });

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "DEBIT",
      category: "CABLE_TV",
      service: "CABLE_TV",
      amount: cost,
      status: "success",
      reference,
      recipient: smartcardNumber,
      narration: `${provider.toUpperCase()} TV subscription for ${smartcardNumber}`,
      metadata: { ayaxResponse: ayaxRes },
    });

    return res.status(200).json({
      success: true,
      message: "Cable TV subscription successful!",
      data: ayaxRes,
    });
  } catch (err) {
    console.error("[Cable Error]:", err?.response?.data || err.message);

    // Auto-Refund
    user.walletBalance += cost;
    await user.save();

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "REFUND",
      category: "CABLE_REFUND",
      service: "CABLE_TV_FAILED",
      amount: cost,
      status: "failed",
      reference: `REV_${reference}`,
      recipient: smartcardNumber,
      narration: `Refund for failed cable activation: ${smartcardNumber}`,
    }).catch(() => null);

    return res.status(502).json({
      success: false,
      message: err?.response?.data?.message || "Cable subscription failed. Wallet refunded.",
    });
  }
};

/**
 * 5. Tantance Lambar NIN (NIN Verification)
 * @route POST /api/v1/services/identity/nin-verify
 */
exports.validateNIN = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { ninNumber, fee } = req.body;
  const verificationFee = Number(fee || 200);

  if (!ninNumber || String(ninNumber).trim().length !== 11) {
    return res.status(400).json({
      success: false,
      message: "Valid 11-digit NIN number is required.",
    });
  }

  const user = await User.findById(userId);
  if (!user || Number(user.walletBalance || 0) < verificationFee) {
    return res.status(400).json({
      success: false,
      message: `Insufficient balance. NIN verification fee is ₦${verificationFee}.`,
    });
  }

  user.walletBalance -= verificationFee;
  await user.save();

  const reference = `BDH_NIN_${Date.now()}`;

  try {
    const ayaxRes = await ayaxService.verifyNIN({ ninNumber, reference });

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "DEBIT",
      category: "NIN_VERIFICATION",
      service: "NIN_VERIFICATION",
      amount: verificationFee,
      status: "success",
      reference,
      recipient: ninNumber,
      narration: `NIN Verification for ${ninNumber}`,
      metadata: { ayaxResponse: ayaxRes },
    });

    return res.status(200).json({
      success: true,
      message: "NIN verification successful!",
      data: ayaxRes?.data || ayaxRes,
    });
  } catch (err) {
    console.error("[NIN Verification Error]:", err?.response?.data || err.message);

    user.walletBalance += verificationFee;
    await user.save();

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "REFUND",
      category: "NIN_REFUND",
      service: "NIN_VERIFICATION_FAILED",
      amount: verificationFee,
      status: "failed",
      reference: `REV_${reference}`,
      recipient: ninNumber,
      narration: `Refund for failed NIN verification: ${ninNumber}`,
    }).catch(() => null);

    return res.status(502).json({
      success: false,
      message: err?.response?.data?.message || "NIN verification failed. Fee refunded.",
    });
  }
};

/**
 * 6. Tantance Lambar BVN (BVN Verification)
 * @route POST /api/v1/services/identity/bvn-verify
 */
exports.validateBVN = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { bvnNumber, fee } = req.body;
  const bvnFee = Number(fee || 250);

  if (!bvnNumber || String(bvnNumber).trim().length !== 11) {
    return res.status(400).json({
      success: false,
      message: "Valid 11-digit BVN number is required.",
    });
  }

  const user = await User.findById(userId);
  if (!user || Number(user.walletBalance || 0) < bvnFee) {
    return res.status(400).json({
      success: false,
      message: `Insufficient balance. BVN verification fee is ₦${bvnFee}.`,
    });
  }

  user.walletBalance -= bvnFee;
  await user.save();

  const reference = `BDH_BVN_${Date.now()}`;

  try {
    const ayaxRes = await ayaxService.verifyBVN({ bvnNumber, reference });

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "DEBIT",
      category: "BVN_VERIFICATION",
      service: "BVN_VERIFICATION",
      amount: bvnFee,
      status: "success",
      reference,
      recipient: bvnNumber,
      narration: `BVN Verification for ${bvnNumber}`,
      metadata: { ayaxResponse: ayaxRes },
    });

    return res.status(200).json({
      success: true,
      message: "BVN verification successful!",
      data: ayaxRes?.data || ayaxRes,
    });
  } catch (err) {
    console.error("[BVN Verification Error]:", err?.response?.data || err.message);

    user.walletBalance += bvnFee;
    await user.save();

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "REFUND",
      category: "BVN_REFUND",
      service: "BVN_VERIFICATION_FAILED",
      amount: bvnFee,
      status: "failed",
      reference: `REV_${reference}`,
      recipient: bvnNumber,
      narration: `Refund for failed BVN verification: ${bvnNumber}`,
    }).catch(() => null);

    return res.status(502).json({
      success: false,
      message: err?.response?.data?.message || "BVN verification failed. Fee refunded.",
    });
  }
};

/**
 * 7. Tantance NIMC (NIMC Validation)
 * @route POST /api/v1/services/identity/nimc-validate
 */
exports.validateNIMC = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { trackingId, ninNumber, fee } = req.body;
  const validationFee = Number(fee || 300);

  if (!trackingId && !ninNumber) {
    return res.status(400).json({
      success: false,
      message: "Please provide either a Tracking ID or NIN number for NIMC validation.",
    });
  }

  const user = await User.findById(userId);
  if (!user || Number(user.walletBalance || 0) < validationFee) {
    return res.status(400).json({
      success: false,
      message: `Insufficient balance. NIMC validation fee is ₦${validationFee}.`,
    });
  }

  user.walletBalance -= validationFee;
  await user.save();

  const reference = `BDH_NIMC_VAL_${Date.now()}`;
  const targetId = trackingId || ninNumber;

  try {
    const ayaxRes = await ayaxService.validateNIMC({
      trackingId,
      ninNumber,
      reference,
    });

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "DEBIT",
      category: "NIMC_VALIDATION",
      service: "NIMC_VALIDATION",
      amount: validationFee,
      status: "success",
      reference,
      recipient: targetId,
      narration: `NIMC Validation for ${targetId}`,
      metadata: { ayaxResponse: ayaxRes },
    });

    return res.status(200).json({
      success: true,
      message: "NIMC validation completed successfully!",
      data: ayaxRes?.data || ayaxRes,
    });
  } catch (err) {
    console.error("[NIMC Validation Error]:", err?.response?.data || err.message);

    user.walletBalance += validationFee;
    await user.save();

    await Transaction.create({
      user: userId,
      userId: userId,
      type: "REFUND",
      category: "NIMC_REFUND",
      service: "NIMC_VALIDATION_FAILED",
      amount: validationFee,
      status: "failed",
      reference: `REV_${reference}`,
      recipient: targetId,
      narration: `Refund for failed NIMC validation: ${targetId}`,
    }).catch(() => null);

    return res.status(502).json({
      success: false,
      message: err?.response?.data?.message || "NIMC validation failed. Wallet refunded.",
    });
  }
};