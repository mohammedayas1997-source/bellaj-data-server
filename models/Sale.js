const mongoose = require("mongoose");

const SaleSchema = new mongoose.Schema(
  {
    /**
     * Agent responsible for the sale
     */
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Supervisor assigned to the agent
     */
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Optional Leader
     */
    leaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /**
     * Network Name
     */
    networkName: {
      type: String,
      trim: true,
      uppercase: true,
      enum: ["MTN", "GLO", "AIRTEL", "9MOBILE"],
      default: "MTN",
      index: true,
    },

    /**
     * Data Plan Name
     * Example:
     * MTN SME 1GB
     */
    planName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    /**
     * Data Plan Type
     */
    planType: {
      type: String,
      trim: true,
      uppercase: true,
      enum: ["SME", "CORPORATE", "CG", "DIRECT", "GIFTING"],
      default: "SME",
    },

    /**
     * Data Amount Sold (GB)
     */
    dataAmountGB: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Data amount cannot be negative"],
      index: true,
    },

    /**
     * Transaction Amount
     */
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
      index: true,
    },

    /**
     * Agent Profit
     */
    agentCommission: {
      type: Number,
      default: 0,
      min: [0, "Commission cannot be negative"],
    },

    /**
     * Supervisor Bonus
     */
    supervisorCommission: {
      type: Number,
      default: 0,
      min: [0, "Commission cannot be negative"],
    },

    /**
     * Sale Status
     */
    status: {
      type: String,
      enum: ["success", "pending", "failed", "refunded", "reversed"],
      default: "success",
      index: true,
    },

    /**
     * Linked Transaction
     */
    transactionRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
      index: true,
    },

    /**
     * External Provider Reference
     */
    providerReference: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    /**
     * Recipient Phone Number
     */
    recipientPhone: {
      type: String,
      trim: true,
      default: null,
    },

    /**
     * Device IP Address
     */
    ipAddress: {
      type: String,
      default: null,
    },

    /**
     * Device/User Agent
     */
    userAgent: {
      type: String,
      default: null,
    },

    /**
     * Additional Metadata
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
SaleSchema.index({
  supervisorId: 1,
  createdAt: -1,
});

SaleSchema.index({
  agentId: 1,
  createdAt: -1,
});

SaleSchema.index({
  status: 1,
  createdAt: -1,
});

SaleSchema.index({
  networkName: 1,
  createdAt: -1,
});

SaleSchema.index({
  dataAmountGB: 1,
  amount: 1,
});

SaleSchema.index({
  providerReference: 1,
});

/**
 * Auto formatting
 */
SaleSchema.pre("save", function (next) {
  if (this.networkName) {
    this.networkName = this.networkName.trim().toUpperCase();
  }

  if (this.planType) {
    this.planType = this.planType.trim().toUpperCase();
  }

  if (this.planName) {
    this.planName = this.planName.trim();
  }

  next();
});

module.exports = mongoose.model("Sale", SaleSchema);
