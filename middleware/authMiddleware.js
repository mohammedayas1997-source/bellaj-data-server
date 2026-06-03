const jwt = require("jsonwebtoken");
const User = require("../models/User");

const APP_NAME = "Bellaj Data Hub";

/**
 * @desc    Protect Routes Middleware
 * @access  Private
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token missing. Please login.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("Bellaj JWT secret is missing.");

      return res.status(500).json({
        success: false,
        message: "Server authentication configuration error.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    const user = await User.findById(decoded.id).select("-password").lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account no longer exists.",
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        message:
          "Your Bellaj account has been suspended. Please contact support.",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error("Bellaj Protect Middleware Error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Session expired. Please login again.",
    });
  }
};

/**
 * @desc    Role Authorization Middleware
 * @param   {...roles}
 * @access  Private
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized request.",
        });
      }

      const userRole = req.user.role;

      if (!roles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: `Access denied for role: ${userRole}`,
        });
      }

      next();
    } catch (error) {
      console.error("Bellaj Authorization Error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Authorization middleware error.",
      });
    }
  };
};

/**
 * @desc    Admin Only Middleware
 * @access  Admin/Superadmin
 */
const adminOnly = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized request.",
      });
    }

    const allowedRoles = ["admin", "superadmin"];

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }

    next();
  } catch (error) {
    console.error("Bellaj Admin Middleware Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Admin authorization error.",
    });
  }
};

/**
 * @desc    Superadmin Only Middleware
 * @access  Superadmin
 */
const superAdminOnly = (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Superadmin access required.",
      });
    }

    next();
  } catch (error) {
    console.error("Bellaj Superadmin Middleware Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Superadmin authorization error.",
    });
  }
};

module.exports = {
  protect,
  authorize,
  adminOnly,
  superAdminOnly,
};
