const express = require("express");
const router = express.Router();

const ninController = require("../controllers/ninController");
const ValidationRequest = require("../models/ValidationRequest");

const safeHandler = (handler, name) => {
  if (typeof handler === "function") return handler;

  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `${name} is not implemented in ninController`,
    });
  };
};

// Submit new validation request
router.post(
  "/validate",
  safeHandler(ninController.submitValidation, "submitValidation"),
);

// Admin: get all validation requests
router.get("/admin/all-requests", async (req, res) => {
  try {
    const requests = await ValidationRequest.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
