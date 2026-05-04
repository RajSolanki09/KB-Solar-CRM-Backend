const mongoose = require("mongoose");

const { Schema } = mongoose;

const followupHistorySchema = new Schema(
  {
    remark: { type: String, required: true },
    interestLevel: {
      type: String,
      enum: ["hot", "warm", "cold", null],
      default: null,
    },
    followupType: {
      type: String,
      enum: ["call", "visit", "whatsapp", "meeting", "paymentReminder"],
      required: true,
    },
    nextFollowupDate: { type: Date, required: true },
    callDuration: { type: Number, default: null },
    attachment: { type: String, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const solarLeadSchema = new Schema(
  {
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    village: { type: String, default: "" },
    landSize: { type: Number, default: null },
    requiredKW: { type: Number, default: null },
    electricityConnection: { type: String, default: null },
    source: {
      type: String,
      enum: ["call", "reference", "marketing", "walk-in", "other", null],
      default: null,
    },
    referenceName: { type: String, default: null, trim: true },
    note: { type: String, default: null },

    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    status: {
      type: String,
      enum: [
        "New Lead",
        "Visit Scheduled",
        "Technical Visit",
        "Quotation Sent",
        "Follow-up",
        "Deal Closed",
        "Installation Assigned",
        "Installation Started",
        "Installation Completed",
        "Agreement Upload",
        "Meter Process",
        "Portal Submitted",
        "Subsidy Completed",
        "Payment Completed",
        "Project Completed",
        "Cancelled",
      ],
      default: "New Lead",
    },
    isCompleted: { type: Boolean, default: false },
    projectCompleted: { type: Boolean, default: false },
    projectCompletedAt: { type: Date, default: null },

    stageHistory: [
      {
        stage: String,
        changedBy: { type: Schema.Types.ObjectId, ref: "User" },
        changedAt: { type: Date, default: Date.now },
        note: String,
      },
    ],

    followupHistory: { type: [followupHistorySchema], default: [] },
    interestLevel: {
      type: String,
      enum: ["hot", "warm", "cold", null],
      default: null,
    },
    followupType: {
      type: String,
      enum: ["call", "visit", "whatsapp", "meeting", "paymentReminder", null],
      default: null,
    },
    nextFollowupDate: { type: Date, default: null },
    lastFollowupDate: { type: Date, default: null },
    lastRemark: { type: String, default: null },
    followupCount: { type: Number, default: 0 },
    missedFollowupCount: { type: Number, default: 0 },

    visitScheduled: {
      visitDate: { type: Date, default: null },
      salesAssigned: { type: String, default: null }, // display name string
      salesAssignedId: { type: Schema.Types.ObjectId, ref: "User", default: null }, // FK to User 
      notes: { type: String, default: null },
      scheduledAt: { type: Date, default: null },
    },

    technicalVisit: {
      systemKW: { type: String, default: null },
      meterPhase: {
        type: String,
        enum: ["single_phase", "three_phase", null],
        default: null,
      },
      inverterBoardType: { type: String, default: null },
      panelBoardType: { type: String, default: null },
      panelCapacity: { type: String, default: null },
      cableType: { type: String, default: null },
      acDBType: { type: String, default: null },
      structureHeight: { type: String, default: null },
      beamLineDetails: { type: String, default: null },
      totalArray: { type: String, default: null },
      scaffoldingDetails: { type: String, default: null },
      panelLayout: { type: String, default: null },
      lugType: { type: String, default: null },
      dbConfigSingle: { type: String, default: null },
      dbConfigThree: { type: String, default: null },
      estimatedCost: { type: String, default: null },
      additionalNotes: { type: String, default: null },
      technicalPhotos: [{ type: String }],
      visitedAt: { type: Date, default: null },
    },

    quotation: {
      systemSize: { type: String, default: null },
      panelType: { type: String, default: null },
      inverterType: { type: String, default: null },
      structureType: { type: String, default: null },
      wiringDetails: { type: String, default: null },
      rooftopSystemCost: { type: Number, default: 0 },
      elevatedStructureCost: { type: Number, default: 0 },
      netMeterCost: { type: Number, default: 0 },
      premiumOtherCost: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
      subsidyAmount: { type: Number, default: 0 },
      customerPayable: { type: Number, default: 0 },
      advancePercent: { type: Number, default: 60 },
      balancePercent: { type: Number, default: 40 },
      warrantyNote: { type: String, default: null },
      notes: { type: String, default: null },
      quotationPdfPath: { type: String, default: null },
      quotationPdfUploadedAt: { type: Date, default: null },
      sentAt: { type: Date, default: null },
    },

    followup: {
      followupDate: { type: Date, default: null },
      response: {
        type: String,
        enum: ["thinking", "negotiation", "revisionNeeded", "rejected", null],
        default: null,
      },
      outcome: {
        type: String,
        enum: ["thinking", "negotiation", "revisionNeeded", "rejected", null],
        default: null,
      },
      customerType: {
        type: String,
        enum: ["hot", "medium", "cold", null],
        default: null,
      },
      notes: { type: String, default: null },
      createdAt: { type: Date, default: null },
    },

    deal: {
      finalAmount: { type: Number, default: null },
      advancePayment: { type: Number, default: null },
      paymentMode: {
        type: String,
        enum: ["cash", "bankTransfer", "cheque", "upi", "loan", null],
        default: null,
      },
      expectedInstallDate: { type: Date, default: null },
      installationTeamMemberId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      installationTeamName: { type: String, default: null },
      notes: { type: String, default: null },
      closedAt: { type: Date, default: null },
    },

    installationAssign: {
      // Multi-member support: arrays are the canonical fields
      installationTeamMemberIds: [
        { type: Schema.Types.ObjectId, ref: "User", default: null },
      ],
      installationTeamNames: [{ type: String }],
      // Legacy single-member fields kept for backward compat with old data
      installationTeamMemberId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      installationTeamName: { type: String, default: null },
      scheduledDate: { type: Date, default: null },
      notes: { type: String, default: null },
      assignedAt: { type: Date, default: null },
    },

    installation: {
      teamAssigned: { type: String, default: null },
      startDate: { type: Date, default: null },
      installationDate: { type: Date, default: null },
      beforePhotos: [{ type: String }],
      installationPhotos: [{ type: String }],
      systemTested: { type: Boolean, default: false },
      customerSigned: { type: Boolean, default: false },
      notes: { type: String, default: null },
      completedAt: { type: Date, default: null },
      // Completion details (added for Installation Completed step)
      pendingWork: { type: Boolean, default: false },
      pendingWorkNote: { type: String, default: null },
      testing: { type: Boolean, default: null },
      paymentReceived: { type: Boolean, default: null },
      followUpDate: { type: Date, default: null },
      completedBy: { type: String, default: null },
      customerReview: { type: String, default: null },
      // Completion checklist (added for Installation Completed step form)
      structureDone: { type: Boolean, default: false },
      wiringDone: { type: Boolean, default: false },
      plumeDone: { type: Boolean, default: false },
      inverterAcDone: { type: Boolean, default: false },
      fullyComplete: { type: Boolean, default: false },
      completedDate: { type: Date, default: null },
      structureVendorName: { type: String, default: null },
      structureVendorCo: { type: String, default: null },
      wiringVendorName: { type: String, default: null },
      wiringVendorCo: { type: String, default: null },
    },

    agreementUpload: {
      agreementUploaded: { type: Boolean, default: false },
      installationDetailsProvided: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ["underReview", "approved", "rejected", null],
        default: null,
      },
      updatedAt: { type: Date, default: null },
    },

    meter: {
      applicationDate: { type: Date, default: null },
      inspectionDate: { type: Date, default: null },
      installedDate: { type: Date, default: null },
      gebFileHandover: { type: Boolean, default: null },
      meterInstallationStatus: {
        type: String,
        enum: ['done', 'pending', null],
        default: null,
      },
      systemRunStatus: {
        type: String,
        enum: ['done', 'pending', null],
        default: null,
      },
      notes: { type: String, default: null },
    },

    portal: {
      applicationId: { type: String, default: null },
      status: {
        type: String,
        enum: ["pending", "underReview", "approved", "rejected", null],
        default: null,
      },
      documents: {
        aadhar: { type: String, default: null },
        electricityBill: { type: String, default: null },
        landDocuments: { type: String, default: null },
        agreement: { type: String, default: null },
      },
      notes: { type: String, default: null },
      submittedAt: { type: Date, default: null },
    },

    subsidy: {
      subsidyClaim: { type: Boolean, default: null },
      receivedAmount: { type: Boolean, default: null },
      notes: { type: String, default: null },
    },

    payment: {
      totalAmount: { type: Number, default: 0 },
      amountReceived: { type: Number, default: 0 },
      remainingBalance: { type: Number, default: 0 },
      paymentHistory: [
        {
          amount: Number,
          mode: String,
          type: { type: String, enum: ["advance", "partial", "final"] },
          notes: String,
          date: { type: Date, default: Date.now },
          recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
        },
      ],
      completedAt: { type: Date, default: null },
    },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

solarLeadSchema.index({ status: 1 });
solarLeadSchema.index({ assignedTo: 1 });
solarLeadSchema.index({ createdAt: -1 });
solarLeadSchema.index({ nextFollowupDate: 1 });
solarLeadSchema.index({ interestLevel: 1 });
solarLeadSchema.index({ isDeleted: 1 });

module.exports = mongoose.model("SolarLead", solarLeadSchema);
// Backend/controllers/solarlead.controller.js
const SolarLead = require("../models/solarlead.model");
const { notifyAdmins, notifyUser } = require("../services/notification.service");

const ok = (res, lead, message = "Success") =>
  res.status(200).json({ success: true, message, lead });
const err = (res, e, label = "ERROR") => {
  console.error(`${label}:`, e.message);
  console.error(`${label} STACK:`, e.stack);
  res.status(500).json({ success: false, message: e.message });
};
const normPath = (p) => p.replace(/\\/g, "/");
const checkOwnership = (lead, user) => {
  const role = user?.role?.toLowerCase?.() || "";
  if (role === "admin") return true;
  if (role === "sales") return true;
  return true;
};

// ── Helper: resolve referenceName based on source ────────────────────────────
// Only saves referenceName when source is "reference"; clears it otherwise.
const resolveReferenceName = (source, referenceName) => {
  if (source === "reference") {
    return referenceName?.trim() || null;
  }
  return null;
};

exports.createLead = async (req, res) => {
  try {
    const {
      customerName, phone, mobile, address, village,
      landSize, requiredKW, electricityConnection,
      source, referenceName, note,
    } = req.body;

    if (!customerName || !(phone || mobile) || !address) {
      return res.status(400).json({
        success: false,
        message: "customerName, phone and address are required",
      });
    }

    const lead = await SolarLead.create({
      customerName,
      phone: phone || mobile,
      address,
      village: village || "",
      landSize: landSize || null,
      requiredKW: requiredKW || null,
      electricityConnection: electricityConnection || null,
      source: source || null,
      // Only store referenceName when source is "reference"
      referenceName: resolveReferenceName(source, referenceName),
      note: note || null,
      createdBy: req.user?._id,
      status: "New Lead",
    });

    await lead.populate("createdBy", "name");

    notifyAdmins({
      title: "New Solar Lead",
      body: `${customerName} — ${address}`,
      data: { type: "solar_lead", leadId: lead._id.toString() },
    });

    res.status(201).json({ success: true, message: "Lead created", lead });
  } catch (e) { err(res, e, "CREATE LEAD"); }
};

exports.getAllLeads = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = { isDeleted: false };
    if (status && status !== "all") query.status = status;
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        // Also search by referenceName so admins can find referral leads
        { referenceName: { $regex: search, $options: "i" } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const total = await SolarLead.countDocuments(query);
    const leads = await SolarLead.find(query)
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));
    res.status(200).json({
      success: true, leads, total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (e) { err(res, e, "GET ALL LEADS"); }
};

exports.getSingleLead = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false })
      .populate("createdBy", "name");
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    ok(res, lead, "Lead fetched");
  } catch (e) { err(res, e, "GET SINGLE LEAD"); }
};

