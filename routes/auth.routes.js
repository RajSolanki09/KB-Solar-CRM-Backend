const express    = require("express");
const authRouter = express.Router();

const authController = require("../controllers/auth.controller");
const auth           = require("../middlewares/auth.middleware");
const upload         = require("../middlewares/upload.middleware");

// ✅ One-time first admin creation (no auth required, self-locks after use)
authRouter.post("/first-admin", authController.firstAdmin);

// Public routes
authRouter.post("/register", upload("profiles").single("image"), authController.register);
authRouter.post("/login", authController.login);

// Protected routes
authRouter.post("/logout",          auth, authController.logout);
authRouter.get("/profile",          auth, authController.getProfile);
authRouter.put("/profile",          auth, upload("profiles").single("image"), authController.updateProfile);
authRouter.put("/change-password",  auth, authController.changePassword);
authRouter.post("/fcm-token",       auth, authController.saveFcmToken);

module.exports = authRouter;