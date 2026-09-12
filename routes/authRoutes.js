const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

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

// Update Security Credentials
router.put("/update-password", protect, safeHandler("updatePassword"));
router.patch("/update-password", protect, safeHandler("updatePassword"));

router.put("/update-pin", protect, safeHandler("updatePin"));
router.patch("/update-pin", protect, safeHandler("updatePin"));

module.exports = router;