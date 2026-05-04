// Backend/routes/solar.routes.js
const express = require("express");
const solarRouter = express.Router();

const auth = require("../middlewares/auth.middleware");
const allow = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");

const {
  // CRUD
  createLead,
  getAllLeads,
  getSingleLead,
  updateBasicInfo,
  assignLead,
  deleteLead,
  // Followup system
  addFollowupEntry,
  getFollowupHistory,
  markFollowupDone,
  // PUT — first-time submit (advances stage)
  updateVisitSchedule,
  updateTechnicalVisit,
  updateQuotation,
  uploadQuotationPdf,
  updateFollowup,
  updateDeal,
  updateInstallationAssign,   // ← NEW step 6
  updateInstallationStarted,  // ← NEW step 7
  updateInstallation,         // step 8 (completion only)
    updateAgreementUpload,
  updateMeter,
  updatePortal,
  updateSubsidy,
  addPayment,
  // PATCH — edit in-place (NO stage advance)
  editVisitSchedule,
  editTechnicalVisit,
  editQuotation,
  editFollowup,
  editDeal,
  editInstallationAssign,     // ← NEW
  editInstallation,
    editAgreementUpload,
  editMeter,
  editPortal,
  editSubsidy,
  editPayment,
} = require("../controllers/solarlead.controller");

// ── CRUD ──────────────────────────────────────────────────────────────────────
solarRouter.post("/", auth, allow("Admin", "sales"), createLead);
solarRouter.get("/", auth, allow("Admin", "sales", "installation"), getAllLeads);
solarRouter.get("/:id", auth, allow("Admin", "sales", "installation"), getSingleLead);
solarRouter.put("/:id", auth, allow("Admin", "sales"), updateBasicInfo);
solarRouter.delete("/:id", auth, allow("Admin"), deleteLead);

// ── Admin actions ─────────────────────────────────────────────────────────────
solarRouter.put("/:id/assign", auth, allow("Admin"), assignLead);

// ── Followup system ───────────────────────────────────────────────────────────
solarRouter.post("/:id/followup-add", auth, allow("Admin", "sales"), addFollowupEntry);
solarRouter.get("/:id/followup-history", auth, allow("Admin", "sales"), getFollowupHistory);
solarRouter.patch("/:id/followup-done", auth, allow("Admin", "sales"), markFollowupDone);

// ── PUT — first-time submit (advances stage) ──────────────────────────────────
solarRouter.put("/:id/visit-schedule", auth, allow("Admin", "sales"), updateVisitSchedule);
solarRouter.put("/:id/technicalVisit", auth, allow("Admin", "sales"),
  upload("solar/technical").array("technicalPhotos", 15), updateTechnicalVisit);
solarRouter.put("/:id/quotation", auth, allow("Admin", "sales"), updateQuotation);
solarRouter.post("/:id/quotation-pdf", auth, allow("Admin", "sales"),
  upload("solar/quotation").single("quotationPdf"), uploadQuotationPdf);
solarRouter.put("/:id/followup", auth, allow("Admin", "sales"), updateFollowup);
solarRouter.put("/:id/deal", auth, allow("Admin", "sales"), updateDeal);

// Step 6 — assign team
solarRouter.put("/:id/installation-assign", auth, allow("Admin", "installation", "sales"),
  updateInstallationAssign);

// Step 7 — mark started + before photos
solarRouter.put("/:id/installation-started", auth, allow("Admin", "installation", "sales"),
  upload("solar/install").fields([
    { name: "beforePhotos", maxCount: 10 },
  ]), updateInstallationStarted);

// Step 8 — mark completed + after photos
solarRouter.put("/:id/installation", auth, allow("Admin", "installation", "sales"),
  upload("solar/install").fields([
    { name: "afterPhotos", maxCount: 10 },
  ]), updateInstallation);

solarRouter.put("/:id/agreement-upload", auth, allow("Admin", "installation", "sales"),
  updateAgreementUpload);

solarRouter.put("/:id/meter", auth, allow("Admin", "sales"), updateMeter);
solarRouter.put("/:id/portal", auth, allow("Admin", "sales"),
  upload("solar/portal").fields([
    { name: "aadhar", maxCount: 1 },
    { name: "electricityBill", maxCount: 1 },
    { name: "landDocuments", maxCount: 1 },
    { name: "agreement", maxCount: 1 },
  ]), updatePortal);
solarRouter.put("/:id/subsidy", auth, allow("Admin", "sales"), updateSubsidy);
solarRouter.post("/:id/payment", auth, allow("Admin", "sales"), addPayment);

// ── PATCH — edit existing data (NO stage advance) ─────────────────────────────
solarRouter.patch("/:id/visit-schedule", auth, allow("Admin", "sales"), editVisitSchedule);
solarRouter.patch("/:id/technicalVisit", auth, allow("Admin", "sales"),
  upload("solar/technical").array("technicalPhotos", 15), editTechnicalVisit);
solarRouter.patch("/:id/quotation", auth, allow("Admin", "sales"), editQuotation);
solarRouter.patch("/:id/followup", auth, allow("Admin", "sales"), editFollowup);
solarRouter.patch("/:id/deal", auth, allow("Admin", "sales"), editDeal);

// Edit installation assign (no stage advance)
solarRouter.patch("/:id/installation-assign", auth, allow("Admin", "installation", "sales"),
  editInstallationAssign);

solarRouter.patch("/:id/installation", auth, allow("Admin", "installation", "sales"),
  upload("solar/install").fields([
    { name: "beforePhotos", maxCount: 10 },
    { name: "afterPhotos", maxCount: 10 },
  ]), editInstallation);

solarRouter.patch("/:id/agreement-upload", auth, allow("Admin", "installation", "sales"),
  editAgreementUpload);

solarRouter.patch("/:id/meter", auth, allow("Admin", "sales"), editMeter);
solarRouter.patch("/:id/portal", auth, allow("Admin", "sales"),
  upload("solar/portal").fields([
    { name: "aadhar", maxCount: 1 },
    { name: "electricityBill", maxCount: 1 },
    { name: "landDocuments", maxCount: 1 },
    { name: "agreement", maxCount: 1 },
  ]), editPortal);
solarRouter.patch("/:id/subsidy", auth, allow("Admin", "sales"), editSubsidy);
solarRouter.patch("/:id/payment", auth, allow("Admin", "sales"), editPayment);

module.exports = solarRouter;