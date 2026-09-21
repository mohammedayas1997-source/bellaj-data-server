const User = require("../models/User");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

let Transaction;
try {
  Transaction = require("../models/Transaction");
} catch (e) {
  Transaction = null;
}

const APP_NAME = "Bellaj Data Hub";
const APP_LOGIN_URL =
  process.env.FRONTEND_LOGIN_URL || "https://bellaj-data-hub.com/login";

const generateReferralId = (firstName, surname) => {
  const firstInitial = firstName ? firstName[0] : "B";
  const lastInitial = surname ? surname[0] : "D";
  const initials = (firstInitial + lastInitial).toUpperCase();
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${initials}${digits}`;
};

const sendWelcomeEmail = async (user) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"${APP_NAME}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Welcome to ${APP_NAME}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #0B5E3C; padding: 22px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">BELLAJ DATA HUB</h1>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <h2 style="color: #121212;">Welcome, ${user.firstName || user.name}!</h2>
            <p style="color: #475569; line-height: 1.6;">
              Your account has been created successfully. You can now access affordable data, airtime, and bill payment services.
            </p>
            <div style="background-color: #F8FAFC; border-left: 4px solid #0B5E3C; padding: 20px; margin: 25px 0;">
              <h3 style="color: #0B5E3C; margin-top: 0; font-size: 16px;">VIRTUAL FUNDING ACCOUNT</h3>
              <p style="margin: 8px 0; color: #1e293b;"><strong>BANK:</strong> ${user.bankName || "Wema Bank"}</p>
              <p style="margin: 8px 0; color: #1e293b;"><strong>ACCOUNT NUMBER:</strong> <span style="font-size: 18px; color: #0B5E3C; font-weight: bold;">${user.accountNumber || "Generating..."}</span></p>
              <p style="margin: 8px 0; color: #1e293b;"><strong>ACCOUNT NAME:</strong> ${user.accountName || user.name}</p>
            </div>
            <div style="text-align: center; margin-top: 30px;">
              <a href="${APP_LOGIN_URL}" style="background-color: #0B5E3C; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                LOGIN TO DASHBOARD
              </a>
            </div>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("[Email Dispatch Error]:", error.message);
  }
};

const sendToken = (user, statusCode, res) => {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || "fallback_secret",
    { expiresIn: "30d" }
  );

  const resolvedRole = String(user.role || "user").toLowerCase().trim();

  // Tabbatar da matsayin Transaction PIN (Duba ko an riga an saita wanda ba 0000 ko fanko ba)
  const rawPin = String(user.pin || "").trim();
  const isPinConfigured = Boolean(
    rawPin &&
    rawPin !== "0000" &&
    rawPin !== "" &&
    (user.isPinSet === true || user.pin_set === true || user.has_transaction_pin === true || rawPin.length === 4)
  );

  const userPayload = {
    id: user._id,
    _id: user._id,
    name: user.name || `${user.firstName || ""} ${user.surname || ""}`.trim(),
    firstName: user.firstName,
    surname: user.surname,
    email: user.email,
    phone: user.phone,
    walletBalance: user.walletBalance || user.balance || 0,
    balance: user.walletBalance || user.balance || 0,
    role: resolvedRole,
    referralId: user.referralId,
    accountNumber: user.accountNumber || "Generating...",
    bankName: user.bankName || "Wema Bank",
    accountName: user.accountName || user.name,
    state: user.state,
    lga: user.lga,
    address: user.address,
    businessAddress: user.businessAddress,
    assignedSupervisor: user.assignedSupervisor,
    // Tutar kariya ga LoginScreen da SetupPin:
    isPinSet: isPinConfigured,
    hasPin: isPinConfigured,
    has_transaction_pin: isPinConfigured,
    pin_set: isPinConfigured,
  };

  res.status(statusCode).json({
    success: true,
    message: `${APP_NAME} authentication successful`,
    token,
    role: resolvedRole,
    isPinSet: isPinConfigured,
    hasPin: isPinConfigured,
    user: userPayload,
    data: { user: userPayload, token, role: resolvedRole, isPinSet: isPinConfigured },
  });
};

const createDedicatedAccount = async (user) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return null;

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  };

  const customerResponse = await axios.post(
    "https://api.paystack.co/customer",
    {
      email: user.email,
      first_name: user.firstName || "Customer",
      last_name: user.surname || "User",
      phone: user.phone,
    },
    axiosConfig
  );

  const customerCode = customerResponse.data?.data?.customer_code;
  if (!customerCode) return null;

  const accountResponse = await axios.post(
    "https://api.paystack.co/dedicated_account",
    {
      customer: customerCode,
      preferred_bank: "wema-bank",
    },
    axiosConfig
  );

  const bankData = accountResponse.data?.data;
  if (!bankData) return null;

  return await User.findByIdAndUpdate(
    user._id,
    {
      paystackCustomerCode: customerCode,
      bankName: bankData.bank?.name || "Wema Bank",
      accountNumber: bankData.account_number,
      accountName: bankData.account_name,
    },
    { new: true }
  );
};

// ==========================================
// 1. UNIVERSAL AUTHENTICATOR (PASSWORD MATCHER)
// ==========================================
const verifyCredentials = async (inputPassword, storedHash, userModelInstance) => {
  if (!storedHash || !inputPassword) return false;

  const raw = String(inputPassword).trim();
  const target = String(storedHash).trim();

  // 1. Gwada da bcrypt na asali
  try {
    const directMatch = await bcrypt.compare(raw, target);
    if (directMatch) return true;
  } catch {}

  // 2. Gwada da instance method idan yana wanzu a User model
  if (userModelInstance && typeof userModelInstance.matchPassword === "function") {
    try {
      const methodMatch = await userModelInstance.matchPassword(raw);
      if (methodMatch) return true;
    } catch {}
  }

  // 3. Fallback: idan kalmar sirrin ta shiga a matsayin plain text ba tare da hash ba
  if (raw === target) {
    const salt = await bcrypt.genSalt(10);
    userModelInstance.password = await bcrypt.hash(raw, salt);
    await userModelInstance.save({ validateBeforeSave: false }).catch(() => null);
    return true;
  }

  return false;
};

// ==========================================
// 2. AUTH CONTROLLERS
// ==========================================

exports.register = async (req, res) => {
  try {
    const {
      firstName,
      surname,
      otherName,
      name,
      email,
      phone,
      password,
      role,
      state,
      lga,
      address,
      businessAddress,
      supervisorCode,
      referralCode,
      businessImage,
      profileImage,
    } = req.body;

    if (!firstName || !surname || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, surname, email, phone, and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    const userExists = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: cleanPhone }],
    });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number already registered.",
      });
    }

    let referralId;
    const finalRole = String(role || "user").toLowerCase().trim();

    if (finalRole === "supervisor" || finalRole === "agent") {
      referralId = generateReferralId(firstName, surname);
    }

    let assignedSupervisorId = undefined;
    const refCode = (supervisorCode || referralCode || "").trim();

    if (refCode) {
      const supervisorMatch = await User.findOne({
        $or: [{ referralId: refCode }, { referralCode: refCode }, { phone: refCode }],
        role: { $in: ["supervisor", "leader", "admin"] },
      });
      if (supervisorMatch) {
        assignedSupervisorId = supervisorMatch._id;
      }
    }

    const user = await User.create({
      firstName: firstName.trim(),
      surname: surname.trim(),
      name: (name || `${firstName} ${surname}`).trim(),
      otherName: otherName ? otherName.trim() : "",
      email: normalizedEmail,
      phone: cleanPhone,
      password,
      role: finalRole,
      referralId,
      state: state ? state.trim() : "",
      lga: lga ? lga.trim() : "",
      address: address ? address.trim() : "",
      businessAddress: businessAddress ? businessAddress.trim() : (address || ""),
      assignedSupervisor: assignedSupervisorId,
      supervisorCode: refCode,
      profileImage: profileImage || businessImage || "",
      walletBalance: 0,
      status: "active",
      isSuspended: false,
      pin: "0000",
      isPinSet: false,
      has_transaction_pin: false,
      pin_set: false,
    });

    try {
      const updatedUser = await createDedicatedAccount(user);
      if (updatedUser) {
        sendWelcomeEmail(updatedUser);
        return sendToken(updatedUser, 201, res);
      }
    } catch (paystackError) {
      console.error(
        "Paystack Account Error:",
        paystackError.response?.data?.message || paystackError.message
      );
    }

    const fallbackUser = await User.findByIdAndUpdate(
      user._id,
      {
        bankName: "Wema Bank",
        accountNumber: "Generating...",
        accountName: `${user.firstName} ${user.surname}`.toUpperCase(),
      },
      { new: true }
    );

    sendWelcomeEmail(fallbackUser);
    return sendToken(fallbackUser, 201, res);
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Registration failed.",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please enter your email and password.",
      });
    }

    const cleanIdentifier = String(email).toLowerCase().trim();

    const user = await User.findOne({
      $or: [{ email: cleanIdentifier }, { phone: cleanIdentifier }],
    }).select("+password +pin");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email address or password.",
      });
    }

    const isMatch = await verifyCredentials(password, user.password, user);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email address or password.",
      });
    }

    if (user.isSuspended || user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended. Please contact administrator.",
      });
    }

    return sendToken(user, 200, res);
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Server login error. Please try again.",
    });
  }
};

exports.supervisorLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please enter your supervisor credentials.",
      });
    }

    const cleanIdentifier = String(email).toLowerCase().trim();

    const user = await User.findOne({
      $or: [{ email: cleanIdentifier }, { phone: cleanIdentifier }],
      role: { $in: ["supervisor", "leader", "admin"] },
    }).select("+password +pin");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized supervisor account or incorrect credentials.",
      });
    }

    const isMatch = await verifyCredentials(password, user.password, user);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid supervisor credentials.",
      });
    }

    if (user.isSuspended || user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Supervisor terminal access is suspended. Contact admin.",
      });
    }

    return sendToken(user, 200, res);
  } catch (error) {
    console.error("Supervisor Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Supervisor gateway authentication failed.",
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide your registered email address.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email address.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordOtp = otp;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: `"${APP_NAME} Security" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `Your Password Reset OTP - ${APP_NAME}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="background-color: #0B5E3C; padding: 15px; border-radius: 8px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0;">${APP_NAME}</h2>
            </div>
            <div style="padding: 20px 10px; color: #1e293b;">
              <p>Hello <strong>${user.firstName || "User"}</strong>,</p>
              <p>You requested to reset your password. Use the 6-digit OTP code below to verify your request:</p>
              <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <span style="font-size: 28px; font-weight: 900; letter-spacing: 6px; color: #0B5E3C;">${otp}</span>
              </div>
              <p style="font-size: 13px; color: #64748b;">This code will expire in 15 minutes. If you did not request a password reset, please ignore this email.</p>
            </div>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
    }

    return res.status(200).json({
      success: true,
      message: "A 6-digit password reset OTP has been sent to your email.",
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process forgot password request.",
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP code, and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({
      email: normalizedEmail,
      resetPasswordOtp: String(otp).trim(),
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP code. Please request a new one.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(String(newPassword).trim(), salt);
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: "Password reset successful! You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password.",
    });
  }
};

exports.paystackWebhook = async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (secret) {
      const hash = crypto
        .createHmac("sha512", secret)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (hash !== req.headers["x-paystack-signature"]) {
        return res.status(400).json({ message: "Invalid webhook signature" });
      }
    }

    const event = req.body;

    if (event.event === "charge.success") {
      const { customer, amount, reference } = event.data;
      const creditValue = amount / 100;

      const user = await User.findOneAndUpdate(
        { email: customer.email.toLowerCase() },
        { $inc: { walletBalance: creditValue } },
        { new: true }
      );

      if (user && Transaction) {
        await Transaction.create({
          user: user._id,
          type: "CREDIT",
          service: "WALLET_FUNDING",
          amount: creditValue,
          status: "success",
          reference: reference || `DEP_${Date.now()}`,
          narration: `Automated Paystack Virtual Funding: ₦${creditValue.toLocaleString()}`,
        }).catch(() => null);
      }
    }

    res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Paystack Webhook Error:", error.message);
    res.status(500).json({ status: "failed" });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id || req.user._id).select("+password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const isMatch = await verifyCredentials(currentPassword, user.password, user);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password does not match.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(String(newPassword).trim(), salt);
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. TRANSACTION PIN LIFECYCLE (STATUS, SET & UPDATE)
// ==========================================

/**
 * @desc    Get Transaction PIN Status (Has PIN or Needs Setup)
 * @route   GET /api/v1/user/pin-status ko /api/v1/users/pin-status
 * @access  Private
 */
exports.getPinStatus = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId).select("+pin");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const rawPin = String(user.pin || "").trim();
    const hasPin = Boolean(
      rawPin &&
      rawPin !== "0000" &&
      rawPin !== "" &&
      (user.isPinSet === true || user.pin_set === true || user.has_transaction_pin === true || rawPin.length === 4)
    );

    return res.status(200).json({
      success: true,
      hasPin,
      isPinSet: hasPin,
      has_transaction_pin: hasPin,
      pin_set: hasPin,
      message: hasPin ? "PIN is configured" : "PIN setup required",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Set Initial Transaction PIN (Dole ga sabon mai amfani a SetupPinScreen)
 * @route   POST /api/v1/user/set-pin ko /api/v1/auth/set-pin
 * @access  Private
 */
exports.setPin = async (req, res) => {
  try {
    const { pin, transactionPin } = req.body;
    const targetPin = String(pin || transactionPin || "").trim();

    if (!targetPin || targetPin.length !== 4 || !/^\d{4}$/.test(targetPin)) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must be exactly 4 digits.",
      });
    }

    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId).select("+pin");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Saka PIN tare da canza tutocin tsaro
    user.pin = targetPin;
    user.has_transaction_pin = true;
    user.pin_set = true;
    user.isPinSet = true;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: "Transaction PIN configured successfully.",
      hasPin: true,
      isPinSet: true,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Change / Update Existing Transaction PIN
 * @route   POST /api/v1/user/change-pin ko /api/v1/users/change-pin
 * @access  Private
 */
exports.changePin = async (req, res) => {
  try {
    const { oldPin, currentPin, newPin, pin, transactionPin } = req.body;
    const resolvedOldPin = String(oldPin || currentPin || "").trim();
    const resolvedNewPin = String(newPin || pin || transactionPin || "").trim();

    if (!resolvedNewPin || resolvedNewPin.length !== 4 || !/^\d{4}$/.test(resolvedNewPin)) {
      return res.status(400).json({
        success: false,
        message: "New transaction PIN must be exactly 4 digits.",
      });
    }

    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId).select("+pin");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Idan mai amfani yana da tsohon PIN wanda ba 0000 ba, tabbatar da shi
    const existingPin = String(user.pin || "").trim();
    if (existingPin && existingPin !== "0000" && existingPin !== "") {
      if (!resolvedOldPin) {
        return res.status(400).json({
          success: false,
          message: "Current 4-digit transaction PIN is required.",
        });
      }

      let isOldPinMatch = resolvedOldPin === existingPin;
      if (!isOldPinMatch && typeof user.matchPin === "function") {
        try {
          isOldPinMatch = await user.matchPin(resolvedOldPin);
        } catch {}
      }

      if (!isOldPinMatch) {
        return res.status(401).json({
          success: false,
          message: "Incorrect current transaction PIN.",
        });
      }
    }

    user.pin = resolvedNewPin;
    user.has_transaction_pin = true;
    user.pin_set = true;
    user.isPinSet = true;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: "Transaction PIN updated successfully.",
      hasPin: true,
      isPinSet: true,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePin = async (req, res) => {
  return exports.changePin(req, res);
};

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id).select("-password").lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    const rawPin = String(user.pin || "").trim();
    const hasPin = Boolean(
      rawPin &&
      rawPin !== "0000" &&
      rawPin !== "" &&
      (user.isPinSet === true || user.pin_set === true || user.has_transaction_pin === true || rawPin.length === 4)
    );

    const userPayload = {
      ...user,
      hasPin,
      isPinSet: hasPin,
      has_transaction_pin: hasPin,
      pin_set: hasPin,
    };

    res.status(200).json({
      success: true,
      user: userPayload,
      data: { user: userPayload },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};