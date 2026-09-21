const Notification = require("../models/Notification");
const User = require("../models/User");
const Activity = require("../models/Activity");
const nodemailer = require("nodemailer");

const APP_NAME = "Bellaj Data Hub";

// Helper: Tura Email idan an buƙaci hakan
const dispatchBroadcastEmail = async (recipients, title, message) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !recipients.length) return;
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"${APP_NAME} Broadcast" <${process.env.EMAIL_USER}>`,
      bcc: recipients.slice(0, 50).join(","), // Tura rukuni na farko a asirce
      subject: `${APP_NAME}: ${title}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border-left: 5px solid #0B5E3C; background: #f8fafc;">
          <h2 style="color: #0B5E3C; margin-top: 0;">${title}</h2>
          <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">${message}</p>
          <div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            Official notification from Bellaj Data Hub Engine.
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error("[Email Delivery Warning]:", err.message);
  }
};

/**
 * @desc    Create & Broadcast Notification to Users/Agents/Supervisors
 * @route   POST /api/v1/admin/send-notification ko /api/v1/admin/notifications/broadcast
 * @access  Private/Admin
 */
exports.createNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      target,
      targetAudience,
      category,
      state,
      lga,
      sendEmail,
      isPinned,
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Notification title and message body are required.",
      });
    }

    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    const rawTarget = String(target || targetAudience || "all").toLowerCase().trim();

    // 1. Tace Audience Filter
    let userFilter = {};
    let resolvedTarget = "all";

    if (rawTarget === "agents" || rawTarget === "agent") {
      userFilter.role = "agent";
      resolvedTarget = "agent";
    } else if (rawTarget === "supervisors" || rawTarget === "supervisor") {
      userFilter.role = "supervisor";
      resolvedTarget = "supervisor";
    } else if (rawTarget === "users" || rawTarget === "user" || rawTarget === "subscribers") {
      userFilter.role = "user";
      resolvedTarget = "user";
    }

    // Tace wuri (State da LGA idan an sanya su)
    if (state) userFilter.state = String(state).trim();
    if (lga) userFilter.lga = String(lga).trim();

    // 2. Ƙirƙirar Sanarwa a Notification Collection
    const notification = await Notification.create({
      title: cleanTitle,
      message: cleanMessage,
      type: type || "info",
      category: category || "BROADCAST",
      target: resolvedTarget,
      state: state || null,
      lga: lga || null,
      isPinned: Boolean(isPinned),
      createdBy: req.user?._id || null,
      isActive: true,
    });

    // 3. Tura Sanarwa Kai Tsaye Cikin Akwatin Masu Amfani (User Notifications Array)
    const inAppNotice = {
      title: cleanTitle,
      message: cleanMessage,
      date: new Date(),
      isRead: false,
    };

    const updateResult = await User.updateMany(userFilter, {
      $push: { notifications: { $each: [inAppNotice],$position: 0 } },
    });

    // 4. Tura Email idan an zaɓa
    if (sendEmail) {
      const recipientUsers = await User.find(userFilter).select("email").lean();
      const emailList = recipientUsers.map((u) => u.email).filter(Boolean);
      if (emailList.length > 0) {
        dispatchBroadcastEmail(emailList, cleanTitle, cleanMessage);
      }
    }

    // 5. Adana Aikin a Logs na Admin
    await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_SEND_NOTIFICATION",
      details: `[${resolvedTarget.toUpperCase()}] "${cleanTitle}" sent to ${updateResult.modifiedCount} accounts.`,
      metadata: {
        notificationId: notification._id,
        scope: resolvedTarget,
        deliveredCount: updateResult.modifiedCount,
      },
    }).catch(() => null);

    return res.status(201).json({
      success: true,
      message: `Notification successfully delivered to ${updateResult.modifiedCount} user(s).`,
      deliveredCount: updateResult.modifiedCount,
      data: notification,
    });
  } catch (error) {
    console.error("Bellaj Notification Dispatch Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error creating and dispatching notification.",
      error: error.message,
    });
  }
};

/**
 * @desc    Get All Broadcast Notifications Archive
 * @route   GET /api/v1/admin/all-notifications
 * @access  Private/Admin
 */
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ isPinned: -1, createdAt: -1 })
      .populate("createdBy", "name firstName surname email role")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Notifications loaded successfully.",
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    console.error("Bellaj Fetch Notifications Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching notifications.",
      error: error.message,
    });
  }
};

/**
 * @desc    Get In-App Notifications for Current Logged In User
 * @route   GET /api/v1/notifications/my-notifications
 * @access  Private (User/Agent/Supervisor)
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const user = await User.findById(userId).select("notifications");

    return res.status(200).json({
      success: true,
      count: user?.notifications?.length || 0,
      data: user?.notifications || [],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user notifications.",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete a broadcast notification
 * @route   DELETE /api/v1/admin/notifications/:id
 * @access  Private/Admin
 */
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete notification.",
      error: error.message,
    });
  }
};