exports.updateBasicInfo = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const {
      customerName, phone, mobile, address, village,
      landSize, requiredKW, electricityConnection,
      source, referenceName,
    } = req.body;

    if (customerName !== undefined) lead.customerName = customerName;
    if (phone || mobile) lead.phone = phone || mobile;
    if (address !== undefined) lead.address = address;
    if (village !== undefined) lead.village = village || "";
    if (landSize !== undefined) lead.landSize = landSize || null;
    if (requiredKW !== undefined) lead.requiredKW = requiredKW || null;
    if (electricityConnection !== undefined) lead.electricityConnection = electricityConnection || null;

    // If source changes, re-evaluate referenceName
    if (source !== undefined) {
      lead.source = source || null;
      // Always re-resolve referenceName when source is updated
      lead.referenceName = resolveReferenceName(
        source,
        referenceName !== undefined ? referenceName : lead.referenceName
      );
    } else if (referenceName !== undefined) {
      // source didn't change, but referenceName was explicitly updated
      lead.referenceName = resolveReferenceName(lead.source, referenceName);
    }

    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Lead updated");
  } catch (e) { err(res, e, "UPDATE BASIC INFO"); }
};

exports.assignLead = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { assignedTo } = req.body;
    if (!assignedTo) return res.status(400).json({ success: false, message: "assignedTo is required" });
    lead.assignedTo = assignedTo;
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Lead assigned");
  } catch (e) { err(res, e, "ASSIGN LEAD"); }
};

