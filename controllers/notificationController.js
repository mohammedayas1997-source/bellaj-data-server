const Activity = require("../models/Activity");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Create a new notification
 * @route   POST /api/v1/admin/send-notification
 * @access  Private/Admin
 */
exports.createNotification = async (req, res) => {
  try {
    const { title, message, type } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Notification title and message are required.",
      });
    }

    const notificationType = type || "general";

    const activity = await Activity.create({
      staffId: req.user?._id,
      action: "BELLAJ_SEND_NOTIFICATION",
      details: `Title: ${title} | Message: ${message}`,
      metadata: {
        title,
        message,
        type: notificationType,
        app: APP_NAME,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Notification created successfully.",
      data: {
        title,
        message,
        type: notificationType,
        activity,
      },
    });
  } catch (error) {
    console.error("Bellaj Notification Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error creating notification.",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all notifications
 * @route   GET /api/v1/admin/all-notifications
 * @access  Private/Admin
 */
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Activity.find({
      action: {
        $in: ["BELLAJ_SEND_NOTIFICATION", "SEND_NOTIFICATION"],
      },
    }).sort({
      createdAt: -1,
    });

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
