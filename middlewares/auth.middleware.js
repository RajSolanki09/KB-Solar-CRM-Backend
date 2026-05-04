const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const TokenBlacklist = require("../models/tokenBlacklist.model");

const auth = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  try {
    // Reject if token was explicitly revoked (logout)
    const black = await TokenBlacklist.findOne({ token });
    if (black) {
      return res.status(401).json({ success: false, message: "Token revoked" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports = auth;