exports.deleteLead = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    lead.isDeleted = true;
    await lead.save();
    res.status(200).json({ success: true, message: "Lead deleted" });
  } catch (e) { err(res, e, "DELETE LEAD"); }
};

// ── STEP 1: VISIT SCHEDULED ───────────────────────────────────────────────────
exports.updateVisitSchedule = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { visitDate, salesAssigned, geoLocation, notes } = req.body;
    if (visitDate !== undefined) lead.visitScheduled.visitDate = visitDate ? new Date(visitDate) : null;
    if (salesAssigned !== undefined) lead.visitScheduled.salesAssigned = salesAssigned || null;
    if (geoLocation !== undefined) lead.visitScheduled.geoLocation = geoLocation || null;
    if (notes !== undefined) lead.visitScheduled.notes = notes || null;
    lead.visitScheduled.scheduledAt = new Date();
    lead.status = "Visit Scheduled";
    lead.markModified("visitScheduled");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Visit scheduled");
  } catch (e) { err(res, e, "UPDATE VISIT SCHEDULE"); }
};

// ── STEP 3: QUOTATION ─────────────────────────────────────────────────────────
exports.updateQuotation = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const {
      systemSize, panelType, inverterType, structureType, wiringDetails,
      totalAmount, subsidyAmount,
      advancePercent, balancePercent, warrantyNote,
      notes,
    } = req.body;

    if (systemSize !== undefined) lead.quotation.systemSize = systemSize;
    if (panelType !== undefined) lead.quotation.panelType = panelType;
    if (inverterType !== undefined) lead.quotation.inverterType = inverterType;
    if (structureType !== undefined) lead.quotation.structureType = structureType;
    if (wiringDetails !== undefined) lead.quotation.wiringDetails = wiringDetails;
    if (warrantyNote !== undefined) lead.quotation.warrantyNote = warrantyNote || null;
    if (notes !== undefined) lead.quotation.notes = notes || null;
    if (advancePercent !== undefined) lead.quotation.advancePercent = Number(advancePercent) || 60;
    if (balancePercent !== undefined) lead.quotation.balancePercent = Number(balancePercent) || 40;

    if (totalAmount !== undefined || subsidyAmount !== undefined) {
      const total = Number(totalAmount ?? lead.quotation.totalAmount) || 0;
      const subsidy = Number(subsidyAmount ?? lead.quotation.subsidyAmount) || 0;
      lead.quotation.totalAmount = total;
      lead.quotation.subsidyAmount = subsidy;
      lead.quotation.customerPayable = Math.max(total - subsidy, 0);
    }

    lead.quotation.sentAt = new Date();
    lead.status = "Quotation Sent";
    lead.markModified("quotation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Quotation saved");
  } catch (e) { err(res, e, "UPDATE QUOTATION"); }
};

