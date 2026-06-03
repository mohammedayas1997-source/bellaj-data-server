const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

const safeHandler = (handlerName) => {
  const handler = authController[handlerName];

  if (typeof handler === "function") {
    return handler;
  }

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `Controller method '${handlerName}' is not implemented in authController.js`,
    });
  };
};

// ================================
// AUTH ROUTES
// ================================

// Register User
router.post("/register", safeHandler("register"));

// Normal Login
router.post("/login", safeHandler("login"));

// Supervisor Login
router.post("/supervisor-login", safeHandler("supervisorLogin"));

// Paystack Webhook
router.post("/paystack/webhook", safeHandler("paystackWebhook"));

// Update Password
router.put("/update-password", safeHandler("updatePassword"));

// Update PIN
router.put("/update-pin", safeHandler("updatePin"));

// Get User Profile
router.get("/profile", safeHandler("getUserProfile"));

module.exports = router;
