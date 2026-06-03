const User = require("../models/User");
const Transaction = require("../models/Transaction");
const crypto = require("crypto");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Paystack Webhook Handler
 * @route   POST /api/v1/payments/paystack/webhook
 * @access  Public (Paystack)
 */
exports.handlePaystackWebhook = async (req, res) => {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      console.error("Bellaj Paystack secret key missing");
      return res.status(500).send("Webhook configuration error");
    }

    /**
     * Verify Paystack Signature
     */
    const hash = crypto
      .createHmac("sha512", secretKey)
      .update(JSON.stringify(req.body))
      .digest("hex");

    const paystackSignature = req.headers["x-paystack-signature"];

    if (hash !== paystackSignature) {
      console.error("Invalid Paystack signature");

      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    console.log(`[Bellaj Webhook] Event Received: ${event.event}`);

    /**
     * Handle Successful Funding
     */
    if (event.event === "charge.success") {
      const { amount, reference, customer, paid_at, channel } = event.data;

      const email = customer?.email;

      if (!email || !reference) {
        return res.status(200).send("Invalid webhook payload");
      }

      /**
       * Prevent Double Funding
       */
      const existingTransaction = await Transaction.findOne({
        reference,
      });

      if (existingTransaction) {
        console.log(
          `[Bellaj Webhook] Transaction already processed: ${reference}`,
        );

        return res.status(200).send("Transaction already processed");
      }

      const fundingAmount = Number(amount) / 100;

      /**
       * Atomic Wallet Update
       */
      const user = await User.findOneAndUpdate(
        {
          email: email.toLowerCase().trim(),
        },
        {
          $inc: {
            walletBalance: fundingAmount,
          },
        },
        {
          new: true,
        },
      );

      if (!user) {
        console.error(`[Bellaj Webhook] User not found for email ${email}`);

        return res.status(200).send("User not found");
      }

      /**
       * Save Transaction Record
       */
      await Transaction.create({
        user: user._id,
        type: "wallet_funding",
        amount: fundingAmount,
        status: "success",
        reference,

        details: `${APP_NAME} wallet funding via Paystack`,

        metadata: {
          provider: "Paystack",
          paymentChannel: channel,
          paidAt: paid_at,
          customerEmail: email,
        },
      });

      console.log(
        `[Bellaj Wallet Funding] ${email} credited ₦${fundingAmount}`,
      );
    }

    /**
     * Handle Successful Transfer (Optional)
     */
    if (event.event === "transfer.success") {
      console.log(
        `[Bellaj Transfer Success] Reference: ${event.data.reference}`,
      );
    }

    /**
     * Handle Failed Transfer (Optional)
     */
    if (event.event === "transfer.failed") {
      console.log(
        `[Bellaj Transfer Failed] Reference: ${event.data.reference}`,
      );
    }

    return res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Bellaj Paystack Webhook Error:", error.message);

    /**
     * Always acknowledge webhook
     * to avoid Paystack retries
     */
    return res.status(200).send("Webhook acknowledged");
  }
};

/**
 * @desc    Manual Paystack Verification
 * @route   GET /api/v1/payments/verify/:reference
 * @access  Private
 */
exports.verifyPaymentReference = async (req, res) => {
  try {
    const { reference } = req.params;

    const transaction = await Transaction.findOne({
      reference,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Transaction verified successfully",
      data: transaction,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
