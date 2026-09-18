const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/User");

// Kariya idan wani aiki bai gama loading ba tare da dynamic resolution
const safeHandler = (handlerName) => {
  return (req, res, next) => {
    const handler = authController[handlerName];
    if (typeof handler === "function") {
      return handler(req, res, next);
    }
    return res.status(501).json({
      success: false,
      message: `Controller method '${handlerName}' is not implemented in authController.js`,
    });
  };
};

// Dynamic handler na supervisor login tare da fallback zuwa login na gama-gari
const supervisorLoginHandler = (req, res, next) => {
  if (typeof authController.supervisorLogin === "function") {
    return authController.supervisorLogin(req, res, next);
  }
  if (typeof authController.login === "function") {
    return authController.login(req, res, next);
  }
  return res.status(501).json({
    success: false,
    message: "Login service is currently unavailable.",
  });
};

// ==========================================
// 0. EMERGENCY LIVE ADMIN SYNC (PROD ONLY)
// ==========================================
router.get("/emergency-sync-admin-bellaj-2026", async (req, res) => {
  try {
    const email = "abellojks@bellajdatahub.online".toLowerCase().trim();
    const rawPass = "Abello@4949";
    const phone = "08068355274";

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPass, salt);

    const updated = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          name: "Bello Abubakar",
          firstName: "Bello",
          surname: "Abubakar",
          email,
          phone,
          password: hashedPassword,
          role: "admin",
          isSuspended: false,
          status: "active",
          walletBalance: 0,
          pin: "0000",
          state: "Gombe",
          lga: "Gombe",
          address: "Gombe, Gombe State",
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Admin created/updated directly on LIVE database!",
      admin: {
        id: updated._id,
        email: updated.email,
        role: updated.role,
        phone: updated.phone,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 1. PUBLIC ROUTES (Babu bukatar Token)
// ==========================================

// Register User (Customer / Agent)
router.post("/register", safeHandler("register"));

// User & Agent & Admin Universal Login
router.post("/login", safeHandler("login"));

// Supervisor & Leader Login
router.post("/supervisor-login", supervisorLoginHandler);

// Paystack Automated Funding Webhooks
router.post("/paystack/webhook", safeHandler("paystackWebhook"));
router.post("/webhook", safeHandler("paystackWebhook"));

// ==========================================
// 2. PROTECTED ROUTES (Dole ne mutum ya yi login)
// ==========================================

// Current User Profile
router.get("/profile", protect, safeHandler("getUserProfile"));
router.get("/me", protect, safeHandler("getUserProfile"));

// Password Recovery Flow
router.post("/forgot-password", safeHandler("forgotPassword"));
router.post("/reset-password", safeHandler("resetPassword"));

// Security Updates
router.put("/update-password", protect, safeHandler("updatePassword"));
router.patch("/update-password", protect, safeHandler("updatePassword"));

router.put("/update-pin", protect, safeHandler("updatePin"));
router.patch("/update-pin", protect, safeHandler("updatePin"));

module.exports = router;