const mongoose = require("mongoose");

const DataPlanSchema = new mongoose.Schema(
  {
    /**
     * Network Name
     */
    networkName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      enum: ["MTN", "GLO", "AIRTEL", "9MOBILE"],
      index: true,
    },

    /**
     * Provider Network ID
     */
    networkId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    /**
     * External Provider Plan Code
     */
    planCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    /**
     * Plan Display Label
     * Example:
     * 1GB SME
     * 2GB Corporate
     */
    planLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    /**
     * Data Size in GB
     */
    sizeGB: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Data size cannot be negative"],
    },

    /**
     * Plan Category
     */
    planType: {
      type: String,
      trim: true,
      uppercase: true,
      enum: ["SME", "CORPORATE", "GIFTING", "CG", "DIRECT"],
      default: "SME",
      index: true,
    },

    /**
     * Validity Period
     * Example:
     * 1 Day
     * 7 Days
     * 30 Days
     */
    validity: {
      type: String,
      trim: true,
      default: "30 Days",
    },

    /**
     * Retail User Price
     */
    userPrice: {
      type: Number,
      required: true,
      min: [0, "User price cannot be negative"],
    },

    /**
     * Agent Discounted Price
     */
    agentPrice: {
      type: Number,
      required: true,
      min: [0, "Agent price cannot be negative"],
    },

    /**
     * Purchase Cost Price
     */
    costPrice: {
      type: Number,
      default: 0,
      min: [0, "Cost price cannot be negative"],
    },

    /**
     * Plan Availability
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * Recommended Plan
     */
    isPopular: {
      type: Boolean,
      default: false,
    },

    /**
     * Plan Sort Order
     */
    sortOrder: {
      type: Number,
      default: 0,
    },

    /**
     * Admin Notes
     */
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    /**
     * Extra Provider Metadata
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
 * Compound Indexes
 */
DataPlanSchema.index({
  networkId: 1,
  planCode: 1,
});

DataPlanSchema.index({
  networkName: 1,
  isActive: 1,
});

DataPlanSchema.index({
  planType: 1,
  isActive: 1,
});

DataPlanSchema.index({
  sizeGB: 1,
  userPrice: 1,
});

/**
 * Prevent duplicate plans
 */
DataPlanSchema.index(
  {
    networkId: 1,
    planCode: 1,
  },
  {
    unique: true,
  },
);

/**
 * Auto formatting
 */
DataPlanSchema.pre("save", function (next) {
  if (this.networkName) {
    this.networkName = this.networkName.trim().toUpperCase();
  }

  if (this.planType) {
    this.planType = this.planType.trim().toUpperCase();
  }

  if (this.planCode) {
    this.planCode = this.planCode.trim();
  }

  if (this.networkId) {
    this.networkId = this.networkId.trim();
  }

  next();
});

module.exports = mongoose.model("DataPlan", DataPlanSchema);