// ── STEP 4: FOLLOWUP ──────────────────────────────────────────────────────────
exports.updateFollowup = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { followupDate, notes, outcome } = req.body;
    if (followupDate !== undefined) lead.followup.followupDate = followupDate ? new Date(followupDate) : null;
    if (notes !== undefined) lead.followup.notes = notes || null;
    if (outcome !== undefined) lead.followup.outcome = outcome || null;
    lead.followup.createdAt = new Date();
    if (followupDate !== undefined) lead.nextFollowupDate = followupDate ? new Date(followupDate) : null;
    lead.status = "Follow-up";
    lead.markModified("followup");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Followup saved");
  } catch (e) { err(res, e, "UPDATE FOLLOWUP"); }
};

exports.addFollowupEntry = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { remark, interestLevel, followupType, nextFollowupDate, callDuration, attachment } = req.body;
    if (!remark || !followupType || !nextFollowupDate) {
      return res.status(400).json({ success: false, message: "remark, followupType and nextFollowupDate are required" });
    }
    lead.followupHistory.push({
      remark, interestLevel, followupType,
      nextFollowupDate: new Date(nextFollowupDate),
      callDuration: callDuration || null,
      attachment: attachment || null,
    });
    if (interestLevel !== undefined) lead.interestLevel = interestLevel || null;
    lead.followupType = followupType;
    lead.nextFollowupDate = new Date(nextFollowupDate);
    lead.lastFollowupDate = new Date();
    lead.lastRemark = remark;
    lead.followupCount = (lead.followupCount || 0) + 1;
    lead.markModified("followupHistory");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Followup entry added");
  } catch (e) { err(res, e, "ADD FOLLOWUP ENTRY"); }
};

exports.getFollowupHistory = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    res.status(200).json({ success: true, history: lead.followupHistory || [] });
  } catch (e) { err(res, e, "GET FOLLOWUP HISTORY"); }
};

