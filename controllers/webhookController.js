const crypto = require("crypto");
const axios = require("axios");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const APP_NAME = "Bellaj Data Hub";

/**
 * Helper: Generating Paystack Dedicated Virtual Account
 * Za a iya kiran wannan daga registration ko lokacin da user ya nemi account
 */
const generateDedicatedAccount = async (userId) => {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      console.error("[Paystack] Secret key is missing in environment variables.");
      return null;
    }

    const user = await User.findById(userId);
    if (!user) return null;

    // Idan yana da account number riga, babu bukatar sake nema
    if (user.accountNumber && user.accountNumber !== "Generating..." && user.accountNumber !== "Initialization Pending") {
      return user;
    }

    const axiosConfig = {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    };

    let customerCode = user.paystackCustomerCode;

    // 1. Kirkiri Customer a Paystack idan bashi da customer_code
    if (!customerCode) {
      const customerRes = await axios.post(
        "https://api.paystack.co/customer",
        {
          email: user.email.toLowerCase().trim(),
          first_name: user.firstName || user.name.split(" ")[0] || "Bellaj",
          last_name: user.surname || user.name.split(" ")[1] || "User",
          phone: user.phone || "08000000000",
        },
        axiosConfig
      );

      customerCode = customerRes.data?.data?.customer_code;
      if (customerCode) {
        user.paystackCustomerCode = customerCode;
        await user.save();
      }
    }

    if (!customerCode) return null;

    // 2. Nemi Dedicated Virtual Account (Wema Bank ta Paystack)
    const accountRes = await axios.post(
      "https://api.paystack.co/dedicated_account",
      {
        customer: customerCode,
        preferred_bank: "wema-bank",
      },
      axiosConfig
    );

    const bankData = accountRes.data?.data;

    if (bankData?.account_number) {
      user.bankName = bankData.bank?.name || "Wema Bank";
      user.accountNumber = bankData.account_number;
      user.accountName = bankData.account_name || `${user.firstName} ${user.surname}`.toUpperCase();
      await user.save();
      console.log(`[Bellaj Paystack] Virtual Account created for ${user.email}: ${bankData.account_number}`);
      return user;
    }

    return user;
  } catch (error) {
    console.error("[Bellaj Account Gen Error]:", error?.response?.data?.message || error.message);
    return null;
  }
};

exports.generateDedicatedAccount = generateDedicatedAccount;

/**
 * Controller: Manual or App Triggered Account Generation
 * @route POST /api/v1/wallet/generate-account
 */
exports.requestAccountGeneration = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized request" });
    }

    const updatedUser = await generateDedicatedAccount(userId);

    if (updatedUser && updatedUser.accountNumber && updatedUser.accountNumber !== "Generating...") {
      return res.status(200).json({
        success: true,
        message: "Virtual bank account generated successfully",
        data: {
          bankName: updatedUser.bankName,
          accountNumber: updatedUser.accountNumber,
          accountName: updatedUser.accountName,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Virtual account setup initiated with Paystack. It will reflect shortly.",
      data: {
        bankName: "Wema Bank",
        accountNumber: "Generating...",
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: Paystack Webhook Handler
 * @route POST /api/v1/auth/paystack/webhook
 */
exports.handlePaystackWebhook = async (req, res) => {
  try {
    const secret =
      process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      console.error("Bellaj Paystack webhook secret is not configured.");
      return res.status(500).send("Webhook secret not configured");
    }

    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(401).send("Missing Paystack signature");
    }

    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== signature) {
      return res.status(401).send("Invalid Paystack signature");
    }

    const event = req.body;

    // 1. EVENT: Idan Paystack ya kammala bude Virtual Account a background
    if (event.event === "dedicated_account.assign.success") {
      const { customer, dedicated_account } = event.data;
      const customerEmail = customer?.email?.toLowerCase().trim();

      if (customerEmail && dedicated_account?.account_number) {
        await User.findOneAndUpdate(
          { email: customerEmail },
          {
            paystackCustomerCode: customer.customer_code,
            bankName: dedicated_account.bank?.name || "Wema Bank",
            accountNumber: dedicated_account.account_number,
            accountName: dedicated_account.account_name,
          }
        );
        console.log(`[Bellaj Webhook] Dedicated Account assigned to ${customerEmail}: ${dedicated_account.account_number}`);
      }

      return res.status(200).send("Account assignment processed");
    }

    // 2. EVENT: Idan kudi sun shigo (Deposit ta Virtual Account ko Online Checkout)
    if (event.event === "charge.success") {
      const { amount, reference, metadata, customer } = event.data;

      const userId = metadata?.userId;
      const customerEmail = customer?.email?.toLowerCase().trim();

      if (!reference) {
        return res.status(200).send("Missing transaction reference");
      }

      const existingTransaction = await Transaction.findOne({ reference });
      if (existingTransaction) {
        return res.status(200).send("Transaction already processed");
      }

      const amountInNaira = Number(amount) / 100;

      // Nemi mai asusun ta userId ko customer email ko kuma customer_code
      let userQuery = null;
      if (userId) {
        userQuery = { _id: userId };
      } else if (customerEmail) {
        userQuery = { email: customerEmail };
      } else if (customer?.customer_code) {
        userQuery = { paystackCustomerCode: customer.customer_code };
      }

      if (!userQuery) {
        return res.status(200).send("No user identifier found in webhook");
      }

      const user = await User.findOneAndUpdate(
        userQuery,
        {
          $inc: {
            walletBalance: amountInNaira,
          },
        },
        { new: true }
      );

      if (!user) {
        console.error(`Bellaj webhook user not found for reference: ${reference}`);
        return res.status(200).send("User not found");
      }

      await Transaction.create({
        user: user._id,
        userId: user._id,
        type: "deposit",
        category: "wallet_funding",
        amount: amountInNaira,
        status: "success",
        reference,
        details: `${APP_NAME} wallet auto-funding via Paystack bank transfer`,
        narration: `Virtual Bank Deposit: ₦${amountInNaira.toLocaleString()}`,
        metadata: {
          provider: "Paystack",
          customerEmail,
          paystackEvent: event.event,
          raw: event.data,
        },
      }).catch((err) => console.error("Transaction save error:", err.message));

      console.log(`[Bellaj Webhook] Wallet funded for ${user.email} with ₦${amountInNaira}`);
    }

    return res.status(200).send("Webhook received");
  } catch (error) {
    console.error("Bellaj Paystack Webhook Error:", error.message);
    return res.status(200).send("Webhook acknowledged");
  }
};