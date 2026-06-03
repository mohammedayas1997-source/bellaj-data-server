const User = require("../models/User");
const Transaction = require("../models/Transaction");
const axios = require("axios");

const APP_NAME = "Bellaj Data Hub";

const getPaystackHeaders = () => ({
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

exports.getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user?._id || req.user?.id).select(
      "walletBalance",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Wallet balance loaded successfully.",
      balance: user.walletBalance || 0,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

exports.generateVirtualAccount = async (req, res) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured.",
      });
    }

    const user = await User.findById(req.user?._id || req.user?.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (user.accountNumber && user.bankName) {
      return res.status(200).json({
        success: true,
        message: "Virtual account already exists.",
        data: {
          accountNumber: user.accountNumber,
          bankName: user.bankName,
          accountName: user.accountName,
        },
      });
    }

    const customerResponse = await axios.post(
      "https://api.paystack.co/customer",
      {
        email: user.email,
        first_name: user.firstName,
        last_name: user.surname,
        phone: user.phone,
      },
      getPaystackHeaders(),
    );

    const customerCode = customerResponse.data?.data?.customer_code;

    const accountResponse = await axios.post(
      "https://api.paystack.co/dedicated_account",
      {
        customer: customerCode,
        preferred_bank: "wema-bank",
      },
      getPaystackHeaders(),
    );

    const bankData = accountResponse.data?.data;

    user.paystackCustomerCode = customerCode;
    user.accountNumber = bankData.account_number;
    user.bankName = bankData.bank?.name || "Wema Bank";
    user.accountName = bankData.account_name;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Bellaj virtual account generated successfully.",
      data: {
        accountNumber: user.accountNumber,
        bankName: user.bankName,
        accountName: user.accountName,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        error.response?.data?.message || "Failed to generate virtual account.",
    });
  }
};

exports.initializePayment = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured.",
      });
    }

    const user = await User.findById(req.user?._id || req.user?.id);

    const amountNumber = Number(amount);

    if (Number.isNaN(amountNumber) || amountNumber < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum funding amount is ₦100.",
      });
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: Math.round(amountNumber * 100),
        metadata: {
          userId: user._id,
          app: APP_NAME,
        },
        callback_url: `${process.env.FRONTEND_URL}/wallet/verify`,
      },
      getPaystackHeaders(),
    );

    return res.status(200).json({
      success: true,
      message: "Payment initialized successfully.",
      data: response.data.data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Payment initialization failed.",
      error: error.message,
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    const alreadyProcessed = await Transaction.findOne({ reference });

    if (alreadyProcessed) {
      return res.status(400).json({
        success: false,
        message: "Transaction already processed.",
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    if (response.data?.data?.status === "success") {
      const amountInNaira = response.data.data.amount / 100;
      const userId = response.data.data.metadata?.userId;

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: amountInNaira } },
        { new: true },
      );

      await Transaction.create({
        user: userId,
        type: "deposit",
        category: "wallet_funding",
        amount: amountInNaira,
        status: "success",
        reference,
        details: `${APP_NAME} wallet funding via Paystack App`,
        metadata: response.data.data,
      });

      return res.status(200).json({
        success: true,
        message: "Wallet funded successfully.",
        balance: updatedUser.walletBalance,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Payment was not successful.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Payment verification error.",
      error: error.message,
    });
  }
};

exports.fundWalletManual = async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      success: false,
      message: "Manual funding is not allowed in production.",
    });
  }

  try {
    const { amount } = req.body;
    const amountNumber = Number(amount);

    if (Number.isNaN(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number.",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user?._id || req.user?.id,
      { $inc: { walletBalance: amountNumber } },
      { new: true },
    );

    await Transaction.create({
      user: user._id,
      type: "manual_funding",
      category: "wallet_funding",
      amount: amountNumber,
      status: "success",
      reference: `BELLAJ_MANUAL_${Date.now()}`,
      details: "Manual test wallet funding.",
    });

    return res.status(200).json({
      success: true,
      message: "Simulated funding successful.",
      newBalance: user.walletBalance,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};
