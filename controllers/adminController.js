const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");
const NIMCRequest = require("../models/NIMCRequest");
const BVNRequest = require("../models/BVNRequest");
const SupportRequest = require("../models/SupportRequest");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const APP_NAME = "Bellaj Data Hub";

// ==========================================
// 0. SCHEMA NA MUSAMMAN DON PRICING MATRIX
// ==========================================
// Idan baka da model din Pricing a models/, muna amfani da dynamic mongoose schema
let Pricing;
try {
  Pricing = mongoose.model("Pricing");
} catch (e) {
  const pricingSchema = new mongoose.Schema(
    {
      service: { type: String, required: true, unique: true, uppercase: true }, // e.g., SME_DATA, MTN_CG, AIRTIME, CABLE_TV, ELECTRICITY
      provider: { type: String, default: "SYSTEM_DEFAULT" },
      baseRate: { type: Number, required: true, default: 0 },
      margin: { type: Number, required: true, default: 0 },
      agentMargin: { type: Number, default: 0 },
      retailPrice: { type: Number, required: true, default: 0 },
      status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
  );
  Pricing = mongoose.model("Pricing", pricingSchema);
}

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
      from: `"${APP_NAME} Admin" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("[Email Delivery Warning]:", err.message);
  }
};

// Helper: Tura Notification ga User Guda Daya (App Notification + Optional Email)
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

// ==========================================
// 1. SYSTEM HEALTH & AUDIT INSPECTOR (TABBATAR DA KOMAI NA AIKI)
// ==========================================
/**
 * @desc    Duba lafiyar tsarin kamfani (Database, Models, Environment Variables, Paystack Gateway)
 * @route   GET /api/v1/admin/system/health-check
 */
const getSystemHealth = async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED";
    const dbName = mongoose.connection.name;

    // Duba Environment Keys masu mahimmanci
    const envAudit = {
      MONGO_URI: Boolean(process.env.MONGO_URI || process.env.DATABASE_URL),
      JWT_SECRET: Boolean(process.env.JWT_SECRET),
      PAYSTACK_SECRET: Boolean(process.env.PAYSTACK_SECRET_KEY),
      EMAIL_CONFIG: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
      NODE_ENV: process.env.NODE_ENV || "development",
    };

    // Ƙidaya Record din kowane bangare
    const [userCount, txCount, activeSupervisors, totalPricingRules] = await Promise.all([
      User.countDocuments().catch(() => 0),
      Transaction.countDocuments().catch(() => 0),
      User.countDocuments({ role: "supervisor", isSuspended: false }).catch(() => 0),
      Pricing.countDocuments().catch(() => 0),
    ]);

    const isSystemSound = dbStatus === "CONNECTED" && envAudit.JWT_SECRET && envAudit.PAYSTACK_SECRET;

    return res.status(200).json({
      success: true,
      systemStatus: isSystemSound ? "OPTIMAL_OPERATIONAL" : "DEGRADED_ATTENTION_REQUIRED",
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        name: dbName,
      },
      audit: {
        totalSubscribers: userCount,
        totalLedgerEntries: txCount,
        activeFieldSupervisors: activeSupervisors,
        configuredPricingChannels: totalPricingRules,
      },
      environmentConfiguration: envAudit,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. PRICING CONTROLS (SETA PRICE NA DUKKAN SERVICES)
// ==========================================
/**
 * @desc    Adjust or Create Service Pricing Live
 * @route   PUT /api/v1/admin/pricing
 */
const updatePricing = async (req, res) => {
  try {
    const { service, serviceType, rate, baseRate, margin, agentMargin, status, provider } = req.body;
    const channel = String(service || serviceType || "SME_DATA").toUpperCase().trim();

    const unitBase = Number(rate !== undefined ? rate : baseRate || 0);
    const profitMargin = Number(margin || 0);
    const subAgentMargin = Number(agentMargin || 0);
    const totalRetail = unitBase + profitMargin;

    const pricingEntry = await Pricing.findOneAndUpdate(
      { service: channel },
      {
        $set: {
          service: channel,
          baseRate: unitBase,
          margin: profitMargin,
          agentMargin: subAgentMargin,
          retailPrice: totalRetail,
          status: status || "ACTIVE",
          provider: provider || "SYSTEM_DEFAULT",
          updatedBy: req.user?._id,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_PRICING_UPDATED",
      details: `Set live pricing for ${channel}: Cost=₦${unitBase}, Margin=₦${profitMargin} => Retail=₦${totalRetail}`,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Pricing rules for ${channel} committed successfully`,
      data: pricingEntry,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Dauko jerin dukkan farashin da aka saita
 * @route   GET /api/v1/admin/pricing
 */
const getAllPricing = async (req, res) => {
  try {
    const list = await Pricing.find().sort({ service: 1 });
    return res.status(200).json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. TARGET DEPLOYMENT (TURA TARGET GA SUPERVISORS/AGENTS/KOWA)
// ==========================================
/**
 * @desc    Assign Targets (Agent, Supervisor, ko Global Target)
 * @route   POST /api/v1/admin/targets
 */
const assignTarget = async (req, res) => {
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

    // Idan Global Target ne (An zaba kowa da kowa)
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

    // Idan an tura wa mutum daya ne (ta ID, Email, ko Phone)
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
      action: "BELLAJ_TARGET_ASSIGNED",
      details: `Assigned performance target to ${targetUser.email} for ${targetMonth}`,
      targetUser: targetUser._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Performance targets assigned to ${targetUser.name || targetUser.email}`,
      data: targetUser.targets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 4. BROADCAST NOTIFICATIONS (TURA SAKO GA KOWA)
// ==========================================
/**
 * @desc    Tura Notification ga dukkan masu amfani ko wani rukuni (Dashboard + Email + Activity)
 * @route   POST /api/v1/admin/notifications/broadcast
 */
const broadcastNotification = async (req, res) => {
  try {
    const { title, message, target, targetAudience, sendEmail } = req.body;
    const scope = String(target || targetAudience || "ALL").toUpperCase().trim();

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Notification title and message body are required",
      });
    }

    let filter = {};
    if (scope === "AGENTS") filter = { role: "agent" };
    else if (scope === "SUPERVISORS") filter = { role: "supervisor" };
    else if (scope === "SUBSCRIBERS" || scope === "USERS") filter = { role: "user" };

    const newNotification = {
      title: title.trim(),
      message: message.trim(),
      date: new Date(),
      isRead: false,
    };

    const updateResult = await User.updateMany(filter, {
      $push: { notifications: { $each: [newNotification], $position: 0 } },
    });

    // Idan an zabi a tura da email ga kowa a rukunin
    if (sendEmail) {
      const recipients = await User.find(filter).select("email").lean();
      const emailList = recipients.map((r) => r.email).filter(Boolean);

      // Aika email a bango ba tare da tsayar da request ba
      if (emailList.length > 0) {
        dispatchEmail(
          emailList.slice(0, 50).join(","), // Fara tura rukunin farko
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
      action: "BELLAJ_ADMIN_BROADCAST",
      details: `Notice dispatched [Scope: ${scope}]: "${title}" to ${updateResult.modifiedCount || 0} user(s).`,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Notice dispatched successfully to ${updateResult.modifiedCount || 0} account(s).`,
      recipientCount: updateResult.modifiedCount || 0,
      scope,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 5. SUPERVISORS & FIELD DIRECTORS WORKFLOW
// ==========================================
const createSupervisor = async (req, res) => {
  try {
    const { firstName, surname, name, email, phone, password } = req.body;

    if (!email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, email, phone, and password are required",
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const supervisor = await User.create({
      name: name || `${firstName || ""} ${surname || ""}`.trim() || "Bellaj Supervisor",
      firstName: firstName || "Supervisor",
      surname: surname || "Bellaj",
      email: cleanEmail,
      phone: String(phone).trim(),
      password: hashedPassword,
      role: "supervisor",
      isSuspended: false,
      status: "active",
      walletBalance: 0,
      pin: "0000",
    });

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_SUPERVISOR_CREATED",
      details: `Created new supervisor: ${supervisor.email} (${supervisor.phone})`,
      targetUser: supervisor._id,
    }).catch(() => null);

    return res.status(201).json({
      success: true,
      message: `Supervisor ${supervisor.name} created successfully`,
      data: {
        id: supervisor._id,
        name: supervisor.name,
        email: supervisor.email,
        phone: supervisor.phone,
        role: supervisor.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const toggleSupervisorStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
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
      action: "BELLAJ_SUPERVISOR_STATUS_TOGGLED",
      details: `Supervisor ${user.email} marked as ${newSuspendedState ? "SUSPENDED" : "ACTIVE"}`,
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `Supervisor status updated to ${newSuspendedState ? "Suspended" : "Active"}`,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const transferAgent = async (req, res) => {
  try {
    const { agentId, supervisorId, targetSupervisorId } = req.body;
    const destSupervisorId = targetSupervisorId || supervisorId;

    if (!agentId || !destSupervisorId) {
      return res.status(400).json({
        success: false,
        message: "Both agentId and targetSupervisorId are required",
      });
    }

    const [agent, targetSupervisor] = await Promise.all([
      User.findById(agentId),
      User.findById(destSupervisorId),
    ]);

    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    if (!targetSupervisor || (targetSupervisor.role || "").toLowerCase() !== "supervisor") {
      return res.status(404).json({
        success: false,
        message: "Target user is not a registered supervisor",
      });
    }

    agent.assignedSupervisor = targetSupervisor._id;
    agent.supervisorId = targetSupervisor._id;
    await agent.save();

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_AGENT_TRANSFERRED",
      details: `Reassigned agent ${agent.email} to supervisor ${targetSupervisor.email}`,
      targetUser: agent._id,
    }).catch(() => null);

    await sendNotification(
      agent._id,
      "Supervisor Reassigned",
      `Your supervising officer has been reassigned to ${targetSupervisor.name || targetSupervisor.email}.`
    );

    return res.status(200).json({
      success: true,
      message: `Agent ${agent.name || agent.email} reassigned to ${targetSupervisor.name} successfully`,
      data: agent,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 6. CUSTOMER SERVICE & TICKETS
// ==========================================
const resolveSupportTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { status, resolutionNote } = req.body;

    const ticket = await SupportRequest.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found" });
    }

    ticket.status = status || "resolved";
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = req.user?._id;
    if (resolutionNote) ticket.resolutionNote = resolutionNote;
    await ticket.save();

    if (ticket.userId) {
      await sendNotification(
        ticket.userId,
        "Support Ticket Resolved",
        `Your inquiry regarding "${ticket.subject || ticket.title || "Support"}" has been marked as resolved.`
      );
    }

    return res.status(200).json({
      success: true,
      message: "Customer ticket resolved successfully",
      data: ticket,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 7. FINANCIAL, STATS & ANALYTICS
// ==========================================
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalAgents,
      totalSupervisors,
      nimcCount,
      bvnCount,
      supportCount,
      txCount,
      revenueResult,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "agent" }),
      User.countDocuments({ role: "supervisor" }),
      NIMCRequest ? NIMCRequest.countDocuments() : 0,
      BVNRequest ? BVNRequest.countDocuments() : 0,
      SupportRequest ? SupportRequest.countDocuments() : 0,
      Transaction.countDocuments(),
      Transaction.aggregate([
        { $match: { status: "success" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
            successfulTransactions: { $sum: 1 },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      message: `${APP_NAME} live analytics compiled`,
      totalUsers,
      totalAgents,
      totalSupervisors,
      nimcRequests: nimcCount,
      bvnRequests: bvnCount,
      reports: supportCount,
      transactions: txCount,
      finance: {
        totalRevenue: revenueResult[0]?.totalRevenue || 0,
        successfulTransactions: revenueResult[0]?.successfulTransactions || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSalesStats = async (req, res) => {
  try {
    const [revenueData, totalSalesCount] = await Promise.all([
      Transaction.aggregate([
        { $match: { status: "success" } },
        {
          $group: {
            _id: null,
            totalSales: { $sum: "$amount" },
          },
        },
      ]),
      Transaction.countDocuments({ status: "success" }),
    ]);

    const totalRevenue = revenueData[0]?.totalSales || 0;

    return res.status(200).json({
      success: true,
      totalSales: totalRevenue,
      total: totalRevenue,
      count: totalSalesCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const processDirectRefund = async (req, res) => {
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
        message: "User identifier (Email, ID, or Phone) is required",
      });
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Recipient user could not be found",
      });
    }

    const prevBalance = Number(user.walletBalance || user.balance || 0);
    user.walletBalance = prevBalance + refundAmount;

    if (!user.transactions) user.transactions = [];
    const generatedRef = reference || `REF_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    user.transactions.unshift({
      transactionId: generatedRef,
      type: "credit",
      amount: refundAmount,
      status: "success",
      description: `Wallet Refund: ${reason || "Administrative Balance Adjustment"}`,
      date: new Date(),
    });

    await user.save();

    const ledgerTx = await Transaction.create({
      user: user._id,
      type: "WALLET_REFUND",
      service: "ADMIN_REVERSAL",
      amount: refundAmount,
      status: "success",
      reference: generatedRef,
      narration: reason || "Administrative Direct Refund",
      details: {
        originalTransactionId: transactionId || null,
        previousBalance: prevBalance,
        newBalance: user.walletBalance,
        refundedBy: req.user?._id || "ADMIN",
      },
    }).catch(() => null);

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ADMIN_REFUND_EXECUTED",
      details: `Credited ₦${refundAmount.toLocaleString()} to ${user.email}. Reason: ${reason || "N/A"}`,
      targetUser: user._id,
    }).catch(() => null);

    await sendNotification(
      user._id,
      "Wallet Refund Credited",
      `₦${refundAmount.toLocaleString()} has been credited back to your ${APP_NAME} wallet.`,
      true
    );

    return res.status(200).json({
      success: true,
      message: `₦${refundAmount.toLocaleString()} credited successfully to ${user.email}`,
      data: {
        newBalance: user.walletBalance,
        transaction: ledgerTx,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveRefund = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction || transaction.status !== "pending-refund") {
      return res.status(400).json({
        success: false,
        message: "Transaction is not pending a refund",
      });
    }

    const userId = transaction.user || transaction.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account linked to transaction not found",
      });
    }

    const refundAmount = Number(transaction.amount || 0);
    user.walletBalance = Number(user.walletBalance || user.balance || 0) + refundAmount;

    transaction.status = "refunded";
    transaction.approvedBy = req.user?._id;
    transaction.resolvedAt = Date.now();

    if (!user.transactions) user.transactions = [];
    user.transactions.unshift({
      transactionId: transaction.reference || `REF_${Date.now()}`,
      type: "credit",
      amount: refundAmount,
      status: "success",
      description: `Refund Approved: ${transaction.service || transaction.type || "VAS Service"}`,
      date: new Date(),
    });

    await Promise.all([user.save(), transaction.save()]);

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_REFUND_APPROVED",
      details: `Approved refund of ₦${refundAmount} for transaction ${transaction._id}`,
      targetUser: user._id,
    }).catch(() => null);

    await sendNotification(
      user._id,
      "Refund Approved",
      `Your refund request of ₦${refundAmount.toLocaleString()} has been approved and credited.`
    );

    return res.status(200).json({
      success: true,
      message: "Refund approved and balance credited successfully",
      newBalance: user.walletBalance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAllTransactions = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find()
        .populate("user", "surname firstName email phone role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      count: transactions.length,
      total,
      data: transactions,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 8. IDENTITY SERVICES: NIMC & BVN
// ==========================================
const getAllNIMCRequests = async (req, res) => {
  try {
    const requests = await NIMCRequest.find()
      .populate("user", "surname firstName email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
      requests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateToProcessing = async (req, res) => {
  try {
    const request = await NIMCRequest.findByIdAndUpdate(
      req.params.id,
      { status: "processing" },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ success: false, message: "NIMC request not found" });
    }

    return res.status(200).json({
      success: true,
      message: "NIMC request updated to processing",
      data: request,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveRequest = async (req, res) => {
  try {
    const request = await NIMCRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "NIMC request not found" });
    }

    request.status = "completed";
    await request.save();

    await sendNotification(
      request.user,
      "NIMC Request Completed",
      `Your NIMC request has been completed successfully on ${APP_NAME}.`
    );

    return res.status(200).json({
      success: true,
      message: "NIMC request approved and completed",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAllBVNRequests = async (req, res) => {
  try {
    const requests = await BVNRequest.find()
      .populate("user", "surname firstName email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
      requests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateBVNStatus = async (req, res) => {
  try {
    const request = await BVNRequest.findByIdAndUpdate(
      req.params.id,
      { status: "processing" },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ success: false, message: "BVN request not found" });
    }

    return res.status(200).json({
      success: true,
      message: "BVN request updated to processing",
      data: request,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveBVNRequest = async (req, res) => {
  try {
    const request = await BVNRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "BVN request not found" });
    }

    request.status = "completed";
    await request.save();

    await sendNotification(
      request.user,
      "BVN Request Completed",
      `Your BVN request has been completed successfully on ${APP_NAME}.`
    );

    return res.status(200).json({
      success: true,
      message: "BVN request approved and completed",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 9. GENERAL USER & IDENTITY ROLES
// ==========================================
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: users.length, data: users, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSupervisors = async (req, res) => {
  try {
    const supervisors = await User.find({ role: "supervisor" })
      .select("-password")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: supervisors.length, data: supervisors });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: "agent" })
      .select("-password")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: agents.length, data: agents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { userId, role, newRole } = req.body;
    const finalRole = (role || newRole || "").toLowerCase().trim();

    if (!userId || !finalRole) {
      return res.status(400).json({
        success: false,
        message: "User ID and new role are required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: finalRole },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_USER_ROLE_CHANGED",
      details: `Role changed to ${finalRole}`,
      targetUser: user._id,
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: `User role changed to ${finalRole}`,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const suspendUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isSuspended = !user.isSuspended;
    user.status = user.isSuspended ? "suspended" : "active";
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User status updated to ${user.status}`,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const toggleWalletStatus = async (req, res) => {
  try {
    const { userId, status } = req.body;
    if (!userId || !status) {
      return res.status(400).json({
        success: false,
        message: "User ID and status are required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { walletStatus: status },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: `Wallet status changed to ${status}`,
      user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const debitUser = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    const debitAmount = Number(amount);

    if (!userId || !debitAmount || debitAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "User ID and positive debit amount are required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const currentBalance = Number(user.walletBalance || user.balance || 0);
    if (currentBalance < debitAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient user wallet balance",
      });
    }

    user.walletBalance = currentBalance - debitAmount;
    if (!user.transactions) user.transactions = [];

    user.transactions.unshift({
      transactionId: `DEBIT_${Date.now()}`,
      type: "debit",
      amount: debitAmount,
      status: "success",
      description: `Admin Debit: ${reason || "Administrative correction"}`,
      date: new Date(),
    });

    await user.save();

    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_ADMIN_DEBIT",
      details: `Debited ₦${debitAmount}. Reason: ${reason || "N/A"}`,
      targetUser: user._id,
    }).catch(() => null);

    await sendNotification(
      user._id,
      "Wallet Debit Notice",
      `₦${debitAmount.toLocaleString()} has been debited from your wallet. Reason: ${reason || "Adjustment"}`,
      true
    );

    return res.status(200).json({
      success: true,
      message: `₦${debitAmount.toLocaleString()} debited successfully`,
      newBalance: user.walletBalance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const trackTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;

    let transaction = await Transaction.findOne({
      $or: [
        { reference: transactionId },
        { _id: mongoose.Types.ObjectId.isValid(transactionId) ? transactionId : null },
      ],
    }).populate("user", "name firstName surname phone email");

    if (transaction) {
      return res.status(200).json({
        success: true,
        userData: transaction.user,
        transaction,
      });
    }

    const userWithTx = await User.findOne({
      "transactions.transactionId": transactionId,
    });

    if (!userWithTx) {
      return res.status(404).json({
        success: false,
        message: "Transaction identifier could not be resolved",
      });
    }

    const nestedTx = userWithTx.transactions.find((t) => t.transactionId === transactionId);

    return res.status(200).json({
      success: true,
      userData: {
        id: userWithTx._id,
        name: userWithTx.name || `${userWithTx.firstName || ""} ${userWithTx.surname || ""}`.trim(),
        phone: userWithTx.phone,
        email: userWithTx.email,
      },
      transaction: nestedTx,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const requestAdminFix = async (req, res) => {
  try {
    const { transactionId, userId, reason, supportNote } = req.body;

    const newRequest = await SupportRequest.create({
      transactionId,
      userId,
      requestedBy: req.user?._id,
      reason,
      supportNote,
    });

    return res.status(201).json({
      success: true,
      message: "Support ticket generated successfully",
      data: newRequest,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSupportRequests = async (req, res) => {
  try {
    const requests = await SupportRequest.find()
      .populate("userId", "name firstName surname phone email")
      .populate("requestedBy", "name firstName surname email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
      data: requests,
      reports: requests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const handleSupportRequest = async (req, res) => {
  try {
    const { requestId, action, adminNote } = req.body;
    const request = await SupportRequest.findById(requestId).populate("userId");

    if (!request) {
      return res.status(404).json({ success: false, message: "Support ticket not found" });
    }

    const user = request.userId;

    if (action === "resolve" && user) {
      const tx = (user.transactions || []).find((t) => t.transactionId === request.transactionId);
      if (tx && tx.status !== "refunded") {
        user.walletBalance = Number(user.walletBalance || user.balance || 0) + Number(tx.amount || 0);
        tx.status = "refunded";
        request.status = "resolved";

        await sendNotification(
          user._id,
          "Transaction Resolved & Refunded",
          `Your ticket for ₦${tx.amount} has been resolved and refunded.`,
          true
        );

        await user.save();
      } else {
        request.status = "resolved";
      }
    } else if (action === "reject") {
      request.status = "rejected";
      if (user) {
        await sendNotification(
          user._id,
          "Support Ticket Declined",
          `Your ticket was declined. Note: ${adminNote || "Closed by admin"}`
        );
      }
    }

    await request.save();

    return res.status(200).json({
      success: true,
      message: `Support ticket status updated to '${action}'`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSupportActivities = async (req, res) => {
  try {
    const activities = await Activity.find()
      .populate("staffId", "surname firstName email role")
      .populate("targetUser", "surname firstName phone email")
      .sort({ createdAt: -1 })
      .limit(1000);

    return res.status(200).json({ success: true, count: activities.length, data: activities });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getPendingRefunds = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending-refund" })
      .populate("user", "surname firstName phone email")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  // System Health & Audit
  getSystemHealth,

  // Pricing & Margins
  updatePricing,
  getAllPricing,

  // Targets & Operational Quotas
  assignTarget,

  // Notifications & Communication
  broadcastNotification,

  // Supervisor & Agent Directorate
  createSupervisor,
  toggleSupervisorStatus,
  transferAgent,
  getSupervisors,
  getAgents,

  // Customer Service Support
  resolveSupportTicket,
  requestAdminFix,
  getSupportRequests,
  handleSupportRequest,
  getSupportActivities,

  // Financial Audits & Refunds
  getDashboardStats,
  getSalesStats,
  getAllTransactions,
  processDirectRefund,
  approveRefund,
  getPendingRefunds,
  debitUser,
  toggleWalletStatus,
  trackTransaction,

  // Identity Verification Services
  getAllNIMCRequests,
  updateToProcessing,
  approveRequest,
  getAllBVNRequests,
  updateBVNStatus,
  approveBVNRequest,

  // User Management
  getAllUsers,
  updateUserRole,
  suspendUser,
};