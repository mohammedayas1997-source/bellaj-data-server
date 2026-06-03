const mongoose = require("mongoose");

const BVNPriceSchema = new mongoose.Schema(
  {
    /**
     * BVN Service Type
     */
    serviceType: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      enum: ["bvn_full", "bvn_basic", "bvn_face", "bvn_phone"],
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
     * Currency
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
     * Last Admin Update
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
  },
  {
    timestamps: true,
  },
);

/**
 * Performance Indexes
 */
BVNPriceSchema.index({
  serviceType: 1,
  isActive: 1,
});

/**
 * Auto-format service type
 */
BVNPriceSchema.pre("save", function (next) {
  if (this.serviceType) {
    this.serviceType = this.serviceType.trim().toLowerCase();
  }

  next();
});

module.exports = mongoose.model("BVNPrice", BVNPriceSchema);