exports.markFollowupDone = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    lead.nextFollowupDate = null;
    lead.lastFollowupDate = new Date();
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Follow-up marked as done");
  } catch (e) { err(res, e, "MARK FOLLOWUP DONE"); }
};

// ── STEP 5: DEAL CLOSED ───────────────────────────────────────────────────────
exports.updateDeal = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { finalAmount, advancePayment, paymentMode, expectedInstallDate, notes } = req.body;
    const validModes = ["cash", "bankTransfer", "cheque", "upi", "loan"];
    if (paymentMode && !validModes.includes(paymentMode)) {
      return res.status(400).json({ success: false, message: "Invalid payment mode" });
    }
    if (finalAmount !== undefined) lead.deal.finalAmount = Number(finalAmount) || null;
    if (advancePayment !== undefined) lead.deal.advancePayment = Number(advancePayment) || null;
    if (paymentMode !== undefined) lead.deal.paymentMode = paymentMode || null;
    if (expectedInstallDate !== undefined) lead.deal.expectedInstallDate = expectedInstallDate ? new Date(expectedInstallDate) : null;
    if (notes !== undefined) lead.deal.notes = notes || null;
    lead.deal.closedAt = new Date();
    if (finalAmount !== undefined) {
      const total = Number(finalAmount) || 0;
      const paid = Number(advancePayment) || lead.payment.amountReceived || 0;
      lead.payment.totalAmount = total;
      lead.payment.amountReceived = paid;
      lead.payment.remainingBalance = Math.max(total - paid, 0);
      lead.markModified("payment");
    }
    lead.status = "Deal Closed";
    lead.markModified("deal");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Deal saved");
  } catch (e) { err(res, e, "UPDATE DEAL"); }
};

// ── STEP 6: INSTALLATION ASSIGNED ────────────────────────────────────────────
exports.updateInstallationAssign = async (req, res) => {
  try {
    const { installationTeamMemberId, installationTeamName, scheduledDate, notes } = req.body;

    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const update = {
      "installationAssign.assignedAt": new Date(),
      status: "Installation Assigned",
    };

    if (installationTeamMemberId !== undefined)
      update["installationAssign.installationTeamMemberId"] = installationTeamMemberId || null;
    if (installationTeamName !== undefined)
      update["installationAssign.installationTeamName"] = installationTeamName || null;
    if (scheduledDate !== undefined)
      update["installationAssign.scheduledDate"] = scheduledDate ? new Date(scheduledDate) : null;
    if (notes !== undefined)
      update["installationAssign.notes"] = notes || null;

    const updated = await SolarLead.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: update },
      { new: true, runValidators: false }
    ).populate("createdBy", "name");

    if (!updated) return res.status(404).json({ success: false, message: "Lead not found" });

    if (installationTeamMemberId) {
      notifyUser(installationTeamMemberId, {
        title: "New Installation Assigned",
        body: `Solar lead "${updated.customerName}" has been assigned to you`,
        data: { type: "solar_installation", leadId: updated._id.toString() },
      });
    }

    ok(res, updated, "Installation assigned");
  } catch (e) { err(res, e, "UPDATE INSTALLATION ASSIGN"); }
};

// ── STEP 7: INSTALLATION STARTED ─────────────────────────────────────────────
exports.updateInstallationStarted = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const { teamAssigned, startDate, notes } = req.body;
    const beforePhotos = req.files?.beforePhotos?.map(f => normPath(f.path)) || [];
    if (teamAssigned !== undefined) lead.installation.teamAssigned = teamAssigned || null;
    if (startDate !== undefined) lead.installation.startDate = startDate ? new Date(startDate) : null;
    if (notes !== undefined) lead.installation.notes = notes || null;
    if (beforePhotos.length > 0) lead.installation.beforePhotos = beforePhotos;
    lead.status = "Installation Started";
    lead.markModified("installation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Installation started");
  } catch (e) { err(res, e, "UPDATE INSTALLATION STARTED"); }
};

// ── STEP 8: INSTALLATION COMPLETED ───────────────────────────────────────────
exports.updateInstallation = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const { teamAssigned, systemTested, customerSigned, notes } = req.body;
    const afterPhotos = req.files?.afterPhotos?.map(f => normPath(f.path)) || [];
    if (teamAssigned !== undefined) lead.installation.teamAssigned = teamAssigned || null;
    if (systemTested !== undefined) lead.installation.systemTested = systemTested === "true" || systemTested === true;
    if (customerSigned !== undefined) lead.installation.customerSigned = customerSigned === "true" || customerSigned === true;
    if (notes !== undefined) lead.installation.notes = notes || null;
    if (afterPhotos.length > 0) lead.installation.installationPhotos = afterPhotos;
    lead.installation.completedAt = new Date();
    lead.installation.installationDate = new Date();
    lead.status = "Installation Completed";
    lead.markModified("installation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Installation completed");
  } catch (e) { err(res, e, "UPDATE INSTALLATION"); }
};

