const mongoose = require("mongoose");

const ActivitySchema = new mongoose.Schema(
  {
    /**
     * Staff/Admin/User performing the action
     */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Activity action type
     * Examples:
     * LOGIN
     * CHANGE_ROLE
     * REFUND_REQUEST
     * DATA_PURCHASE
     */
    action: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    /**
     * Detailed activity description
     */
    details: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    /**
     * User affected by the activity
     */
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /**
     * Device IP Address
     */
    ipAddress: {
      type: String,
      trim: true,
      default: null,
    },

    /**
     * Browser, mobile app, or device info
     */
    userAgent: {
      type: String,
      trim: true,
      default: null,
    },

    /**
     * Platform Source
     * mobile | web | api | admin-panel
     */
    platform: {
      type: String,
      enum: ["mobile", "web", "api", "admin-panel"],
      default: "api",
    },

    /**
     * Activity status
     */
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "success",
      index: true,
    },

    /**
     * Additional metadata
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
ActivitySchema.index({ user: 1, createdAt: -1 });
ActivitySchema.index({ action: 1, createdAt: -1 });
ActivitySchema.index({ targetUser: 1, createdAt: -1 });
ActivitySchema.index({ status: 1 });
ActivitySchema.index({ platform: 1 });

/**
 * Auto format action names
 */
ActivitySchema.pre("save", function (next) {
  if (this.action) {
    this.action = this.action.replace(/\s+/g, "_").toUpperCase();
  }

  next();
});

module.exports = mongoose.model("Activity", ActivitySchema);
