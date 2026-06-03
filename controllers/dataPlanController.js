const DataPlan = require("../models/DataPlan");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Create or Update Data Plan
 * @route   POST /api/v1/admin/set-plan
 * @access  Admin
 */
exports.setPlanPrice = async (req, res) => {
  try {
    const {
      networkId,
      planCode,
      userPrice,
      agentPrice,
      planLabel,
      networkName,
      sizeGB,
      planType,
      validity,
    } = req.body;

    if (
      !networkId ||
      !planCode ||
      userPrice === undefined ||
      agentPrice === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "networkId, planCode, userPrice and agentPrice are required",
      });
    }

    const userAmount = Number(userPrice);
    const agentAmount = Number(agentPrice);

    if (Number.isNaN(userAmount) || Number.isNaN(agentAmount)) {
      return res.status(400).json({
        success: false,
        message: "Prices must be valid numeric values",
      });
    }

    const plan = await DataPlan.findOneAndUpdate(
      {
        networkId: String(networkId),
        planCode: String(planCode),
      },
      {
        networkId: String(networkId),
        planCode: String(planCode),

        userPrice: userAmount,
        agentPrice: agentAmount,

        planLabel: planLabel || "",
        networkName: networkName || "",

        sizeGB: sizeGB ? Number(sizeGB) : 0,

        planType: planType || "SME",
        validity: validity || "30 Days",

        isActive: true,
        updatedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} plan saved successfully`,
      data: plan,
    });
  } catch (error) {
    console.error("Bellaj Set Plan Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error updating plan details",
      error: error.message,
    });
  }
};

/**
 * @desc    Get All Active Plans
 * @route   GET /api/v1/plans
 * @access  Public / Private
 */
exports.getPlans = async (req, res) => {
  try {
    const plans = await DataPlan.find({
      isActive: true,
    }).sort({
      networkName: 1,
      userPrice: 1,
    });

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} plans loaded successfully`,
      count: plans.length,
      data: plans,
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
 * @desc    Get Plans By Network
 * @route   GET /api/v1/plans/network/:networkId
 * @access  Public / Private
 */
exports.getPlansByNetwork = async (req, res) => {
  try {
    const { networkId } = req.params;

    const plans = await DataPlan.find({
      networkId: String(networkId),
      isActive: true,
    }).sort({
      userPrice: 1,
    });

    return res.status(200).json({
      success: true,
      count: plans.length,
      data: plans,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Disable Data Plan
 * @route   PATCH /api/v1/admin/disable-plan/:id
 * @access  Admin
 */
exports.disablePlan = async (req, res) => {
  try {
    const plan = await DataPlan.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
      },
      {
        new: true,
      },
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Plan disabled successfully",
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
      {
        isActive: true,
      },
      {
        new: true,
      },
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Plan activated successfully",
      data: plan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