// ── STEP 9: METER PROCESS ─────────────────────────────────────────────────────
exports.updateMeter = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { applicationDate, inspectionDate, installedDate, notes } = req.body;
    if (applicationDate !== undefined) lead.meter.applicationDate = applicationDate ? new Date(applicationDate) : null;
    if (inspectionDate !== undefined) lead.meter.inspectionDate = inspectionDate ? new Date(inspectionDate) : null;
    if (installedDate !== undefined) lead.meter.installedDate = installedDate ? new Date(installedDate) : null;
    if (notes !== undefined) lead.meter.notes = notes || null;
    lead.status = "Meter Process";
    lead.markModified("meter");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Meter saved");
  } catch (e) { err(res, e, "UPDATE METER"); }
};

// ── STEP 10: PORTAL ───────────────────────────────────────────────────────────
exports.updatePortal = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { applicationId, status, notes } = req.body;
    const validStatus = ["pending", "underReview", "approved", "rejected"];
    if (status && !validStatus.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid portal status" });
    }
    if (applicationId !== undefined) lead.portal.applicationId = applicationId || null;
    if (status !== undefined) lead.portal.status = status || null;
    if (notes !== undefined) lead.portal.notes = notes || null;
    lead.portal.submittedAt = new Date();
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => { lead.portal.documents[f.fieldname] = normPath(f.path); });
      lead.markModified("portal.documents");
    }
    lead.status = "Portal Submitted";
    lead.markModified("portal");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Portal saved");
  } catch (e) { err(res, e, "UPDATE PORTAL"); }
};

// ── STEP 11: SUBSIDY ──────────────────────────────────────────────────────────
exports.updateSubsidy = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { approvalStatus, creditedDate, notes } = req.body;
    const validStatus = ["claimSubmitted", "underReview", "approved", "credited", "rejected"];
    if (approvalStatus && !validStatus.includes(approvalStatus)) {
      return res.status(400).json({ success: false, message: "Invalid subsidy status" });
    }
    if (approvalStatus !== undefined) lead.subsidy.approvalStatus = approvalStatus || null;
    if (creditedDate !== undefined) lead.subsidy.creditedDate = creditedDate ? new Date(creditedDate) : null;
    if (notes !== undefined) lead.subsidy.notes = notes || null;
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => { lead.subsidy.documents[f.fieldname] = normPath(f.path); });
      lead.markModified("subsidy.documents");
    }
    lead.status = "Subsidy Completed";
    lead.markModified("subsidy");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Subsidy saved");
  } catch (e) { err(res, e, "UPDATE SUBSIDY"); }
};

// ── STEP 12: PAYMENT ──────────────────────────────────────────────────────────
exports.addPayment = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { amount, mode, type, notes } = req.body;
    if (!amount || !mode) return res.status(400).json({ success: false, message: "amount and mode are required" });
    const validModes = ["cash", "bankTransfer", "cheque", "upi"];
    if (!validModes.includes(mode)) return res.status(400).json({ success: false, message: "Invalid payment mode" });
    lead.payment.paymentHistory.push({
      amount: Number(amount), mode,
      type: type || "partial",
      notes: notes || null,
      date: new Date(),
      recordedBy: req.user?._id || null,
    });
    const totalPaid = lead.payment.paymentHistory.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    lead.payment.amountReceived = totalPaid;
    lead.payment.remainingBalance = Math.max((lead.payment.totalAmount || 0) - totalPaid, 0);
    if (lead.payment.remainingBalance <= 0) {
      lead.payment.completedAt = new Date();
      lead.status = "Payment Completed";
      lead.isCompleted = true;
    }
    lead.markModified("payment");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Payment recorded");
  } catch (e) { err(res, e, "ADD PAYMENT"); }
};

// ══════════════════════════════════════════════════════════════════════════════
// PATCH — edit existing data (NO stage advance)
// ══════════════════════════════════════════════════════════════════════════════

