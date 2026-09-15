const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/User");

// Kariya idan wani aiki bai gama loading ba
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

// User & Agent Login
router.post("/login", safeHandler("login"));

// Supervisor / Leader Login (Fallback zuwa babban login idan babu supervisorLogin)
router.post(
  "/supervisor-login",
  typeof authController.supervisorLogin === "function"
    ? authController.supervisorLogin
    : safeHandler("login")
);

// Paystack Automated Funding Webhooks (Dole ne su zama a bude ga Paystack)
router.post("/paystack/webhook", safeHandler("paystackWebhook"));
router.post("/webhook", safeHandler("paystackWebhook"));

// ==========================================
// 2. PROTECTED ROUTES (Dole ne mutum ya yi login)
// ==========================================

// Get Current User Profile (Haɗa /profile da /me don dacewa da frontend)
router.get("/profile", protect, safeHandler("getUserProfile"));
router.get("/me", protect, safeHandler("getUserProfile"));

// Password Recovery Flow
router.post("/forgot-password", safeHandler("forgotPassword"));
router.post("/reset-password", safeHandler("resetPassword"));

// Update Security Credentials
router.put("/update-password", protect, safeHandler("updatePassword"));
router.patch("/update-password", protect, safeHandler("updatePassword"));

router.put("/update-pin", protect, safeHandler("updatePin"));
router.patch("/update-pin", protect, safeHandler("updatePin"));

module.exports = router;