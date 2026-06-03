const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    /**
     * Notification Title
     */
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    /**
     * Notification Message
     */
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },

    /**
     * Notification Type
     * Used for UI colors/icons
     */
    type: {
      type: String,
      enum: ["info", "warning", "success", "danger"],
      default: "info",
      index: true,
    },

    /**
     * Notification Audience
     */
    target: {
      type: String,
      enum: [
        "all",
        "user",
        "agent",
        "supervisor",
        "leader",
        "admin",
        "superadmin",
      ],
      default: "all",
      index: true,
    },

    /**
     * Optional Specific User Target
     */
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /**
     * Notification Status
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * Sticky Notification
     * Important alerts pinned at top
     */
    isPinned: {
      type: Boolean,
      default: false,
    },

    /**
     * Scheduled Publish Time
     */
    publishAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * Notification Expiry Date
     */
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    /**
     * Notification Image/Banner
     */
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },

    /**
     * Redirect Screen or URL
     */
    actionLink: {
      type: String,
      trim: true,
      default: null,
    },

    /**
     * Creator/Admin
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /**
     * Notification Delivery Stats
     */
    stats: {
      totalSent: {
        type: Number,
        default: 0,
      },
      totalRead: {
        type: Number,
        default: 0,
      },
    },

    /**
     * Extra Metadata
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Performance Indexes
 */
NotificationSchema.index({
  isActive: 1,
  target: 1,
  createdAt: -1,
});

NotificationSchema.index({
  publishAt: 1,
  expiresAt: 1,
});

NotificationSchema.index({
  targetUser: 1,
  createdAt: -1,
});

NotificationSchema.index({
  type: 1,
  isPinned: 1,
});

/**
 * Auto-disable expired notifications
 */
NotificationSchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;

  return new Date() > this.expiresAt;
};

/**
 * Auto formatting
 */
NotificationSchema.pre("save", function (next) {
  if (this.type) {
    this.type = this.type.trim().toLowerCase();
  }

  if (this.target) {
    this.target = this.target.trim().toLowerCase();
  }

  next();
});

module.exports = mongoose.model("Notification", NotificationSchema);
