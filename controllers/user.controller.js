const User           = require("../models/user.model");
const SolarLead      = require("../models/solarlead.model");
const SprinklerLead  = require("../models/sprinklerlead.model");
const ServiceRequest = require("../models/servicerequest.model");
const bcrypt         = require("bcryptjs");

const VALID_ROLES = ["admin", "sales", "service", "installation"];

// ─────────────────────────────────────────────
//  CREATE STAFF
// ─────────────────────────────────────────────
const createUser = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email || !password || !role || !phone) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 10),
      role, phone,
      image: req.file ? req.file.path : null,
      status: "Active",
    });

    res.status(201).json({
      success: true,
      message: "Staff created successfully",
      user: {
        _id: newUser._id, name: newUser.name, email: newUser.email,
        phone: newUser.phone, role: newUser.role,
        image: newUser.image, status: newUser.status,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
//  GET ALL STAFF
// ─────────────────────────────────────────────
const getAllStaff = async (req, res) => {
  try {
    const query = {};
    if (req.query.role)   query.role = req.query.role;
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) {
      query.$or = [
        { name:  { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
        { phone: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const page  = Math.max(Number(req.query.page)  || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const skip  = (page - 1) * limit;

    const [staff, total] = await Promise.all([
      User.find(query).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query),
    ]);

    res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), staff });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
//  GET SINGLE STAFF
// ─────────────────────────────────────────────
const getSingleStaff = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "Staff not found" });
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
//  UPDATE STAFF
// ─────────────────────────────────────────────
const updateStaffMember = async (req, res) => {
  try {
    const { name, email, role, phone } = req.body;
    const updateData = {};

    if (name)  updateData.name  = name;
    if (phone) updateData.phone = phone;
    if (role) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
      updateData.role = role;
    }
    if (email) {
      updateData.email = email.toLowerCase();
      const exists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.params.id } });
      if (exists) return res.status(409).json({ success: false, message: "Email already in use" });
    }
    if (req.file) updateData.image = req.file.path;

    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "Staff not found" });

    res.status(200).json({ success: true, message: "Staff updated", user });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
//  UPDATE STAFF STATUS
// ─────────────────────────────────────────────
const updateStaffStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id, { status }, { new: true }
    ).select("-password");

    if (!user) return res.status(404).json({ success: false, message: "Staff not found" });

    res.status(200).json({ success: true, message: `Staff marked ${status}`, user });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
//  DELETE STAFF
// ─────────────────────────────────────────────
const deleteStaffMember = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Cannot delete yourself" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "Staff not found" });

    res.status(200).json({ success: true, message: "Staff deleted" });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
//  ADMIN RESET PASSWORD (for any user)
// ─────────────────────────────────────────────
const adminResetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.params.id).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "Staff not found" });
    }

    // Use save() so any pre-save hooks fire correctly
    user.password = await bcrypt.hash(newPassword.trim(), 10);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });

  } catch (err) {
    console.error("ADMIN RESET PASSWORD ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
//  ADMIN DASHBOARD
// ─────────────────────────────────────────────
const getAdminDashboard = async (req, res) => {
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [
      totalSolarLeads,
      totalSprinklerLeads,
      totalServices,
      pendingServices,
      completedSolar,
      completedSprinkler,
      totalStaff,
      totalInstallation,
    ] = await Promise.all([
      SolarLead.countDocuments(),
      SprinklerLead.countDocuments(),
      ServiceRequest.countDocuments(),
      ServiceRequest.countDocuments({ status: { $in: ["Open", "Assigned"] } }),
      SolarLead.countDocuments({ isCompleted: true }),
      SprinklerLead.countDocuments({ isCompleted: true }),
      User.countDocuments({ role: { $in: ["sales", "service", "installation"] } }),
      User.countDocuments({ role: "installation" }),
    ]);

    const solarRevenue = await SolarLead.aggregate([
      { $unwind: { path: "$payment.paymentHistory", preserveNullAndEmptyArrays: false } },
      { $group: { _id: null, total: { $sum: "$payment.paymentHistory.amount" } } },
    ]);

    const sprinklerRevenue = await SprinklerLead.aggregate([
      { $unwind: { path: "$payment.paymentHistory", preserveNullAndEmptyArrays: false } },
      { $group: { _id: null, total: { $sum: "$payment.paymentHistory.amount" } } },
    ]);

    const serviceRevenue = await ServiceRequest.aggregate([
      { $match: { chargeType: "Paid" } },
      { $group: { _id: null, total: { $sum: "$paidAmount" } } },
    ]);

    res.status(200).json({
      success: true,
      leads: {
        solar:      totalSolarLeads,
        sprinkler:  totalSprinklerLeads,
        total:      totalSolarLeads + totalSprinklerLeads,
        completed:  completedSolar + completedSprinkler,
      },
      services: {
        total:   totalServices,
        pending: pendingServices,
      },
      staff: totalStaff,
      installation: totalInstallation,
      revenue: {
        solar:      solarRevenue[0]?.total      || 0,
        sprinkler:  sprinklerRevenue[0]?.total  || 0,
        service:    serviceRevenue[0]?.total    || 0,
        total:     (solarRevenue[0]?.total || 0) +
                   (sprinklerRevenue[0]?.total || 0) +
                   (serviceRevenue[0]?.total || 0),
      },
    });

  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createUser,
  getAllStaff,
  getSingleStaff,
  updateStaffMember,
  updateStaffStatus,
  deleteStaffMember,
  adminResetPassword,  // ← NEW
  getAdminDashboard,
};