exports.editVisitSchedule = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { visitDate, salesAssigned, geoLocation, notes } = req.body;
    if (visitDate !== undefined) lead.visitScheduled.visitDate = visitDate ? new Date(visitDate) : null;
    if (salesAssigned !== undefined) lead.visitScheduled.salesAssigned = salesAssigned || null;
    if (geoLocation !== undefined) lead.visitScheduled.geoLocation = geoLocation || null;
    if (notes !== undefined) lead.visitScheduled.notes = notes || null;
    lead.markModified("visitScheduled");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Visit schedule updated");
  } catch (e) { err(res, e, "EDIT VISIT SCHEDULE"); }
};

exports.editQuotation = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const {
      systemSize, panelType, inverterType, structureType, wiringDetails,
      totalAmount, subsidyAmount,
      advancePercent, balancePercent, warrantyNote,
      notes,
    } = req.body;

    if (systemSize !== undefined) lead.quotation.systemSize = systemSize;
    if (panelType !== undefined) lead.quotation.panelType = panelType;
    if (inverterType !== undefined) lead.quotation.inverterType = inverterType;
    if (structureType !== undefined) lead.quotation.structureType = structureType;
    if (wiringDetails !== undefined) lead.quotation.wiringDetails = wiringDetails;
    if (warrantyNote !== undefined) lead.quotation.warrantyNote = warrantyNote || null;
    if (notes !== undefined) lead.quotation.notes = notes || null;
    if (advancePercent !== undefined) lead.quotation.advancePercent = Number(advancePercent) || 60;
    if (balancePercent !== undefined) lead.quotation.balancePercent = Number(balancePercent) || 40;

    if (totalAmount !== undefined || subsidyAmount !== undefined) {
      const total = Number(totalAmount ?? lead.quotation.totalAmount) || 0;
      const subsidy = Number(subsidyAmount ?? lead.quotation.subsidyAmount) || 0;
      lead.quotation.totalAmount = total;
      lead.quotation.subsidyAmount = subsidy;
      lead.quotation.customerPayable = Math.max(total - subsidy, 0);
    }

    lead.markModified("quotation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Quotation updated");
  } catch (e) { err(res, e, "EDIT QUOTATION"); }
};

exports.editFollowup = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { followupDate, outcome, notes } = req.body;
    const validOutcomes = ["thinking", "negotiation", "revisionNeeded", "rejected"];
    if (outcome && !validOutcomes.includes(outcome)) {
      return res.status(400).json({ success: false, message: "Invalid outcome value" });
    }
    if (followupDate !== undefined) lead.followup.followupDate = followupDate ? new Date(followupDate) : null;
    if (outcome !== undefined) lead.followup.outcome = outcome || null;
    if (notes !== undefined) lead.followup.notes = notes || null;
    if (followupDate !== undefined) lead.nextFollowupDate = followupDate ? new Date(followupDate) : null;
    lead.markModified("followup");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Followup updated");
  } catch (e) { err(res, e, "EDIT FOLLOWUP"); }
};

exports.editDeal = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { finalAmount, advancePayment, paymentMode, expectedInstallDate, installationTeamMemberId, installationTeamName, notes } = req.body;
    const validModes = ["cash", "bankTransfer", "cheque", "upi", "loan"];
    if (paymentMode && !validModes.includes(paymentMode)) {
      return res.status(400).json({ success: false, message: "Invalid payment mode" });
    }
    if (finalAmount !== undefined) lead.deal.finalAmount = Number(finalAmount) || null;
    if (advancePayment !== undefined) lead.deal.advancePayment = Number(advancePayment) || null;
    if (paymentMode !== undefined) lead.deal.paymentMode = paymentMode || null;
    if (expectedInstallDate !== undefined) lead.deal.expectedInstallDate = expectedInstallDate ? new Date(expectedInstallDate) : null;
    if (installationTeamMemberId !== undefined) lead.deal.installationTeamMemberId = installationTeamMemberId || null;
    if (installationTeamName !== undefined) lead.deal.installationTeamName = installationTeamName || null;
    if (notes !== undefined) lead.deal.notes = notes || null;
    if (finalAmount !== undefined) {
      const total = Number(finalAmount) || 0;
      lead.payment.totalAmount = total;
      lead.payment.remainingBalance = Math.max(total - (lead.payment.amountReceived || 0), 0);
      lead.markModified("payment");
    }
    lead.markModified("deal");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Deal updated");
  } catch (e) { err(res, e, "EDIT DEAL"); }
};

