const mongoose = require("mongoose");

const NIMCRequestSchema = new mongoose.Schema(
  {
    /**
     * User requesting NIMC service
     */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * NIMC Service Type
     * Examples:
     * nin_verification
     * modification
     * renewal
     * nin_search
     */
    serviceType: {
      type: String,
      required: [true, "Service type is required"],
      trim: true,
      lowercase: true,
      index: true,
    },

    /**
     * NIN Number
     */
    ninNumber: {
      type: String,
      required: [true, "NIN number is required"],
      trim: true,
      minlength: 11,
      maxlength: 11,
      index: true,
    },

    /**
     * Submitted Form Data
     */
    formData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },

    /**
     * Service Amount Charged
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
      enum: ["pending", "processing", "completed", "rejected", "failed"],
      default: "pending",
      index: true,
    },

    /**
     * Uploaded Slip URL
     */
    slipUrl: {
      type: String,
      default: null,
      trim: true,
    },

    /**
     * Provider Name
     */
    provider: {
      type: String,
      default: "bellaj-nimc",
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
     * Linked Transaction
     */
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },

    /**
     * Admin handling request
     */
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /**
     * Resolution Timestamp
     */
    resolvedAt: {
      type: Date,
      default: null,
    },

    /**
     * Admin Remarks
     */
    adminNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    /**
     * Failure/Error Message
     */
    errorMessage: {
      type: String,
      trim: true,
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
NIMCRequestSchema.index({
  user: 1,
  createdAt: -1,
});

NIMCRequestSchema.index({
  status: 1,
  createdAt: -1,
});

NIMCRequestSchema.index({
  serviceType: 1,
  status: 1,
});

NIMCRequestSchema.index({
  ninNumber: 1,
  createdAt: -1,
});

/**
 * Auto-format fields
 */
NIMCRequestSchema.pre("save", function (next) {
  if (this.ninNumber) {
    this.ninNumber = this.ninNumber.trim();
  }

  if (this.serviceType) {
    this.serviceType = this.serviceType.trim().toLowerCase();
  }

  if (this.provider) {
    this.provider = this.provider.trim().toLowerCase();
  }

  next();
});

module.exports = mongoose.model("NIMCRequest", NIMCRequestSchema);
