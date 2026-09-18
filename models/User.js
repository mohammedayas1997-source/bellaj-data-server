const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    surname: {
      type: String,
      required: [true, "Data Integrity Error: Surname is required"],
      trim: true,
    },

    firstName: {
      type: String,
      required: [true, "Data Integrity Error: First name is required"],
      trim: true,
    },

    otherName: {
      type: String,
      trim: true,
      default: "",
    },

    name: {
      type: String,
      index: true,
    },

    email: {
      type: String,
      required: [true, "Data Integrity Error: Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        "Protocol Error: Invalid email syntax provided",
      ],
    },

    phone: {
      type: String,
      required: [true, "Data Integrity Error: Phone number is required"],
      unique: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Security Error: Password hash is required"],
      minlength: 6,
      select: true,
    },

    walletBalance: {
      type: Number,
      default: 0.0,
      min: 0,
      set: (v) => Math.round(v * 100) / 100,
    },

    pin: {
      type: String,
      minlength: 4,
      maxlength: 64,
      default: "0000",
      select: false,
    },

    paystackCustomerCode: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
    },

    bankName: {
      type: String,
      default: "Wema Bank",
    },

    accountNumber: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
    },

    accountName: {
      type: String,
    },

    role: {
      type: String,
      enum: [
        "user",
        "agent",
        "supervisor",
        "leader",
        "admin",
        "superadmin",
        "support",
      ],
      default: "user",
    },

    assignedSupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    assignedLeader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    referralId: {
      type: String,
      unique: true,
      sparse: true,
    },

    isSuspended: {
      type: Boolean,
      default: false,
    },

    state: {
      type: String,
    },

    lga: {
      type: String,
    },

    address: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

UserSchema.pre("save", async function (next) {
  if (this.isModified("firstName") || this.isModified("surname")) {
    this.name = `${this.firstName} ${this.surname}`.toUpperCase().trim();
  }

  // KARIYA: Kar a sake yin hash idan kalmar sirri ta riga ta zama bcrypt hash ($2a$ ko $2b$)
  if (this.isModified("password")) {
    const isAlreadyHashed = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.password);
    if (!isAlreadyHashed) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  if (this.isModified("pin") && this.pin !== "0000") {
    const isPinHashed = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.pin);
    if (!isPinHashed) {
      const salt = await bcrypt.genSalt(10);
      this.pin = await bcrypt.hash(this.pin, salt);
    }
  }

  next();
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.matchPin = async function (enteredPin) {
  if (this.pin === "0000" && enteredPin === "0000") return true;
  return await bcrypt.compare(enteredPin, this.pin);
};

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);