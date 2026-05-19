const admin = require("firebase-admin");
const User = require("../models/user.model");
const path = require("path");
const fs = require("fs");

// ── Initialize Firebase Admin ────────────────────────────────────────────────
const serviceAccountPath = path.join(__dirname, "..", "config", "firebase-service-account.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin initialized");
} else {
  console.warn("⚠️  Firebase service account not found at", serviceAccountPath);
  console.warn("   Push notifications will NOT work.");
  console.warn("   Download it from Firebase Console → Project Settings → Service Accounts.");
}

// ── Send notification to all admins ──────────────────────────────────────────
exports.notifyAdmins = async ({ title, body, data = {} }) => {
  try {
    if (!admin.apps.length) {
      console.warn("Firebase Admin not initialized — skipping notification");
      return;
    }

    const admins = await User.find({ role: "admin", status: "Active", fcmToken: { $ne: null } });

    const tokens = admins.map((a) => a.fcmToken).filter(Boolean);
    if (tokens.length === 0) {
      console.log("No admin FCM tokens found — skipping notification");
      return;
    }

    const message = {
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    };

    const results = await Promise.allSettled(
      tokens.map((token) =>
        admin.messaging().send({ ...message, token })
      )
    );

    // Clean up invalid tokens
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "rejected") {
        const errCode = results[i].reason?.code;
        if (
          errCode === "messaging/invalid-registration-token" ||
          errCode === "messaging/registration-token-not-registered"
        ) {
          await User.findByIdAndUpdate(admins[i]._id, { fcmToken: null });
          console.log(`Removed stale FCM token for admin ${admins[i].email}`);
        }
      }
    }

    const sent = results.filter((r) => r.status === "fulfilled").length;
    console.log(`📩 Notification sent to ${sent}/${tokens.length} admins`);
  } catch (error) {
    console.error("NOTIFICATION ERROR:", error.message);
  }
};

// ── Send notification to a specific user ─────────────────────────────────────
exports.notifyUser = async (userId, { title, body, data = {} }) => {
  try {
    if (!admin.apps.length) {
      console.warn("Firebase Admin not initialized — skipping notification");
      return;
    }

    const user = await User.findById(userId);
    if (!user || !user.fcmToken) {
      console.log(`No FCM token for user ${userId} — skipping notification`);
      return;
    }

    const message = {
      token: user.fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    };

    await admin.messaging().send(message);
    console.log(`📩 Notification sent to user ${user.name || userId}`);
  } catch (error) {
    const errCode = error?.code;
    if (
      errCode === "messaging/invalid-registration-token" ||
      errCode === "messaging/registration-token-not-registered"
    ) {
      await User.findByIdAndUpdate(userId, { fcmToken: null });
      console.log(`Removed stale FCM token for user ${userId}`);
    } else {
      console.error("NOTIFY USER ERROR:", error.message);
    }
  }
};