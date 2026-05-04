// Backend/controllers/installation.controller.js
// Handles all installation-team-facing operations.

const mongoose = require("mongoose");
const SolarLead = require("../models/solarlead.model");

const ok = (res, data, message = "Success") =>
  res.status(200).json({ success: true, message, ...data });
const fail = (res, e, label = "ERROR") => {
  console.error(`${label}:`, e.message);
  res.status(500).json({ success: false, message: e.message });
};
const normPath = (p) => p.replace(/\\/g, "/");

// Resolve status against current SolarLead schema enum values so older DB/schema
// deployments don't crash when new status labels are used by controllers.
const setCompatibleStatus = (lead, primary, fallbacks = []) => {
  const allowed = SolarLead.schema.path("status")?.enumValues || [];
  const candidates = [primary, ...fallbacks].filter(Boolean);
  const chosen = candidates.find((s) => allowed.includes(s));
  lead.status = chosen || primary;
  return lead.status;
};

const rejectIfProjectCompleted = (lead, res) => {
  if (!lead.projectCompleted) return false;
  res.status(400).json({
    success: false,
    message: "Project is already completed and can no longer be edited",
  });
  return true;
};

// ── Helper: build the ownership filter ────────────────────────────────────────
const ownerFilter = (userId) => {
  const id = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId.toString())
    : userId;
  const idStr = userId?.toString?.() || String(userId);
  return {
    $or: [
      { "installationAssign.installationTeamMemberId": id },
      { "installationAssign.installationTeamMemberId": idStr },
      { "installationAssign.installationTeamMemberIds": id },
      { "installationAssign.installationTeamMemberIds": idStr },
      { "deal.installationTeamMemberId": id },
      { "deal.installationTeamMemberId": idStr },
      { "deal.installationTeamMemberIds": id },
      { "deal.installationTeamMemberIds": idStr },
    ],
  };
};

// All statuses that belong to the installation team's workflow
const INSTALLATION_STATUSES = [
  "Installation Assigned",
  "Installation Started",
  "Installation Completed",
  "Meter Process",
  "Portal Submitted",
  "Subsidy Completed",
  "Payment Completed",
  // legacy strings (kept for backwards compat)
  "Deal Closed",
  "Installed",
  "Meter Applied",
  "Meter Inspection",
  "Meter Installed",
  "Project Completed",
];

