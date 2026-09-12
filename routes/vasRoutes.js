const express = require("express");
const router = express.Router();

const vasController = require("../controllers/vasController");
const { protect } = require("../middleware/authMiddleware");

// Kariya idan wani function a controller bai gama hawa ba
const safeHandler = (handlerName) => {
  const handler = vasController[handlerName];

  if (typeof handler === "function") {
    return handler;
  }

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `Controller method '${handlerName}' is not implemented in vasController.js`,
    });
  };
};

// ==========================================
// KARIYA: DOLE NE MUTUM YA YI LOGIN
// ==========================================
router.use(protect);

// ==========================================
// 1. DATA & AIRTIME PORTALS
// ==========================================
// Dauko jerin bundles da farashi
router.get("/data-plans", safeHandler("getDataPlans"));

// Sayar da Data (MTN, Airtel, Glo, 9mobile)
router.post("/buy-data", safeHandler("buyData"));

// Sayar da Airtime (VTU)
router.post("/buy-airtime", safeHandler("buyAirtime"));

// ==========================================
// 2. CABLE TV SUBSCRIPTIONS
// ==========================================
// Biyan DStv, GOtv, StarTimes
router.post("/cable/buy", safeHandler("subscribeCable"));

// ==========================================
// 3. IDENTITY VERIFICATION (NIN / BVN / NIMC)
// ==========================================
// NIN Verification
router.post("/identity/nin-verify", safeHandler("validateNIN"));

// BVN Verification
router.post("/identity/bvn-verify", safeHandler("validateBVN"));

// NIMC Validation (Tracking ID ko NIN)
router.post("/identity/nimc-validate", safeHandler("validateNIMC"));

module.exports = router;