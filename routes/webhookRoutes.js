const express = require("express");
const router = express.Router();

// 1. Shigo da controller
const webhookController = require("../controllers/webhookController");

// Kariya idan controller bai gama loading ba ko sunan function ya canja
const safeWebhookHandler = (req, res, next) => {
  const handler =
    webhookController.handlePaystackWebhook ||
    webhookController.paystackWebhook;

  if (typeof handler === "function") {
    return handler(req, res, next);
  }

  console.error(
    "[Webhook Error] 'handlePaystackWebhook' is not defined in webhookController.js"
  );
  return res.status(500).json({
    status: "failed",
    message: "Webhook handler is missing in controller",
  });
};

// =======================================================
// PAYSTACK WEBHOOK ENDPOINTS
// MUHIMMI: KADA KA SAKA 'protect' MIDDLEWARE A WANNAN HANYAR!
// =======================================================

// 1. Idan URL din shine: /api/v1/webhooks/paystack
router.post("/paystack", safeWebhookHandler);

// 2. Idan URL din shine: /api/v1/webhooks/paystack/webhook
router.post("/paystack/webhook", safeWebhookHandler);

// 3. Idan aka kira kai tsaye: /api/v1/webhooks/
router.post("/", safeWebhookHandler);

module.exports = router;