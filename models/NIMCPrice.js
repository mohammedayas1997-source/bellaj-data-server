const mongoose = require("mongoose");

const NIMCPriceSchema = new mongoose.Schema(
  {
    /**
     * NIMC Service Type
     */
    serviceType: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      enum: ["nin_verification", "nin_premium", "nin_search"],
      index: true,
    },

    /**
     * Service Price Amount
     */
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
      validate: {
        validator: Number.isFinite,
        message: "Amount must be a valid number",
      },
    },

    /**
     * Currency Code
     */
    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    /**
     * Service Availability
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * Admin/User who updated the price
     */
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /**
     * Optional Notes
     */
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    /**
     * Extra metadata
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
NIMCPriceSchema.index({
  serviceType: 1,
  isActive: 1,
});

/**
 * Auto-format service type
 */
NIMCPriceSchema.pre("save", function (next) {
  if (this.serviceType) {
    this.serviceType = this.serviceType.trim().toLowerCase();
  }

  next();
});

module.exports = mongoose.model("NIMCPrice", NIMCPriceSchema);
