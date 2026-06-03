const mongoose = require("mongoose");

const BVNRequestSchema = new mongoose.Schema(
  {
    /**
     * User requesting verification
     */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * BVN Verification Service Type
     */
    serviceType: {
      type: String,
      default: "bvn_verification",
      trim: true,
      lowercase: true,
      enum: [
        "bvn_verification",
        "bvn_full",
        "bvn_basic",
        "bvn_face",
        "bvn_phone",
      ],
      index: true,
    },

    /**
     * BVN Number
     */
    bvnNumber: {
      type: String,
      required: true,
      trim: true,
      minlength: 11,
      maxlength: 11,
      index: true,
    },

    /**
     * Charged Amount
     */
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },

    /**
     * Request Status
     */
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "reversed"],
      default: "completed",
      index: true,
    },

    /**
     * Provider Response Data
     */
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /**
     * Provider Name
     */
    provider: {
      type: String,
      default: "dojah",
      trim: true,
      lowercase: true,
    },

    /**
     * Transaction Reference
     */
    reference: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    /**
     * Internal Transaction ID
     */
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },

    /**
     * User Device IP
     */
    ipAddress: {
      type: String,
      default: null,
    },

    /**
     * Device Information
     */
    userAgent: {
      type: String,
      default: null,
    },

    /**
     * Optional Error Message
     */
    errorMessage: {
      type: String,
      default: null,
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
BVNRequestSchema.index({
  user: 1,
  createdAt: -1,
});

BVNRequestSchema.index({
  status: 1,
  createdAt: -1,
});

BVNRequestSchema.index({
  serviceType: 1,
  status: 1,
});

/**
 * Auto-format fields
 */
BVNRequestSchema.pre("save", function (next) {
  if (this.bvnNumber) {
    this.bvnNumber = this.bvnNumber.trim();
  }

  if (this.provider) {
    this.provider = this.provider.trim().toLowerCase();
  }

  if (this.serviceType) {
    this.serviceType = this.serviceType.trim().toLowerCase();
  }

  next();
});

module.exports = mongoose.model("BVNRequest", BVNRequestSchema);
