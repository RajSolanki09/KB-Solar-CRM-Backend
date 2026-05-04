const generateToken = require("../config/jwt");
const User = require("../models/user.model");
const TokenBlacklist = require("../models/tokenBlacklist.model");
const bcrypt = require("bcryptjs");

// ✅ BOOTSTRAP FIRST ADMIN (one-time use, self-locks after first admin is created)
exports.firstAdmin  = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // 1. Basic validation
    if (!name && !email && !password && !phone) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // 2. Self-lock: refuse if any admin already exists
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return res.status(403).json({
        success: false,
        message: "An admin account already exists. Use the normal login flow.",
      });
    }

    // 3. Check email is not already taken
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    // 4. Hash password & create admin
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      role: "admin",
    });

    // 5. Issue token immediately so they can start using the system
    const token = generateToken({ id: user._id, role: user.role });

    console.log("BOOTSTRAP: First admin created:", user.email);

    res.status(201).json({
      success: true,
      message: "Admin account created successfully",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    });

  } catch (error) {
    console.error("BOOTSTRAP ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ LOGIN
exports.login = async (req, res) => {
  try {
    console.log("LOGIN ROUTE HIT. Body:", req.body);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // normalize email & password inputs
    const lookupEmail = (typeof email === 'string' ? email.trim().toLowerCase() : "");
    console.log("LOGIN: lookupEmail=", lookupEmail);

    // Important: select +password because model hides it
    let user = await User.findOne({ email: lookupEmail })
      .select("+password");

    // fallback: if user attempted to login with phone number
    if (!user) {
      console.log("LOGIN: user not found by email, trying phone lookup for:", email);
      user = await User.findOne({ phone: email.trim() }).select("+password");
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.status === "Inactive") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact admin.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Password incorrect",
      });
    }

    const token = generateToken({
      id: user._id,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        image: user.image,
        status: user.status,
      },
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error && error.stack ? error.stack : error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ REGISTER CONTROLLER
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // 1. Basic Validation
    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({
      email: email.toLowerCase()
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    // 3. Role Validation
    const allowedRoles = ["admin", "sales", "service"];
    const requestedRole = role || "sales";

    if (!allowedRoles.includes(requestedRole)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    // 4. Prevent creating admin via this route — use /bootstrap-admin instead
    if (requestedRole === "admin") {
      let token;
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Authentication required to create Admin users",
        });
      }

      const black = await TokenBlacklist.findOne({ token });
      if (black) {
        return res.status(401).json({ success: false, message: "Token revoked" });
      }

      let decoded;
      try {
        decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      } catch (err) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
        });
      }

      const requester = await User.findById(decoded.id).select("-password");
      if (!requester || requester.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Only Admins can create Admin users",
        });
      }
    }

    // 5. Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 6. Create User
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      role: requestedRole,
      image: req.file ? req.file.path : null,
    });

    // 7. Response
    res.status(201).json({
      success: true,
      message: `${user.role} registered successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        image: user.image,
        status: user.status,
      },
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ LOGOUT
exports.logout = async (req, res) => {
  try {
    // extract token from Authorization header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        // decode to find expiry
        const decoded = require('jsonwebtoken').decode(token);
        const exp = decoded && decoded.exp
          ? new Date(decoded.exp * 1000)
          : new Date(Date.now() + 24 * 60 * 60 * 1000);

        // store in blacklist; ignore duplicate key errors
        await TokenBlacklist.create({ token, expiresAt: exp }).catch(err => {
          if (err && err.code === 11000) return; // already blacklisted
          throw err;
        });
      } catch (e) {
        console.error('Failed to blacklist token:', e);
      }
    }

    res.status(200).json({ success: true, message: 'Logout successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ GET PROFILE
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ UPDATE PROFILE
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const updateData = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email.toLowerCase();
    if (phone) updateData.phone = phone;
    if (req.file) updateData.image = req.file.path;

    // Prevent duplicate email
    if (email) {
      const existing = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: req.user.id }
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          message: "Email already in use"
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ CHANGE PASSWORD
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    const user = await User.findById(req.user.id)
      .select("+password");

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password incorrect",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ SAVE FCM TOKEN
exports.saveFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ success: false, message: "fcmToken is required" });
    }
    await User.findByIdAndUpdate(req.user.id, { fcmToken });
    res.status(200).json({ success: true, message: "FCM token saved" });
  } catch (error) {
    console.error("SAVE FCM TOKEN ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};