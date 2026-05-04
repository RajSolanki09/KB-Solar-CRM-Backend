// Backend/routes/user.routes.js

const express = require("express");
const userRouter = express.Router();

const {
  createUser,
  getAllStaff,
  getSingleStaff,
  updateStaffMember,
  updateStaffStatus,
  deleteStaffMember,
  adminResetPassword,  // ← NEW
  getAdminDashboard,
} = require("../controllers/user.controller");

const auth           = require("../middlewares/auth.middleware");
const authorizeRoles = require("../middlewares/role.middleware");
const upload         = require("../middlewares/upload.middleware");

userRouter.use(auth);

// ✅ installation + sales can fetch staff list (for team dropdown in Deal screen)
userRouter.get("/staff", authorizeRoles("admin", "sales", "installation"), getAllStaff);

// ── Admin only below ──────────────────────────────────────────────────────────
userRouter.use(authorizeRoles("admin"));

userRouter.get("/dashboard",          getAdminDashboard);

userRouter.post("/",                  upload("profiles").single("image"), createUser);
userRouter.get("/",                   getAllStaff);
userRouter.get("/:id",                getSingleStaff);
userRouter.put("/:id",                upload("profiles").single("image"), updateStaffMember);
userRouter.put("/:id/reset-password", adminResetPassword);   // ← NEW
userRouter.patch("/:id/status",       updateStaffStatus);
userRouter.delete("/:id",             deleteStaffMember);

module.exports = userRouter;