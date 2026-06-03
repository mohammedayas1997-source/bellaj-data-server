const crypto = require("crypto");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const APP_NAME = "Bellaj Data Hub";

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

    if (event.event === "charge.success") {
      const { amount, reference, metadata, customer } = event.data;

      const userId = metadata?.userId;
      const customerEmail = customer?.email;

      if (!reference) {
        return res.status(200).send("Missing transaction reference");
      }

      if (!userId && !customerEmail) {
        return res.status(200).send("No user identifier found in webhook");
      }

      const amountInNaira = Number(amount) / 100;

      const existingTransaction = await Transaction.findOne({
        reference,
      });

      if (existingTransaction) {
        return res.status(200).send("Transaction already processed");
      }

      const userQuery = userId
        ? { _id: userId }
        : { email: customerEmail.toLowerCase().trim() };

      const user = await User.findOneAndUpdate(
        userQuery,
        {
          $inc: {
            walletBalance: amountInNaira,
          },
        },
        {
          new: true,
        },
      );

      if (!user) {
        console.error(
          `Bellaj webhook user not found for reference: ${reference}`,
        );

        return res.status(200).send("User not found");
      }

      await Transaction.create({
        user: user._id,
        type: "deposit",
        category: "wallet_funding",
        amount: amountInNaira,
        status: "success",
        reference,
        details: `${APP_NAME} wallet auto-funding via Paystack webhook`,
        metadata: {
          provider: "Paystack",
          customerEmail,
          paystackEvent: event.event,
          raw: event.data,
        },
      });

      console.log(
        `[Bellaj Webhook] Wallet funded for ${user.email} with ₦${amountInNaira}`,
      );
    }

    return res.status(200).send("Webhook received");
  } catch (error) {
    console.error("Bellaj Paystack Webhook Error:", error.message);

    return res.status(200).send("Webhook acknowledged");
  }
};
