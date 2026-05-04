// Backend/routes/installation.routes.js
// Mount in index.js:
//   const installationRouter = require("./routes/installation.routes");
//   app.use("/api/installation", installationRouter);

const express = require("express");
const installationRouter = express.Router();

const auth = require("../middlewares/auth.middleware");
const allow = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");

const {
  getMyLeads,
  getMyLead,
  getMyStats,
  startInstallation,
  submitInstallation,
  submitMeter,
  completeProject,
  collectPayment,
  saveNotes,
} = require("../controllers/installation.controller");

// All routes require a valid JWT
installationRouter.use(auth);

// ── Installation team + admin can access all routes below ────────────────────
installationRouter.use(allow("installation", "Admin"));

// Dashboard stats
installationRouter.get("/stats", getMyStats);

// Lead list + single lead
installationRouter.get("/my-leads", getMyLeads);
installationRouter.get("/my-leads/:id", getMyLead);

// ── Step 7: Mark Installation Started ────────────────────────────────────────
// Called when team arrives on site (before photos + start time)
installationRouter.put(
  "/my-leads/:id/start",
  upload("solar/install").fields([
    { name: "beforePhotos", maxCount: 10 },
  ]),
  startInstallation,
);

// ── Step 8: Mark Installation Completed ──────────────────────────────────────
// Called after panels/wiring/inverter done (after photos + sign-off)
installationRouter.put(
  "/my-leads/:id/installation",
  upload("solar/install").fields([
    { name: "beforePhotos", maxCount: 10 },
    { name: "afterPhotos", maxCount: 10 },
  ]),
  submitInstallation,
);

// ── Steps 9a/9b/9c: Meter sub-stages (all use same endpoint) ─────────────────
installationRouter.put("/my-leads/:id/meter", submitMeter);

// ── Project complete (called automatically after meter installed) ─────────────
installationRouter.put("/my-leads/:id/complete", completeProject);

// ── Payment collection ────────────────────────────────────────────────────────
installationRouter.post("/my-leads/:id/payment", collectPayment);

// ── Notes ─────────────────────────────────────────────────────────────────────
installationRouter.patch("/my-leads/:id/notes", saveNotes);

module.exports = installationRouter;