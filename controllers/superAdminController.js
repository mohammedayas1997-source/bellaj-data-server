const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");
let DataPlan;
try {
  DataPlan = require("../models/DataPlan");
} catch (e) {
  DataPlan = null;
}
let Sale;
try {
  Sale = require("../models/Sale");
} catch (e) {
  Sale = null;
}
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const APP_NAME = "Bellaj Data Hub";

// ==========================================
// 0. SCHEMA NA MUSAMMAN DON PRICING MATRIX
// ==========================================
let Pricing;
try {
  Pricing = mongoose.model("Pricing");
} catch (e) {
  const pricingSchema = new mongoose.Schema(
    {
      service: { type: String, required: true, unique: true, uppercase: true },
      serviceName: { type: String, default: "VAS Service" },
      provider: { type: String, default: "SYSTEM_DEFAULT" },
      baseRate: { type: Number, required: true, default: 0 },
      margin: { type: Number, required: true, default: 0 },
      agentMargin: { type: Number, default: 0 },
      agentPrice: { type: Number, default: 0 },
      retailPrice: { type: Number, required: true, default: 0 },
      status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
  );
  Pricing = mongoose.model("Pricing", pricingSchema);
}

// In-Memory fallback for Pricing Matrix idan ana bukatarsa
let globalPricingConfig = {
  nimc: {
    validation: "1300",
    modification: "1700",
    name: "0",
    phone: "0",
    dob: "0",
    address: "0",
  },
  bvn: {
    verification: "0",
    retrieval: "0",
    correction: "0",
  },
  services: {
    airtimeCharge: "0",
    cableCharge: "0",
    electricityCharge: "0",
  },
  dataPlans: {
    sme: {
      mtn: { "500MB": "150", "1GB": "275", "2GB": "550", "5GB": "1375", ratePerGb: "275" },
      airtel: { "500MB": "160", "1GB": "285", "2GB": "570", "5GB": "1425", ratePerGb: "285" },
      glo: { "500MB": "140", "1GB": "260", "2GB": "520", "5GB": "1300", ratePerGb: "260" },
      "9mobile": { "500MB": "170", "1GB": "300", "2GB": "600", "5GB": "1500", ratePerGb: "300" },
    },
  },
};

// Helper: Tura Email ta Nodemailer
const dispatchEmail = async (to, subject, text, html) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"${APP_NAME} SuperAdmin" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("[Email Delivery Warning]:", err.message);
  }
};

// Helper: Tura Notification ga User Guda Daya
const sendNotification = async (userId, title, message, sendAlsoEmail = false) => {
  try {
    const user = await User.findById(userId);
    if (user) {
      if (!user.notifications) user.notifications = [];
      user.notifications.unshift({
        title,
        message,
        date: new Date(),
        isRead: false,
      });
      await user.save();

      if (sendAlsoEmail && user.email) {
        dispatchEmail(
          user.email,
          `${APP_NAME} Alert: ${title}`,
          message,
          `<div style="font-family:sans-serif;padding:20px;border-top:4px solid #0B5E3C">
            <h2 style="color:#0B5E3C">${title}</h2>
            <p style="color:#334155;font-size:15px;line-height:1.6">${message}</p>
            <p style="color:#94a3b8;font-size:12px">Sent automatically by Bellaj Data Hub Administrative Engine.</p>
          </div>`
        );
      }
    }
  } catch (error) {
    console.error("Bellaj notification failed:", error.message);
  }
};

/**
 * @desc    Get System Overview Statistics (Inflow, Outflow, Refunds, Users)
 * @route   GET /api/v1/superadmin/stats
 */
