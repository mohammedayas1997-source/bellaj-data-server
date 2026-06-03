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
    console.log("🔍 Connected database:", mongoose.connection.name);
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);
  }
};

startDB();

/* CORS CONFIGURATION */
const allowedOrigins = [
  "https://bellaj-data-hub.vercel.app",
  "https://www.bellajdatahub.com",
  "https://bellajdatahub.com",
  "https://bellaj-data-server1-r08bnzaww-abdulrahman-mohammeds-projects.vercel.app",
  "http://localhost:19006",
  "http://localhost:3000",
  "http://localhost:8081",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (
    !origin ||
    allowedOrigins.includes(origin) ||
    origin.endsWith(".vercel.app")
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Accept-Version",
  );

  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).json({});
  }

  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

/* BODY PARSERS */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/* HEALTH CHECK ROUTES */
app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Bellaj Data Hub API is running successfully",
    version: "1.0.0",
  });
});

app.get("/api/v1", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Bellaj Data Hub API v1 is active",
  });
});

app.get("/api/v1/health", (req, res) => {
  return res.status(200).json({
    success: true,
    status: "healthy",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

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

/* USER PROFILE ROUTE */
app.get("/api/v1/user/profile", async (req, res) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.headers.token) {
      token = req.headers.token;
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "JWT secret is not configured on server",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found or session expired",
      });
    }

    return res.status(200).json({
      success: true,
      status: "success",
      data: user,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session. Please login again.",
    });
  }
});

/* 404 HANDLER */
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `API route not found: ${req.originalUrl}`,
  });
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

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Bellaj Data Hub API running on port ${PORT}`);
  });
}

module.exports = app;
