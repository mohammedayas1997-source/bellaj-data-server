require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const User = require("./models/User");

const app = express();

/* DATABASE CONNECTION */
const startDB = async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);
  }
};
startDB();

/* LOGGING MIDDLEWARE (Don ganin request a console) */
app.use((req, res, next) => {
  console.log(`🔍 Request received for: ${req.method} ${req.originalUrl}`);
  next();
});

/* CORS CONFIGURATION */
const allowedOrigins = [
  "https://bellaj-data-hub.vercel.app",
  "https://www.bellajdatahub.online",
  "https://bellajdatahub.com",
  "https://bellaj-data-server1-r08bnzaww-abdulrahman-mohammeds-projects.vercel.app",
  "http://localhost:19006",
  "http://localhost:3000",
  "http://localhost:8081",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
}));

/* BODY PARSERS */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/* ROUTES IMPORTS */
const authRoutes = require("./routes/authRoutes");
const supportRoutes = require("./routes/supportRoutes");
const walletRoutes = require("./routes/walletRoutes");
const vtuRoutes = require("./routes/vtuRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const agentRoutes = require("./routes/agentRoutes");
const leaderRoutes = require("./routes/leaderRoutes");
const supervisorRoutes = require("./routes/supervisorRoutes");
const adminRoutes = require("./routes/adminRoutes");
const nimcRoutes = require("./routes/nimcRoutes");
const bvnRoutes = require("./routes/bvnRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const validationRoutes = require("./routes/ninRoutes");

/* ROUTES REGISTRATION */
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/support", supportRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/vtu", vtuRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/agent", agentRoutes);
app.use("/api/v1/leader", leaderRoutes);
app.use("/api/v1/supervisors", supervisorRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/nimc", nimcRoutes);
app.use("/api/v1/bvn", bvnRoutes);
app.use("/api/v1/superadmin", superAdminRoutes);
app.use("/api/v1/validation", validationRoutes);

/* HEALTH CHECK ROUTES */
app.get("/", (req, res) => res.status(200).json({ success: true, message: "Bellaj API Active" }));
app.get("/api/v1/health", (req, res) => res.status(200).json({ success: true, status: "healthy" }));

/* USER PROFILE ROUTE */
app.get("/api/v1/user/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1] || req.headers.token || req.query.token;
    if (!token) return res.status(401).json({ success: false, message: "Token required" });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ success: false, message: "User not found" });
    
    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid session" });
  }
});

/* 404 HANDLER */
app.use((req, res) => {
  return res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

/* GLOBAL ERROR HANDLER */
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]:", err.stack);
  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bellaj Data Hub API running on port ${PORT}`);
});

module.exports = app;