exports.editInstallationAssign = async (req, res) => {
  try {
    const { installationTeamMemberId, installationTeamName, scheduledDate, notes } = req.body;

    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const update = {};
    if (installationTeamMemberId !== undefined)
      update["installationAssign.installationTeamMemberId"] = installationTeamMemberId || null;
    if (installationTeamName !== undefined)
      update["installationAssign.installationTeamName"] = installationTeamName || null;
    if (scheduledDate !== undefined)
      update["installationAssign.scheduledDate"] = scheduledDate ? new Date(scheduledDate) : null;
    if (notes !== undefined)
      update["installationAssign.notes"] = notes || null;

    const updated = await SolarLead.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: update },
      { new: true, runValidators: false }
    ).populate("createdBy", "name");

    if (!updated) return res.status(404).json({ success: false, message: "Lead not found" });
    ok(res, updated, "Installation assign updated");
  } catch (e) { err(res, e, "EDIT INSTALLATION ASSIGN"); }
};

exports.editInstallation = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const { teamAssigned, systemTested, customerSigned, notes } = req.body;
    const beforePhotos = req.files?.beforePhotos?.map(f => normPath(f.path)) || [];
    const afterPhotos = req.files?.afterPhotos?.map(f => normPath(f.path)) || [];
    if (teamAssigned !== undefined) lead.installation.teamAssigned = teamAssigned || null;
    if (systemTested !== undefined) lead.installation.systemTested = systemTested === "true" || systemTested === true;
    if (customerSigned !== undefined) lead.installation.customerSigned = customerSigned === "true" || customerSigned === true;
    if (notes !== undefined) lead.installation.notes = notes || null;
    if (beforePhotos.length > 0) lead.installation.beforePhotos = beforePhotos;
    if (afterPhotos.length > 0) lead.installation.installationPhotos = afterPhotos;
    lead.markModified("installation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Installation updated");
  } catch (e) { err(res, e, "EDIT INSTALLATION"); }
};

exports.editMeter = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { applicationDate, inspectionDate, installedDate, notes } = req.body;
    if (applicationDate !== undefined) lead.meter.applicationDate = applicationDate ? new Date(applicationDate) : null;
    if (inspectionDate !== undefined) lead.meter.inspectionDate = inspectionDate ? new Date(inspectionDate) : null;
    if (installedDate !== undefined) lead.meter.installedDate = installedDate ? new Date(installedDate) : null;
    if (notes !== undefined) lead.meter.notes = notes || null;
    lead.markModified("meter");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Meter updated");
  } catch (e) { err(res, e, "EDIT METER"); }
};

exports.editPortal = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { applicationId, status, notes } = req.body;
    const validStatus = ["pending", "underReview", "approved", "rejected"];
    if (status && !validStatus.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid portal status" });
    }
    if (applicationId !== undefined) lead.portal.applicationId = applicationId || null;
    if (status !== undefined) lead.portal.status = status || null;
    if (notes !== undefined) lead.portal.notes = notes || null;
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => { lead.portal.documents[f.fieldname] = normPath(f.path); });
      lead.markModified("portal.documents");
    }
    lead.markModified("portal");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Portal updated");
  } catch (e) { err(res, e, "EDIT PORTAL"); }
};

exports.editSubsidy = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { approvalStatus, creditedDate, notes } = req.body;
    const validStatus = ["claimSubmitted", "underReview", "approved", "credited", "rejected"];
    if (approvalStatus && !validStatus.includes(approvalStatus)) {
      return res.status(400).json({ success: false, message: "Invalid subsidy status" });
    }
    if (approvalStatus !== undefined) lead.subsidy.approvalStatus = approvalStatus || null;
    if (creditedDate !== undefined) lead.subsidy.creditedDate = creditedDate ? new Date(creditedDate) : null;
    if (notes !== undefined) lead.subsidy.notes = notes || null;
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => { lead.subsidy.documents[f.fieldname] = normPath(f.path); });
      lead.markModified("subsidy.documents");
    }
    lead.markModified("subsidy");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Subsidy updated");
  } catch (e) { err(res, e, "EDIT SUBSIDY"); }
};

exports.editPayment = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const { amount, mode, type, notes } = req.body;
    const validModes = ["cash", "bankTransfer", "cheque", "upi"];
    if (mode && !validModes.includes(mode)) {
      return res.status(400).json({ success: false, message: "Invalid payment mode" });
    }
    lead.payment.paymentHistory.push({
      amount: Number(amount), mode,
      type: type || "partial",
      notes: notes || null,
      date: new Date(),
      recordedBy: req.user?._id || null,
    });
    const totalPaid = lead.payment.paymentHistory.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    lead.payment.amountReceived = totalPaid;
    lead.payment.remainingBalance = Math.max((lead.payment.totalAmount || 0) - totalPaid, 0);
    lead.markModified("payment");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Payment recorded");
  } catch (e) { err(res, e, "EDIT PAYMENT"); }
};