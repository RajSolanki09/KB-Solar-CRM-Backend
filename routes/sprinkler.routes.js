// Backend/routes/sprinkler.routes.js

const express = require("express");
const sprinklerRouter = express.Router();

const auth = require("../middlewares/auth.middleware");
const allow = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");

const {
  createLead, getAllLeads, getSingleLead, updateBasicInfo,
  assignLead, deleteLead,
  updateSiteVisit,
  updateVisitData,          // ← NEW: visit data step
  updateQuotation, uploadQuotationPdf,
  updateFollowup, editFollowup, updateDeal, updateInstallation,
  addPayment, updateReview,
  addFollowupEntry, getFollowupHistory,
  markFollowupDone,
  assignInstaller,
  getMyInstallationLeads,
  startInstallation,
  completeInstallation,
} = require("../controllers/sprinklerlead.controller");

// ── Installation team: Get their assigned sprinkler leads ─────────────────────
sprinklerRouter.get(
  "/my-installation-leads",
  auth,
  allow("Admin", "installation"),
  getMyInstallationLeads
);

// ── CRUD ──────────────────────────────────────────────────────────────────────
sprinklerRouter.post("/", auth, allow("Admin", "sales"), createLead);
sprinklerRouter.get("/", auth, allow("Admin", "sales"), getAllLeads);
sprinklerRouter.get("/:id", auth, allow("Admin", "sales", "installation"), getSingleLead);
sprinklerRouter.put("/:id", auth, allow("Admin", "sales"), updateBasicInfo);
sprinklerRouter.delete("/:id", auth, allow("Admin"), deleteLead);

// ── Admin only ────────────────────────────────────────────────────────────────
sprinklerRouter.put("/:id/assign", auth, allow("Admin"), assignLead);
sprinklerRouter.put("/:id/assign-installer", auth, allow("Admin", "sales"), assignInstaller);

// ── Followup system ───────────────────────────────────────────────────────────
sprinklerRouter.post("/:id/followup-add", auth, allow("Admin", "sales"), addFollowupEntry);
sprinklerRouter.get("/:id/followup-history", auth, allow("Admin", "sales"), getFollowupHistory);
sprinklerRouter.patch("/:id/followup-done", auth, allow("Admin", "sales"), markFollowupDone);

// ── Sales/Admin step endpoints ────────────────────────────────────────────────
sprinklerRouter.put("/:id/site-visit",
  auth, allow("Admin", "sales"),
  upload("sprinkler/visit").array("photos", 10), updateSiteVisit);

sprinklerRouter.put("/:id/visit-data",
  auth, allow("Admin", "sales"),
  upload("sprinkler/visit-data").array("photos", 15),
  updateVisitData);

sprinklerRouter.put("/:id/quotation",
  auth, allow("Admin", "sales"), updateQuotation);

sprinklerRouter.post("/:id/quotation-pdf",
  auth, allow("Admin", "sales"),
  upload("sprinkler/quotation").single("quotationPdf"), uploadQuotationPdf);

sprinklerRouter.put("/:id/followup",
  auth, allow("Admin", "sales"), updateFollowup);

sprinklerRouter.patch("/:id/followup",
  auth, allow("Admin", "sales"), editFollowup);

sprinklerRouter.put("/:id/deal",
  auth, allow("Admin", "sales"), updateDeal);

// Legacy installation endpoint
sprinklerRouter.put("/:id/installation",
  auth, allow("Admin", "sales"),
  upload("sprinkler/install").array("photos", 10), updateInstallation);

sprinklerRouter.post("/:id/payment",
  auth, allow("Admin", "sales"), addPayment);

sprinklerRouter.put("/:id/review",
  auth, allow("Admin", "sales"), updateReview);

// ── Installation team step endpoints ─────────────────────────────────────────
sprinklerRouter.put("/:id/installation-start",
  auth, allow("Admin", "installation", "sales"),
  upload("sprinkler/install").fields([{ name: "beforePhotos", maxCount: 5 }]),
  startInstallation);

sprinklerRouter.put("/:id/installation-complete",
  auth, allow("Admin", "installation", "sales"),
  upload("sprinkler/install").fields([{ name: "installPhotos", maxCount: 10 }]),
  completeInstallation);

module.exports = sprinklerRouter;