const User = require("../models/User");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const nodemailer = require("nodemailer");

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
          <div style="background-color: #E60000; padding: 22px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">BELLAJ DATA HUB</h1>
          </div>

          <div style="padding: 30px; background-color: #ffffff;">
            <h2 style="color: #121212;">Welcome, ${user.firstName}!</h2>

            <p style="color: #475569; line-height: 1.6;">
              Your Bellaj Data Hub account has been created successfully.
              You can now access affordable data, airtime, bill payments,
              wallet funding, and digital verification services.
            </p>

            <div style="background-color: #F8FAFC; border-left: 4px solid #0B5E3C; padding: 20px; margin: 25px 0;">
              <h3 style="color: #0B5E3C; margin-top: 0; font-size: 16px;">VIRTUAL WALLET FUNDING ACCOUNT</h3>

              <p style="margin: 8px 0; color: #1e293b;">
                <strong>BANK:</strong> ${user.bankName || "Wema Bank"}
              </p>

              <p style="margin: 8px 0; color: #1e293b;">
                <strong>ACCOUNT NUMBER:</strong>
                <span style="font-size: 18px; color: #E60000; letter-spacing: 1px;">
                  ${user.accountNumber || "Initialization Pending"}
                </span>
              </p>

              <p style="margin: 8px 0; color: #1e293b;">
                <strong>ACCOUNT NAME:</strong> ${user.accountName || user.name}
              </p>
            </div>

            <p style="color: #475569; font-size: 14px;">
              Fund your wallet through the account number above to begin using Bellaj Data Hub services.
            </p>

            <div style="text-align: center; margin-top: 35px;">
              <a href="${APP_LOGIN_URL}" style="background-color: #E60000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
                ACCESS BELLAJ DASHBOARD
              </a>
            </div>
          </div>

          <div style="background-color: #F8FAFC; padding: 20px; text-align: center; color: #64748B; font-size: 12px;">
            <p>&copy; 2026 Bellaj Data Hub. All Rights Reserved.</p>
            <p>Secure digital service infrastructure powered by Paystack & Wema.</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Bellaj Email] Welcome email sent to ${user.email}`);
  } catch (error) {
    console.error("[Bellaj Email Error]:", error.message);
  }
};

const sendToken = (user, statusCode, res) => {
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET || "fallback_secret",
    { expiresIn: "30d" },
  );

  const userPayload = {
    id: user._id,
    name: user.name,
    firstName: user.firstName,
    surname: user.surname,
    email: user.email,
    phone: user.phone,
    walletBalance: user.walletBalance || 0,
    balance: user.walletBalance || 0,
    role: user.role,
    referralId: user.referralId,
    accountNumber: user.accountNumber || "Initialization Pending",
    bankName: user.bankName || "Wema Bank",
    accountName: user.accountName || user.name,
    state: user.state,
    lga: user.lga,
    address: user.address,
  };

  res.status(statusCode).json({
    success: true,
    status: "success",
    message: `${APP_NAME} authentication successful`,
    token,
    role: user.role,
    user: userPayload,
    data: {
      user: userPayload,
    },
  });
};

exports.register = async (req, res) => {
  try {
    const {
      firstName,
      surname,
      otherName,
      email,
      phone,
      password,
      role,
      state,
      lga,
      address,
    } = req.body;

    if (!firstName || !surname || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "Registration failed: required fields are missing.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const userExists = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: phone.trim() }],
    });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number already exists.",
      });
    }

    let referralId;

    if (role === "supervisor" || role === "agent") {
      referralId = generateReferralId(firstName, surname);
    }

    const user = await User.create({
      firstName: firstName.trim(),
      surname: surname.trim(),
      name: `${firstName} ${surname}`.trim(),
      otherName: otherName ? otherName.trim() : "",
      email: normalizedEmail,
      phone: phone.trim(),
      password,
      role: role || "user",
      referralId,
      state,
      lga,
      address,
    });

    try {
      const updatedUser = await createDedicatedAccount(user);
      sendWelcomeEmail(updatedUser);

      return sendToken(updatedUser, 201, res);
    } catch (paystackError) {
      console.error(
        "Bellaj Paystack Provisioning Error:",
        paystackError.response?.data || paystackError.message,
      );

      const fallbackUser = await User.findByIdAndUpdate(
        user._id,
        {
          bankName: "Wema Bank",
          accountNumber: "Initialization Pending",
          accountName: `${user.firstName} ${user.surname}`.toUpperCase(),
        },
        { new: true },
      );

      sendWelcomeEmail(fallbackUser);
      return sendToken(fallbackUser, 201, res);
    }
  } catch (error) {
    console.error("Bellaj Registration Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server registration error.",
    });
  }
};

const createDedicatedAccount = async (user) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Paystack secret key is not configured.");
  }

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
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

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        status: "fail",
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        status: "fail",
        message: "Invalid email or password.",
      });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        status: "fail",
        message: "Invalid email or password.",
      });
    }

    return sendToken(user, 200, res);
  } catch (error) {
    console.error("Bellaj Login Error:", error);

    res.status(500).json({
      success: false,
      status: "error",
      message: "Authentication server error.",
    });
  }
};

exports.paystackWebhook = async (req, res) => {
  try {
    const event = req.body;

    if (event.event === "charge.success") {
      const { customer, amount } = event.data;
      const creditValue = amount / 100;

      await User.findOneAndUpdate(
        { email: customer.email },
        { $inc: { walletBalance: creditValue } },
      );

      console.log(
        `[Bellaj Funding] ${customer.email} credited with NGN ${creditValue}`,
      );
    }

    res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Bellaj Webhook Error:", error.message);
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
        message: "Current password is incorrect.",
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updatePin = async (req, res) => {
  try {
    const { newPin } = req.body;

    if (!newPin || String(newPin).length !== 4) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must be 4 digits.",
      });
    }

    await User.findByIdAndUpdate(req.user.id, {
      pin: newPin,
      has_transaction_pin: true,
      pin_set: true,
    });

    res.status(200).json({
      success: true,
      message: "Bellaj transaction PIN updated successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        status: "fail",
        message: "User not found.",
      });
    }

    res.status(200).json({
      success: true,
      status: "success",
      message: "Bellaj profile loaded successfully.",
      user,
      data: {
        user,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: "error",
      message: error.message,
    });
  }
};
