const mongoose = require("mongoose");

const DataPlanSchema = new mongoose.Schema(
  {
    /**
     * Network Name (e.g. MTN, GLO, AIRTEL, 9MOBILE)
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
     * Provider Network ID (e.g. "1", "2", "3", "4")
     */
    networkId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    /**
     * Gateway / Provider Plan ID (e.g. 140, 27, 262)
     */
    planId: {
      type: String,
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
     * Plan Display Label / Name (e.g. MTN 1.0GB DC (30D))
     */
    planLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    /**
     * Data Size in GB (Numeric for calculations)
     */
    sizeGB: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Data size cannot be negative"],
    },

    /**
     * Human-Readable Volume (e.g. "500 MB", "1.0 GB", "2.0 GB")
     */
    volume: {
      type: String,
      trim: true,
      default: "1.0 GB",
    },

    /**
     * Plan Category / Type (Fadadadde don daukar nau'o'in gateway duka)
     */
    planType: {
      type: String,
      trim: true,
      uppercase: true,
      enum: [
        "SME",
        "SME2",
        "CORPORATE",
        "CG",
        "DC",
        "DIRECT",
        "GIFTING",
        "AWOOF",
        "DATASHARE",
        "CUSTOM",
      ],
      default: "DC",
      index: true,
    },

    /**
     * Validity Period (e.g. 1 Day, 7 Days, 30 Days)
     */
    validity: {
      type: String,
      trim: true,
      default: "30 Days",
    },

    /**
     * Retail User / Customer Selling Price
     */
    userPrice: {
      type: Number,
      required: true,
      min: [0, "User price cannot be negative"],
    },

    customerPrice: {
      type: Number,
      min: [0, "Customer price cannot be negative"],
    },

    /**
     * Agent Wholesale Discounted Price
     */
    agentPrice: {
      type: Number,
      required: true,
      min: [0, "Agent price cannot be negative"],
    },

    retailPrice: {
      type: Number,
      min: [0, "Retail price cannot be negative"],
    },

    /**
     * Purchase Cost Price from Gateway
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
     * Recommended / Popular Plan
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
     * Admin Notes & Extra Metadata
     */
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

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
 * Compound Indexes
 */
DataPlanSchema.index(
  {
    networkId: 1,
    planCode: 1,
  },
  {
    unique: true,
  }
);

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
 * Auto formatting and synchronization pre-save hook
 */
DataPlanSchema.pre("save", function (next) {
  if (this.networkName) {
    this.networkName = this.networkName.trim().toUpperCase();
  }

  if (this.planType) {
    this.planType = this.planType.trim().toUpperCase();
  }

  // Daidaita planId da planCode
  if (!this.planId && this.planCode) {
    this.planId = String(this.planCode).trim();
  }
  if (!this.planCode && this.planId) {
    this.planCode = String(this.planId).trim();
  }

  // Daidaita Farashin Customer da na User
  if (this.userPrice !== undefined && this.customerPrice === undefined) {
    this.customerPrice = this.userPrice;
  }
  if (this.customerPrice !== undefined && this.userPrice === undefined) {
    this.userPrice = this.customerPrice;
  }

  // Daidaita Farashin Agent da na Retail
  if (this.agentPrice !== undefined && this.retailPrice === undefined) {
    this.retailPrice = this.agentPrice;
  }
  if (this.retailPrice !== undefined && this.agentPrice === undefined) {
    this.agentPrice = this.retailPrice;
  }

  // Daidaita volume
  if (!this.volume && this.sizeGB) {
    this.volume = `${this.sizeGB} GB`;
  }

  next();
});

module.exports = mongoose.models.DataPlan || mongoose.model("DataPlan", DataPlanSchema);