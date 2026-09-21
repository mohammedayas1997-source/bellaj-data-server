const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    /**
     * Notification Title
     */
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      maxlength: 150,
    },

    /**
     * Notification Message
     */
    message: {
      type: String,
      required: [true, "Notification message body is required"],
      trim: true,
      maxlength: 5000,
    },

    /**
     * Notification Type (Used for UI styling/icons)
     */
    type: {
      type: String,
      trim: true,
      lowercase: true,
      default: "info",
      index: true,
    },

    /**
     * Notification Category (e.g. SYSTEM, LGA_DIRECTIVE, TRANSACTION, PROMO)
     */
    category: {
      type: String,
      trim: true,
      uppercase: true,
      default: "BROADCAST",
      index: true,
    },

    /**
     * Notification Audience Target
     */
    target: {
      type: String,
      trim: true,
      lowercase: true,
      set: (val) => {
        const v = String(val || "all").toLowerCase().trim();
        if (v === "subscribers" || v === "users") return "user";
        if (v === "agents") return "agent";
        if (v === "supervisors") return "supervisor";
        return v;
      },
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
     * Target State & LGA (Used for targeted field broadcasts)
     */
    state: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    lga: {
      type: String,
      trim: true,
      default: null,
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
     * Sticky Notification (Pinned at top)
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
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

NotificationSchema.index({
  state: 1,
  lga: 1,
});

/**
 * Auto-disable expired notifications helper
 */
NotificationSchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

/**
 * Auto formatting pre-save hook
 */
NotificationSchema.pre("save", function (next) {
  if (this.type) {
    this.type = this.type.trim().toLowerCase();
  }

  if (this.category) {
    this.category = this.category.trim().toUpperCase();
  }

  next();
});

module.exports =
  mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);