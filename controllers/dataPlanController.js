const DataPlan = require("../models/DataPlan");

const APP_NAME = "Bellaj Data Hub";

// Helper: Tabbatar da Network ID da Sunan Network
const resolveNetworkDetails = (networkInput, netIdInput) => {
  const rawNet = String(networkInput || "").toUpperCase().trim();
  const rawId = Number(netIdInput);

  if (rawNet.includes("MTN") || rawId === 1) {
    return { networkId: "1", networkName: "MTN" };
  }
  if (rawNet.includes("GLO") || rawId === 2) {
    return { networkId: "2", networkName: "GLO" };
  }
  if (rawNet.includes("9MOBILE") || rawNet.includes("ETISALAT") || rawId === 3) {
    return { networkId: "3", networkName: "9MOBILE" };
  }
  if (rawNet.includes("AIRTEL") || rawId === 4) {
    return { networkId: "4", networkName: "AIRTEL" };
  }

  return {
    networkId: String(netIdInput || "1"),
    networkName: rawNet || "MTN",
  };
};

/**
 * @desc    Publish, Create or Update Data Tariff / Plan
 * @route   POST /api/v1/admin/set-plan
 * @access  Admin
 */
exports.setPlanPrice = async (req, res) => {
  try {
    const {
      network,
      networkName,
      networkId,
      planId,
      planCode,
      planType,
      type,
      volume,
      sizeGB,
      validity,
      customerPrice,
      userPrice,
      agentPrice,
      retailPrice,
      planLabel,
    } = req.body;

    // 1. Daidaita Network ID da Sunan sa
    const netDetails = resolveNetworkDetails(network || networkName, networkId);

    // 2. Daidaita Gateway Plan ID (Al-Ihsan / API Provider ID)
    const resolvedPlanId = String(planId || planCode || "").trim();

    if (!resolvedPlanId) {
      return res.status(400).json({
        success: false,
        message: "Gateway Plan ID (planId/planCode) is required",
      });
    }

    // 3. Daidaita Farashin Abokin Ciniki da na Agent
    const finalCustomerPrice = Number(customerPrice !== undefined ? customerPrice : userPrice);
    const finalAgentPrice = Number(agentPrice !== undefined ? agentPrice : retailPrice);

    if (Number.isNaN(finalCustomerPrice) || Number.isNaN(finalAgentPrice)) {
      return res.status(400).json({
        success: false,
        message: "Customer and Agent prices must be valid numbers",
      });
    }

    // 4. Daidaita Girman Data (Volume / Size)
    const rawVolume = String(volume || (sizeGB ? `${sizeGB} GB` : "1.0 GB")).trim();
    let numericSize = Number(sizeGB || 0);
    if (!numericSize) {
      const match = rawVolume.match(/([\d.]+)/);
      if (match) {
        numericSize = rawVolume.toUpperCase().includes("MB")
          ? Number(match[1]) / 1000
          : Number(match[1]);
      }
    }

    const resolvedType = String(planType || type || "DC").toUpperCase().trim();
    const resolvedValidity = String(validity || "30 Days").trim();
    const generatedLabel = planLabel || `${netDetails.networkName} ${rawVolume} (${resolvedType})`;

    // 5. Nema tare da sabuntawa ko kirkira (Upsert)
    const plan = await DataPlan.findOneAndUpdate(
      {
        $or: [
          { planId: resolvedPlanId, networkId: netDetails.networkId },
          { planCode: resolvedPlanId, networkId: netDetails.networkId },
        ],
      },
      {
        $set: {
          networkId: netDetails.networkId,
          network: netDetails.networkName,
          networkName: netDetails.networkName,

          planId: resolvedPlanId,
          planCode: resolvedPlanId,

          planType: resolvedType,
          type: resolvedType,

          volume: rawVolume,
          sizeGB: numericSize,
          validity: resolvedValidity,

          userPrice: finalCustomerPrice,
          customerPrice: finalCustomerPrice,
          price: finalCustomerPrice,

          agentPrice: finalAgentPrice,
          retailPrice: finalAgentPrice,

          planLabel: generatedLabel,
          name: generatedLabel,

          isActive: true,
          updatedAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} data tariff (${netDetails.networkName} ${rawVolume}) published successfully`,
      data: plan,
    });
  } catch (error) {
    console.error("Bellaj Set Plan Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error publishing data plan tariff",
      error: error.message,
    });
  }
};

/**
 * @desc    Get All Active Plans (Formatted for App Frontend)
 * @route   GET /api/v1/plans or /api/v1/admin/data-plans
 * @access  Public / Private
 */
exports.getPlans = async (req, res) => {
  try {
    const rawPlans = await DataPlan.find({ isActive: true })
      .sort({ networkId: 1, userPrice: 1 })
      .lean();

    // Daidaita bayanan don kowane shafi na waya (BuyDataScreen da Admin) ya karba kai tsaye
    const formattedPlans = rawPlans.map((p) => ({
      _id: p._id,
      id: String(p.planId || p.planCode || p._id),
      planId: String(p.planId || p.planCode || p._id),
      networkId: Number(p.networkId || 1),
      network: p.networkName || p.network || "MTN",
      networkName: p.networkName || p.network || "MTN",
      type: p.planType || p.type || "DC",
      planType: p.planType || p.type || "DC",
      name: p.planLabel || p.name || `${p.volume || "1GB"} Data`,
      volume: p.volume || `${p.sizeGB || 1} GB`,
      validity: p.validity || "30 Days",
      price: Number(p.customerPrice || p.userPrice || p.price || 0),
      customerPrice: Number(p.customerPrice || p.userPrice || p.price || 0),
      userPrice: Number(p.customerPrice || p.userPrice || p.price || 0),
      agentPrice: Number(p.agentPrice || p.retailPrice || 0),
      isActive: Boolean(p.isActive),
    }));

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} data plans loaded successfully`,
      count: formattedPlans.length,
      data: formattedPlans,
      plans: formattedPlans,
    });
  } catch (error) {
    console.error("Bellaj Get Plans Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching data plans",
      error: error.message,
    });
  }
};