exports.getSystemStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalCustomers,
      totalAdmins,
      totalSupervisors,
      totalAgents,
      totalLeaders,
      userWallets,
      allTxList,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: { $in: ["user", "customer"] } }),
      User.countDocuments({ role: { $in: ["admin", "superadmin"] } }),
      User.countDocuments({ role: "supervisor" }),
      User.countDocuments({ role: "agent" }),
      User.countDocuments({ role: "leader" }),
      User.aggregate([
        {
          $group: {
            _id: null,
            totalWalletBalance: { $sum: "$walletBalance" },
          },
        },
      ]),
      Transaction ? Transaction.find({ status: "success" }).select("amount type category").lean() : [],
    ]);

    let totalInflow = 0;
    let totalOutflow = 0;
    let totalRefunds = 0;

    allTxList.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      const t = String(tx.type || tx.category || "").toLowerCase();
      if (t.includes("fund") || t.includes("deposit") || t.includes("credit") || t.includes("paystack")) {
        totalInflow += amt;
      } else if (t.includes("refund")) {
        totalRefunds += amt;
      } else {
        totalOutflow += amt;
      }
    });

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} system statistics loaded successfully`,
      data: {
        users: {
          totalUsers,
          totalCustomers,
          totalAdmins,
          totalSupervisors,
          totalAgents,
          totalLeaders,
        },
        finance: {
          totalRevenue: totalInflow,
          totalInflow,
          totalOutflow,
          totalRefunds,
          successfulTransactions: allTxList.length,
          walletBalance: userWallets[0]?.totalWalletBalance || 0,
        },
      },
    });
  } catch (error) {
    console.error("Bellaj System Stats Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Registered Users Tare da Kudin Sayayya
 * @route   GET /api/v1/superadmin/users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(),
    ]);

    const userIds = users.map((u) => u._id);
    let spentMap = new Map();

    if (Transaction) {
      const spentAgg = await Transaction.aggregate([
        { $match: { user: {$in: userIds }, status: "success" } },
        { $group: { _id: "$user", totalSpent: { $sum: "$amount" } } },
      ]);
      spentAgg.forEach((s) => spentMap.set(String(s._id), s.totalSpent));
    }

    const formattedUsers = users.map((u) => ({
      ...u,
      totalSpent: spentMap.get(String(u._id)) || 0,
    }));

    return res.status(200).json({
      success: true,
      message: "Users loaded successfully",
      count: formattedUsers.length,
      total,
      page,
      data: formattedUsers,
      users: formattedUsers,
    });
  } catch (error) {
    console.error("Get All Users Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Supervisors tare da Agents da Ayyukan da Suka Yi
 * @route   GET /api/v1/superadmin/supervisors
 */
exports.getSupervisors = async (req, res) => {
  try {
    const supervisors = await User.find({ role: "supervisor" })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    const supervisorsWithMetrics = await Promise.all(
      supervisors.map(async (sup) => {
        const agents = await User.find({
          $or: [{ assignedSupervisor: sup._id }, { supervisorId: sup._id }],
          role: "agent",
        })
          .select("name email phone walletBalance dataVolumeSold")
          .lean();

        let teamGB = 0;
        let teamRevenue = 0;

        if (Sale) {
          const salesAgg = await Sale.aggregate([
            { $match: { supervisorId: sup._id } },
            { $group: { _id: null, totalGB: { $sum: "$dataAmountGB" }, totalAmount: { $sum: "$amount" } } },
          ]);
          if (salesAgg.length > 0) {
            teamGB = salesAgg[0].totalGB || 0;
            teamRevenue = salesAgg[0].totalAmount || 0;
          }
        }

        return {
          ...sup,
          teamSize: agents.length,
          agents,
          teamPerformance: teamGB,
          dataVolumeSold: teamGB,
          teamRevenue,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: supervisorsWithMetrics.length,
      data: supervisorsWithMetrics,
      supervisors: supervisorsWithMetrics,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Agents tare da Total Tallace-tallacen da suka yi
 * @route   GET /api/v1/superadmin/agents
 */
exports.getAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: "agent" })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    const agentIds = agents.map((a) => a._id);
    let salesMap = new Map();

    if (Transaction) {
      const txAgg = await Transaction.aggregate([
        { $match: { user: {$in: agentIds }, status: "success" } },
        { $group: { _id: "$user", totalSales: { $sum: "$amount" } } },
      ]);
      txAgg.forEach((t) => salesMap.set(String(t._id), t.totalSales));
    }

    const agentsWithSales = agents.map((ag) => ({
      ...ag,
      totalSales: salesMap.get(String(ag._id)) || 0,
      totalSpent: salesMap.get(String(ag._id)) || 0,
    }));

    return res.status(200).json({
      success: true,
      count: agentsWithSales.length,
      data: agentsWithSales,
      agents: agentsWithSales,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Global Transactions
 * @route   GET /api/v1/superadmin/transactions
 */
exports.getAllGlobalTransactions = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 500, 1000);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find()
        .populate("user", "surname firstName name email phone role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} global transactions loaded successfully`,
      count: transactions.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: transactions,
      transactions,
    });
  } catch (error) {
    console.error("Bellaj Global Transactions Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Send Broadcast Push Notification to Users (Direct In-App Delivery)
 * @route   POST /api/v1/superadmin/broadcast
 */
exports.sendBroadcastNotification = async (req, res) => {
  try {
    const { title, message, target, targetAudience, sendEmail } = req.body;
    const scope = String(target || targetAudience || "ALL").toUpperCase().trim();

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message content are required",
      });
    }

    let filter = {};
    if (scope === "AGENTS") filter = { role: "agent" };
    else if (scope === "SUPERVISORS") filter = { role: "supervisor" };
    else if (scope === "SUBSCRIBERS" || scope === "USERS" || scope === "CUSTOMERS") filter = { role: { $in: ["user", "customer"] } };

    const newNotification = {
      title: title.trim(),
      message: message.trim(),
      date: new Date(),
      isRead: false,
    };

    const updateResult = await User.updateMany(filter, {
      $push: { notifications: { $each: [newNotification],$position: 0 } },
    });

    if (sendEmail) {
      const recipients = await User.find(filter).select("email").lean();
      const emailList = recipients.map((r) => r.email).filter(Boolean);

      if (emailList.length > 0) {
        dispatchEmail(
          emailList.slice(0, 50).join(","),
          `${APP_NAME} Broadcast: ${title}`,
          message,
          `<div style="font-family:sans-serif;padding:25px;border-left:5px solid #0B5E3C">
            <h2 style="color:#0B5E3C;margin-top:0">${title}</h2>
            <p style="color:#1e293b;font-size:15px;line-height:1.6">${message}</p>
            <div style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
              Official Bellaj Data Hub Corporation Broadcast.
            </div>
          </div>`
        );
      }
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "BROADCAST_NOTIFICATION_SENT",
      details: `Dispatched announcement: "${title}" to target group: ${scope} (${updateResult.modifiedCount || 0} recipients)`,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Broadcast message sent to ${updateResult.modifiedCount || 0} user(s) successfully`,
      data: {
        title,
        message,
        target: scope,
        recipientCount: updateResult.modifiedCount || 0,
        dispatchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Broadcast Notification Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Process Direct User Wallet Refund
 * @route   POST /api/v1/superadmin/refund
 */
exports.processUserRefund = async (req, res) => {
  try {
    const { userId, email, amount, reason, transactionId, reference } = req.body;

    const refundAmount = Number(amount);
    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid positive refund amount is required",
      });
    }

    let query = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query._id = userId;
    } else if (email) {
      query.email = email.toLowerCase().trim();
    } else if (userId) {
      query.$or = [{ email: String(userId).toLowerCase().trim() }, { phone: String(userId).trim() }];
    } else {
      return res.status(400).json({
        success: false,
        message: "User ID, Phone or valid Email is required for refund",
      });
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Beneficiary user account could not be found",
      });
    }

    const previousBalance = Number(user.walletBalance || user.balance || 0);
    user.walletBalance = previousBalance + refundAmount;

    if (!user.transactions) user.transactions = [];
    const generatedRef = reference || `REFUND_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    user.transactions.unshift({
      transactionId: generatedRef,
      type: "credit",
      amount: refundAmount,
      status: "success",
      description: `Wallet Refund: ${reason || "Direct Administrative Balance Refund"}`,
      date: new Date(),
    });

    await user.save();

    let refundTx = null;
    if (Transaction) {
      refundTx = await Transaction.create({
        user: user._id,
        type: "WALLET_REFUND",
        service: "ADMIN_REVERSAL",
        amount: refundAmount,
        status: "success",
        reference: generatedRef,
        narration: reason || "Direct Administrative Balance Refund",
        details: {
          originalTransactionId: transactionId || null,
          previousBalance,
          newBalance: user.walletBalance,
          refundedBy: req.user?._id || "SUPERADMIN",
        },
      }).catch(() => null);
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "USER_WALLET_REFUNDED",
      details: `Reversed ₦${refundAmount.toLocaleString()} to ${user.email}. Reason: ${reason || "Not specified"}`,
      targetUser: user._id,
    }).catch(() => null);

    await sendNotification(
      user._id,
      "Wallet Refund Credited",
      `₦${refundAmount.toLocaleString()} has been credited back to your ${APP_NAME} wallet. Reason: ${reason || "Adjustment"}`,
      true
    );

    return res.status(200).json({
      success: true,
      message: `₦${refundAmount.toLocaleString()} credited successfully to ${user.email}`,
      data: {
        user: {
          _id: user._id,
          name: user.name || `${user.firstName || ""} ${user.surname || ""}`.trim(),
          email: user.email,
          newBalance: user.walletBalance,
        },
        transaction: refundTx,
      },
    });
  } catch (error) {
    console.error("Refund Processing Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Current Pricing Matrix (Database & In-Memory fallback)
 * @route   GET /api/v1/superadmin/pricing
 */
exports.getPricingMatrix = async (req, res) => {
  try {
    const list = await Pricing.find().sort({ service: 1 }).lean();
    return res.status(200).json({
      success: true,
      message: "Pricing matrix loaded successfully",
      count: list.length,
      data: list.length > 0 ? list : globalPricingConfig,
      pricing: list,
    });
  } catch (error) {
    console.error("Get Pricing Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update Pricing Matrix (NIMC, BVN, Cable TV, Data, VAS)
 * @route   PUT /api/v1/superadmin/pricing
 */
exports.updatePricingMatrix = async (req, res) => {
  try {
    const {
      service,
      serviceType,
      serviceName,
      rate,
      baseRate,
      margin,
      agentMargin,
      retailPrice,
      agentPrice,
      status,
      provider,
      nimc,
      bvn,
      services,
      dataPlans,
    } = req.body;

    if (nimc) globalPricingConfig.nimc = { ...globalPricingConfig.nimc, ...nimc };
    if (bvn) globalPricingConfig.bvn = { ...globalPricingConfig.bvn, ...bvn };
    if (services) globalPricingConfig.services = { ...globalPricingConfig.services, ...services };
    if (dataPlans) globalPricingConfig.dataPlans = { ...globalPricingConfig.dataPlans, ...dataPlans };

    let pricingEntry = null;
    if (service || serviceType) {
      const channel = String(service || serviceType).toUpperCase().trim();
      const unitBase = Number(baseRate !== undefined ? baseRate : rate || 0);
      const unitRetail = Number(retailPrice !== undefined ? retailPrice : unitBase + Number(margin || 0));
      const unitAgent = Number(agentPrice !== undefined ? agentPrice : unitRetail - Number(agentMargin || 0));
      const calculatedMargin = unitRetail - unitBase;

      pricingEntry = await Pricing.findOneAndUpdate(
        { service: channel },
        {
          $set: {
            service: channel,
            serviceName: serviceName || channel.replace(/_/g, " "),
            baseRate: unitBase,
            margin: calculatedMargin,
            agentMargin: Number(agentMargin || 0),
            agentPrice: unitAgent,
            retailPrice: unitRetail,
            status: status || "ACTIVE",
            provider: provider || "SYSTEM_DEFAULT",
            updatedBy: req.user?._id,
          },
        },
        { upsert: true, new: true, runValidators: true }
      );
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "PRICING_CONFIG_UPDATED",
      details: "Superadmin updated service and data pricing configurations live",
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "Pricing matrix updated successfully across all channels",
      data: pricingEntry || globalPricingConfig,
    });
  } catch (error) {
    console.error("Update Pricing Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Publish/Set Data Tariff Plan (Matching Picture Presets)[cite: 1]
 * @route   POST /api/v1/superadmin/set-plan
 */
exports.setPlanPrice = async (req, res) => {
  try {
    if (!DataPlan) {
      return res.status(500).json({ success: false, message: "DataPlan model is not registered" });
    }

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
    } = req.body;

    const netName = String(network || networkName || "MTN").toUpperCase().trim();
    let netId = String(networkId || "");
    if (!netId) {
      if (netName.includes("MTN")) netId = "1";
      else if (netName.includes("GLO")) netId = "2";
      else if (netName.includes("9MOBILE") || netName.includes("ETISALAT")) netId = "3";
      else if (netName.includes("AIRTEL")) netId = "4";
      else netId = "1";
    }

    const resolvedPlanId = String(planId || planCode || "").trim();
    if (!resolvedPlanId) {
      return res.status(400).json({ success: false, message: "Gateway Plan ID is required" });
    }

    const finalCustomer = Number(customerPrice !== undefined ? customerPrice : userPrice || 0);
    const finalAgent = Number(agentPrice !== undefined ? agentPrice : retailPrice || finalCustomer);

    const rawVolume = String(volume || (sizeGB ? `${sizeGB} GB` : "1.0 GB")).trim();
    let numericSize = Number(sizeGB || 0);
    if (!numericSize) {
      const match = rawVolume.match(/([\d.]+)/);
      if (match) {
        numericSize = rawVolume.toUpperCase().includes("MB") ? Number(match[1]) / 1000 : Number(match[1]);
      }
    }

    const resolvedType = String(planType || type || "DC").toUpperCase().trim();
    const resolvedValidity = String(validity || "30 Days").trim();
    const planLabel = `${netName} ${rawVolume} (${resolvedType})`;

    const plan = await DataPlan.findOneAndUpdate(
      {
        $or: [
          { planId: resolvedPlanId, networkId: netId },
          { planCode: resolvedPlanId, networkId: netId },
        ],
      },
      {
        $set: {
          networkId: netId,
          network: netName,
          networkName: netName,
          planId: resolvedPlanId,
          planCode: resolvedPlanId,
          planType: resolvedType,
          type: resolvedType,
          volume: rawVolume,
          sizeGB: numericSize,
          validity: resolvedValidity,
          customerPrice: finalCustomer,
          userPrice: finalCustomer,
          price: finalCustomer,
          agentPrice: finalAgent,
          retailPrice: finalAgent,
          planLabel,
          name: planLabel,
          isActive: true,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: `Data plan ${planLabel} published successfully`,
      data: plan,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Assign Targets to Field Agents / Supervisors
 * @route   POST /api/v1/superadmin/targets
 */
exports.assignTarget = async (req, res) => {
  try {
    const {
      targetUserId,
      supervisorId,
      agentId,
      agentRef,
      target,
      salesGoal,
      amount,
      dataGoal,
      agentGoal,
      month,
      type,
      note,
      isGlobal,
    } = req.body;

    const resolvedUserRef = String(targetUserId || agentRef || supervisorId || agentId || "").trim();
    const finalSalesGoal = Number(amount || salesGoal || target || 0);
    const finalDataGoal = Number(dataGoal || 0);
    const finalAgentGoal = Number(agentGoal || 0);
    const targetMonth = month || new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

    const targetPayload = {
      salesGoal: finalSalesGoal,
      dataGoal: finalDataGoal,
      agentGoal: finalAgentGoal,
      quota: finalSalesGoal,
      type: type || "MONTHLY_OPERATIONAL",
      currentMonth: targetMonth,
      note: note || "Formal Operational Target Set by Corporate Management",
      assignedAt: new Date(),
    };

    if (isGlobal || resolvedUserRef === "ALL" || resolvedUserRef === "GLOBAL_ALL" || !resolvedUserRef) {
      await User.updateMany(
        { role: { $in: ["agent", "supervisor", "user"] } },
        { $set: { targets: targetPayload } }
      );

      await Activity.create({
        staffId: req.user?._id,
        action: "BELLAJ_GLOBAL_TARGET_SET",
        details: `Global targets deployed for ${targetMonth}: Sales=₦${finalSalesGoal}, Data=${finalDataGoal}GB, Team=${finalAgentGoal}`,
      }).catch(() => null);

      return res.status(200).json({
        success: true,
        message: `Corporate target deployed globally for ${targetMonth}`,
        data: targetPayload,
      });
    }

    let query = {};
    if (mongoose.Types.ObjectId.isValid(resolvedUserRef)) {
      query._id = resolvedUserRef;
    } else {
      query.$or = [{ email: resolvedUserRef.toLowerCase() }, { phone: resolvedUserRef }, { referralId: resolvedUserRef }];
    }

    const targetUser = await User.findOne(query);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: `Designated beneficiary (${resolvedUserRef}) could not be resolved`,
      });
    }

    targetUser.targets = targetPayload;
    targetUser.markModified("targets");
    await targetUser.save();

    await sendNotification(
      targetUser._id,
      "New Operational Quota Assigned",
      `Management has assigned your operational targets for ${targetMonth}. Review your performance metrics in console.`,
      true
    );

    await Activity.create({
      staffId: req.user?._id,
      action: "TARGET_ASSIGNED",
      details: `Assigned target to ${targetUser.email} for ${targetMonth}`,
      targetUser: targetUser._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "Target performance goal assigned successfully",
      data: targetUser.targets,
    });
  } catch (error) {
    console.error("Assign Target Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Cikakken Rajistar Masu Amfani (36 States, LGAs, Roles)
 * @route   POST /api/v1/superadmin/create-supervisor
 */
exports.createSupervisor = async (req, res) => {
  try {
    const {
      fullName,
      name,
      firstName,
      surname,
      email,
      phone,
      password,
      role,
      state,
      lga,
      address,
    } = req.body;

    if (!email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "Email, phone number, and password are required",
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = String(phone).trim();

    const existing = await User.findOne({
      $or: [{ email: cleanEmail }, { phone: cleanPhone }],
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "An account with this email address or phone number already exists",
      });
    }

    const rawFullName = (fullName || name || "").trim();
    let fName = firstName ? firstName.trim() : "";
    let sName = surname ? surname.trim() : "";

    if (rawFullName && (!fName || !sName)) {
      const parts = rawFullName.split(" ");
      fName = parts[0] || "User";
      sName = parts.slice(1).join(" ") || "Bellaj";
    }

    let assignedRole = String(role || "supervisor").toLowerCase().trim();
    if (assignedRole === "customer") assignedRole = "user";
    if (assignedRole === "staff") assignedRole = "admin";

    const newUser = await User.create({
      name: rawFullName || `${fName} ${sName}`.trim(),
      firstName: fName || "User",
      surname: sName || "Bellaj",
      email: cleanEmail,
      phone: cleanPhone,
      password: String(password).trim(),
      role: assignedRole,
      state: state ? String(state).trim() : "Gombe",
      lga: lga ? String(lga).trim() : "Gombe",
      address: address ? String(address).trim() : "",
      isSuspended: false,
      status: "active",
      walletBalance: 0,
      pin: "0000",
    });

    await Activity.create({
      staffId: req.user?._id,
      action: `BELLAJ_${assignedRole.toUpperCase()}_REGISTERED`,
      details: `Superadmin created new ${assignedRole}: ${newUser.name} (${newUser.email}, ${newUser.phone}) in ${newUser.lga}, ${newUser.state}`,
      targetUser: newUser._id,
    }).catch(() => null);

    return res.status(201).json({
      success: true,
      message: `Account for ${newUser.name} (${assignedRole.toUpperCase()}) created successfully`,
      data: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        state: newUser.state,
        lga: newUser.lga,
      },
    });
  } catch (error) {
    console.error("Create User Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Dakatar / Kunna Mai Amfani (Suspend / Unsuspend)
 * @route   PATCH /api/v1/superadmin/users/:id/status
 */
exports.suspendUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (req.user?._id && String(req.user._id) === String(user._id)) {
      return res.status(400).json({
        success: false,
        message: "Security Protocol: You cannot suspend your own active superadmin account.",
      });
    }

    const newSuspendedState =
      req.body.isSuspended !== undefined
        ? Boolean(req.body.isSuspended)
        : !user.isSuspended;

    user.isSuspended = newSuspendedState;
    user.status = newSuspendedState ? "suspended" : "active";
    await user.save();

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_USER_STATUS_TOGGLED",
      details: `${user.role ? user.role.toUpperCase() : "USER"} ${user.email} status set to ${
        newSuspendedState ? "SUSPENDED" : "ACTIVE"
      }`,
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Account status updated to ${user.status.toUpperCase()}`,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    GOGE MAI AMFANI HAR ABADA DAGA DATABASE
 * @route   DELETE /api/v1/superadmin/users/:id
 */
exports.deleteUserPermanently = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, message: "Invalid user identifier" });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User does not exist in database" });
    }

    if (req.user?._id && String(req.user._id) === String(user._id)) {
      return res.status(400).json({
        success: false,
        message: "Safety Refusal: You cannot delete your own executive account.",
      });
    }

    const deletedRole = user.role || "user";
    const deletedEmail = user.email;
    const deletedName = user.name || `${user.firstName || ""} ${user.surname || ""}`.trim();

    if (deletedRole === "supervisor") {
      await User.updateMany(
        { assignedSupervisor: user._id },
        { $unset: { assignedSupervisor: "" }, $set: { supervisorId: null } }
      );
    }

    await User.findByIdAndDelete(targetUserId);

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_USER_PERMANENTLY_DELETED",
      details: `Permanently deleted ${deletedRole.toUpperCase()}: ${deletedName} (${deletedEmail}) from system database.`,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Account ${deletedEmail} has been permanently deleted from database.`,
      deletedUserId: targetUserId,
    });
  } catch (error) {
    console.error("Permanent Delete User Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Check Core API and Database Health
 * @route   GET /api/v1/superadmin/health
 */
exports.getSystemHealth = async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED";
    return res.status(200).json({
      success: true,
      status: "HEALTHY",
      database: dbState,
      uptime: `${Math.floor(process.uptime())}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Change User Role
 * @route   PATCH /api/v1/superadmin/manage-role
 */
exports.manageUserRole = async (req, res) => {
  try {
    const { userId, newRole } = req.body;
    const allowedRoles = ["user", "customer", "agent", "supervisor", "leader", "admin", "superadmin"];

    if (!userId || !newRole) {
      return res.status(400).json({ success: false, message: "User ID and new role are required" });
    }

    if (!allowedRoles.includes(newRole.toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid role supplied" });
    }

    if (String(userId) === String(req.user?.id) && newRole !== "superadmin") {
      return res.status(400).json({
        success: false,
        message: "You cannot demote your own superadmin account",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: newRole.toLowerCase() },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found" });
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ROLE_UPDATED",
      details: `User role changed to ${newRole}`,
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `User role updated to ${newRole}`,
      data: user,
    });
  } catch (error) {
    console.error("Manage Role Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Make User Admin
 * @route   PATCH /api/v1/superadmin/make-admin
 */
exports.makeAdmin = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: "admin" },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found" });
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ADMIN_ASSIGNED",
      details: "User role changed to admin",
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "User is now an admin",
      data: user,
    });
  } catch (error) {
    console.error("Make Admin Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Admin and Staff Audit Logs
 * @route   GET /api/v1/superadmin/audit-logs
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await Activity.find()
      .populate("staffId", "surname firstName role email")
      .populate("targetUser", "surname firstName role")
      .sort({ createdAt: -1 })
      .limit(1000);

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} audit logs loaded successfully`,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("Audit Logs Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};