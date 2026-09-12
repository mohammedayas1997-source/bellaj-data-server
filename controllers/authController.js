const User = require("../models/User");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

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
            <h2 style="color: #121212;">Welcome, ${user.firstName}!</h2>
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
    { expiresIn: "30d" },
  );

  const userPayload = {
    id: user._id,
    _id: user._id,
    name: user.name,
    firstName: user.firstName,
    surname: user.surname,
    email: user.email,
    phone: user.phone,
    walletBalance: user.walletBalance || 0,
    balance: user.walletBalance || 0,
    role: user.role,
    referralId: user.referralId,
    accountNumber: user.accountNumber || "Generating...",
    bankName: user.bankName || "Wema Bank",
    accountName: user.accountName || user.name,
    state: user.state,
    lga: user.lga,
    address: user.address,
    businessAddress: user.businessAddress,
    assignedSupervisor: user.assignedSupervisor,
  };

  res.status(statusCode).json({
    success: true,
    message: `${APP_NAME} authentication successful`,
    token,
    role: user.role,
    user: userPayload,
    data: { user: userPayload },
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
      first_name: user.firstName,
      last_name: user.surname,
      phone: user.phone,
    },
    axiosConfig,
  );

  const customerCode = customerResponse.data.data.customer_code;

  const accountResponse = await axios.post(
    "https://api.paystack.co/dedicated_account",
    {
      customer: customerCode,
      preferred_bank: "wema-bank",
    },
    axiosConfig,
  );

  const bankData = accountResponse.data.data;

  return await User.findByIdAndUpdate(
    user._id,
    {
      paystackCustomerCode: customerCode,
      bankName: bankData.bank.name || "Wema Bank",
      accountNumber: bankData.account_number,
      accountName: bankData.account_name,
    },
    { new: true },
  );
};

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

    // Neman supervisor idan agent ya saka referral code
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
    });

    // Kirkirar Dedicated Account ba tare da toshe martanin rajista ba
    try {
      const updatedUser = await createDedicatedAccount(user);
      if (updatedUser) {
        sendWelcomeEmail(updatedUser);
        return sendToken(updatedUser, 201, res);
      }
    } catch (paystackError) {
      console.error(
        "Paystack Account Error:",
        paystackError.response?.data?.message || paystackError.message,
      );
    }

    const fallbackUser = await User.findByIdAndUpdate(
      user._id,
      {
        bankName: "Wema Bank",
        accountNumber: "Generating...",
        accountName: `${user.firstName} ${user.surname}`.toUpperCase(),
      },
      { new: true },
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

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email address or password.",
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

// TSARO: Paystack Webhook mai tantancewa (HMAC SHA512)
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
        { new: true },
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
    const user = await User.findById(req.user.id).select("+password");

    if (!user || !(await user.matchPassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: "Current password does not match.",
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePin = async (req, res) => {
  try {
    const { newPin } = req.body;

    if (!newPin || String(newPin).length !== 4) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must be exactly 4 digits.",
      });
    }

    await User.findByIdAndUpdate(req.user.id, {
      pin: newPin,
      has_transaction_pin: true,
      pin_set: true,
    });

    res.status(200).json({
      success: true,
      message: "Transaction PIN set successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password").lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    res.status(200).json({
      success: true,
      user,
      data: { user },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};