/**
 * @desc    Get Plans By Network ID or Name
 * @route   GET /api/v1/plans/network/:networkId
 * @access  Public / Private
 */
exports.getPlansByNetwork = async (req, res) => {
  try {
    const { networkId } = req.params;
    const netDetails = resolveNetworkDetails(networkId, networkId);

    const plans = await DataPlan.find({
      $or: [
        { networkId: netDetails.networkId },
        { network: netDetails.networkName },
        { networkName: netDetails.networkName },
      ],
      isActive: true,
    })
      .sort({ userPrice: 1 })
      .lean();

    const formatted = plans.map((p) => ({
      id: String(p.planId || p.planCode || p._id),
      planId: String(p.planId || p.planCode || p._id),
      networkId: Number(p.networkId || netDetails.networkId),
      network: p.networkName || p.network,
      type: p.planType || p.type || "DC",
      volume: p.volume || `${p.sizeGB} GB`,
      validity: p.validity || "30 Days",
      price: Number(p.customerPrice || p.userPrice || 0),
      agentPrice: Number(p.agentPrice || 0),
    }));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
      plans: formatted,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Disable / Toggle Data Plan
 * @route   PATCH /api/v1/admin/disable-plan/:id
 * @access  Admin
 */
exports.disablePlan = async (req, res) => {
  try {
    const plan = await DataPlan.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Data plan not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Data tariff disabled successfully",
      data: plan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Enable Data Plan
 * @route   PATCH /api/v1/admin/enable-plan/:id
 * @access  Admin
 */
exports.enablePlan = async (req, res) => {
  try {
    const plan = await DataPlan.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: true } },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Data plan not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Data tariff enabled successfully",
      data: plan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};