// ── Helper: push a stage history entry ────────────────────────────────────────
const pushStageHistory = (lead, stage, userId, note) => {
  if (!lead.stageHistory) lead.stageHistory = [];
  lead.stageHistory.push({
    stage,
    changedBy: userId,
    changedAt: new Date(),
    note: note || null,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/installation/my-leads
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyLeads = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 500 } = req.query;
    const myId = req.user._id;

    const query = {
      $and: [
        { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] },
        ownerFilter(myId),
      ],
    };

    if (status && status !== "all") {
      query.status = status;
    } else {
      query.status = { $in: INSTALLATION_STATUSES };
    }

    if (search) {
      query.$and.push({
        $or: [
          { customerName: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { address: { $regex: search, $options: "i" } },
        ],
      });
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await SolarLead.countDocuments(query);
    const leads = await SolarLead.find(query)
      .populate("createdBy", "name")
      .populate("assignedTo", "name")
      .populate("installationAssign.installationTeamMemberIds", "name phone")
      .populate("installationAssign.installationTeamMemberId", "name phone")
      .sort({ "installationAssign.assignedAt": -1, "deal.closedAt": -1 })
      .skip(skip)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      leads,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (e) { fail(res, e, "GET MY LEADS"); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/installation/my-leads/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyLead = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({
      _id: req.params.id,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
      ...ownerFilter(req.user._id),
    })
      .populate("createdBy", "name")
      .populate("assignedTo", "name")
      .populate("installationAssign.installationTeamMemberIds", "name phone")
      .populate("installationAssign.installationTeamMemberId", "name phone");

    if (!lead)
      return res.status(404).json({
        success: false,
        message: "Lead not found or not assigned to you",
      });

    ok(res, { lead }, "Lead fetched");
  } catch (e) { fail(res, e, "GET MY LEAD"); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/installation/stats
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyStats = async (req, res) => {
  try {
    const myId = req.user._id;
    const owner = ownerFilter(myId);
    const notDel = { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] };
    const base = { $and: [notDel, owner] };

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [
      total, assigned, installationStarted, installed,
      meterProcess, projectCompleted, todayDue,
    ] = await Promise.all([
      SolarLead.countDocuments({ ...base, status: { $in: INSTALLATION_STATUSES } }),
      SolarLead.countDocuments({ ...base, status: { $in: ["Installation Assigned", "Deal Closed"] } }),
      SolarLead.countDocuments({ ...base, status: "Installation Started" }),
      SolarLead.countDocuments({ ...base, status: { $in: ["Installation Completed", "Installed"] } }),
      SolarLead.countDocuments({ ...base, status: { $in: ["Meter Process", "Meter Applied", "Meter Inspection", "Meter Installed"] } }),
      SolarLead.countDocuments({ ...base, projectCompleted: true }),
      SolarLead.countDocuments({
        ...base,
        "installationAssign.scheduledDate": { $gte: todayStart, $lte: todayEnd },
      }),
    ]);

    ok(res, {
      stats: {
        total, assigned, installationStarted, installed,
        meterProcess, projectCompleted, todayDue,
      },
    }, "Stats fetched");
  } catch (e) { fail(res, e, "GET MY STATS"); }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/installation/my-leads/:id/start
// Advances status → "Installation Started"
// Body: { startDate?, notes? }
// Files: beforePhotos[]
// ─────────────────────────────────────────────────────────────────────────────
exports.startInstallation = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({
      _id: req.params.id,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
      ...ownerFilter(req.user._id),
    });
    if (!lead)
      return res.status(404).json({
        success: false,
        message: "Lead not found or not assigned to you",
      });
    if (rejectIfProjectCompleted(lead, res)) return;

    const { startDate, notes } = req.body;
    const beforePhotos = req.files?.beforePhotos?.map(f => normPath(f.path)) || [];

    // Set the start date on installation subdoc
    lead.installation.startDate = startDate
      ? new Date(startDate)
      : new Date();

    if (notes !== undefined)
      lead.installation.notes = notes || null;

    if (beforePhotos.length > 0) {
      lead.installation.beforePhotos = [
        ...(lead.installation.beforePhotos || []),
        ...beforePhotos,
      ];
    }

    // Set team name from current user or installationAssign
    lead.installation.teamAssigned =
      req.user.name ||
      lead.installationAssign?.installationTeamName ||
      lead.deal?.installationTeamName ||
      null;

    setCompatibleStatus(lead, "Installation Started", [
      "Installation Assigned",
      "Installed",
      "Deal Closed",
    ]);
    pushStageHistory(lead, "Installation Started", req.user._id);

    lead.markModified("installation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, { lead }, "Installation started");
  } catch (e) { fail(res, e, "START INSTALLATION"); }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/installation/my-leads/:id/installation
// Advances status → "Installation Completed"
// ─────────────────────────────────────────────────────────────────────────────
exports.submitInstallation = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({
      _id: req.params.id,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
      ...ownerFilter(req.user._id),
    });
    if (!lead)
      return res.status(404).json({
        success: false,
        message: "Lead not found or not assigned to you",
      });
    if (rejectIfProjectCompleted(lead, res)) return;

    const { installationDate, systemTested, customerSigned, notes } = req.body;
    const afterPhotos = req.files?.afterPhotos?.map(f => normPath(f.path)) || [];
    // Also allow beforePhotos on this endpoint for backwards compat
    const beforePhotos = req.files?.beforePhotos?.map(f => normPath(f.path)) || [];

    lead.installation.teamAssigned =
      req.user.name ||
      lead.installationAssign?.installationTeamName ||
      lead.deal?.installationTeamName ||
      null;

    if (installationDate !== undefined)
      lead.installation.installationDate = installationDate ? new Date(installationDate) : null;
    if (systemTested !== undefined)
      lead.installation.systemTested = systemTested === "true" || systemTested === true;
    if (customerSigned !== undefined)
      lead.installation.customerSigned = customerSigned === "true" || customerSigned === true;
    if (notes !== undefined)
      lead.installation.notes = notes || null;

    if (beforePhotos.length > 0)
      lead.installation.beforePhotos = [
        ...(lead.installation.beforePhotos || []),
        ...beforePhotos,
      ];
    if (afterPhotos.length > 0)
      lead.installation.installationPhotos = [
        ...(lead.installation.installationPhotos || []),
        ...afterPhotos,
      ];

    lead.installation.completedAt = new Date();
    setCompatibleStatus(lead, "Installation Completed", [
      "Installed",
      "Meter Process",
      "Installation Started",
    ]);
    pushStageHistory(lead, "Installation Completed", req.user._id);

    if (!lead.projectCompleted) {
      lead.projectCompleted = true;
      lead.projectCompletedAt = new Date();
      setCompatibleStatus(lead, "Project Completed", [
        "Meter Installed",
        "Meter Process",
        "Installation Completed",
        "Installed",
      ]);
      pushStageHistory(lead, "Project Completed", req.user._id);
    }

    lead.markModified("installation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, { lead }, "Installation submitted");
  } catch (e) { fail(res, e, "SUBMIT INSTALLATION"); }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/installation/my-leads/:id/meter
// All meter sub-stages keep status = "Meter Process".
// The Flutter app derives the sub-stage from which date fields are set:
//   applicationDate set → sub-stage: applied
//   inspectionDate  set → sub-stage: inspection
//   installedDate   set → sub-stage: installed  (also auto-completes project)
// ─────────────────────────────────────────────────────────────────────────────
exports.submitMeter = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({
      _id: req.params.id,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
      ...ownerFilter(req.user._id),
    });
    if (!lead)
      return res.status(404).json({
        success: false,
        message: "Lead not found or not assigned to you",
      });
    if (rejectIfProjectCompleted(lead, res)) return;

    const { applicationDate, inspectionDate, installedDate, notes } = req.body;

    if (applicationDate !== undefined)
      lead.meter.applicationDate = applicationDate ? new Date(applicationDate) : null;
    if (inspectionDate !== undefined)
      lead.meter.inspectionDate = inspectionDate ? new Date(inspectionDate) : null;
    if (installedDate !== undefined)
      lead.meter.installedDate = installedDate ? new Date(installedDate) : null;
    if (notes !== undefined)
      lead.meter.notes = notes || null;

    // All meter sub-stages use the same status string — Flutter derives
    // the sub-stage from which date fields are populated.
    setCompatibleStatus(lead, "Meter Process", [
      "Meter Installed",
      "Installation Completed",
      "Installed",
    ]);
    pushStageHistory(lead, "Meter Process", req.user._id);

    // Auto-complete project when meter is installed
    if (installedDate && !lead.projectCompleted) {
      lead.projectCompleted = true;
      lead.projectCompletedAt = new Date();
      setCompatibleStatus(lead, "Project Completed", [
        "Meter Installed",
        "Meter Process",
        "Installation Completed",
        "Installed",
      ]);
    }

    lead.markModified("meter");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, { lead }, "Meter updated");
  } catch (e) { fail(res, e, "SUBMIT METER"); }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/installation/my-leads/:id/complete
// ─────────────────────────────────────────────────────────────────────────────
exports.completeProject = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({
      _id: req.params.id,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
      ...ownerFilter(req.user._id),
    });
    if (!lead)
      return res.status(404).json({
        success: false,
        message: "Lead not found or not assigned to you",
      });

    if (lead.projectCompleted)
      return ok(res, { lead }, "Project already marked complete");

    if (!lead.meter?.installedDate)
      return res.status(400).json({
        success: false,
        message: "Meter must be installed before completing the project",
      });

    lead.projectCompleted = true;
    lead.projectCompletedAt = new Date();
    setCompatibleStatus(lead, "Project Completed", [
      "Meter Installed",
      "Meter Process",
      "Installation Completed",
      "Installed",
    ]);
    pushStageHistory(lead, "Project Completed", req.user._id);

    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, { lead }, "Project marked complete");
  } catch (e) { fail(res, e, "COMPLETE PROJECT"); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/installation/my-leads/:id/payment
// ─────────────────────────────────────────────────────────────────────────────
exports.collectPayment = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({
      _id: req.params.id,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
      ...ownerFilter(req.user._id),
    });
    if (!lead)
      return res.status(404).json({
        success: false,
        message: "Lead not found or not assigned to you",
      });

    const { amount, mode, type, notes } = req.body;
    if (!amount || !mode)
      return res.status(400).json({
        success: false,
        message: "amount and mode are required",
      });

    const validModes = ["cash", "bankTransfer", "cheque", "upi"];
    if (!validModes.includes(mode))
      return res.status(400).json({
        success: false,
        message: `Invalid payment mode. Use one of: ${validModes.join(", ")}`,
      });

    lead.payment.paymentHistory.push({
      amount: Number(amount),
      mode,
      type: type || "partial",
      notes: notes || null,
      date: new Date(),
      recordedBy: req.user._id,
    });

    const totalPaid = lead.payment.paymentHistory.reduce(
      (sum, p) => sum + (Number(p.amount) || 0), 0
    );
    lead.payment.amountReceived = totalPaid;
    lead.payment.remainingBalance = Math.max(
      (lead.payment.totalAmount || 0) - totalPaid, 0
    );

    if (lead.payment.remainingBalance <= 0) {
      lead.payment.completedAt = new Date();
      lead.status = "Payment Completed";
      lead.isCompleted = true;
      pushStageHistory(lead, "Payment Completed", req.user._id);
    }

    lead.markModified("payment");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, { lead }, "Payment recorded");
  } catch (e) { fail(res, e, "COLLECT PAYMENT"); }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/installation/my-leads/:id/notes
// ─────────────────────────────────────────────────────────────────────────────
exports.saveNotes = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({
      _id: req.params.id,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
      ...ownerFilter(req.user._id),
    });
    if (!lead)
      return res.status(404).json({
        success: false,
        message: "Lead not found or not assigned to you",
      });

    if (req.body.notes !== undefined) lead.installation.notes = req.body.notes || null;
    lead.markModified("installation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, { lead }, "Notes saved");
  } catch (e) { fail(res, e, "SAVE NOTES"); }
};