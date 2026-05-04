// Backend/controllers/sprinklerlead.controller.js
// Updated to support installation team assignment + installation flow steps.

const SprinklerLead = require("../models/sprinklerlead.model");
const User = require("../models/user.model");
const { notifyAdmins, notifyUser } = require("../services/notification.service");

// ── Helpers ───────────────────────────────────────────────────────────────────

const roleOf = (user) => String(user?.role || "").toLowerCase();

const resolveCompatibleStep = (newStep) => {
  const allowed = SprinklerLead.schema.path("currentStep")?.enumValues || [];
  const fallbackMap = {
    visitData: ["siteVisit"],
    quotation: ["visitData", "siteVisit"],
    installationAssigned: ["dealDone"],
    installationStarted: ["installationAssigned", "dealDone"],
    installationCompleted: ["installationStarted", "dealDone"],
    systemTested: ["installationCompleted", "dealDone"],
    projectCompleted: ["fullPayment", "systemTested"],
  };
  if (allowed.includes(newStep)) return newStep;
  const fallback = (fallbackMap[newStep] || []).find((s) => allowed.includes(s));
  return fallback || newStep;
};

const advanceStep = (lead, newStep, userId, note = "") => {
  const stepToSet = resolveCompatibleStep(newStep);
  lead.currentStep = stepToSet;
  lead.statusHistory.push({ step: stepToSet, updatedBy: userId, updatedAt: new Date(), note });
  if (stepToSet === "projectCompleted") lead.isCompleted = true;
};

const getInstallerIdsFromLead = (lead) => {
  const ids = [];

  const rawIds = lead.installationAssign?.installationTeamMemberIds;
  if (Array.isArray(rawIds)) {
    for (const raw of rawIds) {
      if (!raw) continue;
      if (typeof raw === "string") ids.push(raw);
      else if (raw._id) ids.push(raw._id.toString());
      else if (raw.id) ids.push(raw.id.toString());
      else if (typeof raw.toString === "function") ids.push(raw.toString());
    }
  }

  const legacy = lead.installationAssign?.installationTeamMemberId;
  if (legacy) {
    if (typeof legacy === "string") ids.push(legacy);
    else if (legacy._id) ids.push(legacy._id.toString());
    else if (legacy.id) ids.push(legacy.id.toString());
    else if (typeof legacy.toString === "function") ids.push(legacy.toString());
  }

  return [...new Set(ids.filter(Boolean))];
};

const checkOwnership = (lead, user) => {
  const role = roleOf(user);
  if (role === "admin") return true;
  // Keep sprinkler ownership behavior aligned with solar workflow:
  // any sales user can access/update sprinkler leads from sales dashboards.
  if (role === "sales") return true;
  if (role === "installation") {
    const assignedIds = getInstallerIdsFromLead(lead);
    return assignedIds.includes(user._id.toString());
  }
  return false;
};

const checkInstallerOwnership = (lead, user) => {
  if (roleOf(user) === "admin") return true;
  const assignedIds = getInstallerIdsFromLead(lead);
  return assignedIds.includes(user._id.toString());
};

const computeFollowupStatus = (nextFollowupDate, isCompleted) => {
  if (isCompleted) return "completed";
  if (!nextFollowupDate) return null;
  const today = new Date();
  const next = new Date(nextFollowupDate);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const nextMid = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  if (nextMid < todayMid) return "overdue";
  if (nextMid.getTime() === todayMid.getTime()) return "today";
  return "pending";
};

const suggestNextDate = (interestLevel) => {
  const now = new Date();
  if (interestLevel === "hot") now.setDate(now.getDate() + 3);
  if (interestLevel === "warm") now.setDate(now.getDate() + 7);
  if (interestLevel === "cold") now.setDate(now.getDate() + 15);
  return now;
};

// Only saves referenceName when source is "reference"; clears it otherwise.
const resolveReferenceName = (source, referenceName) => {
  if (source === "reference") {
    return referenceName?.trim() || null;
  }
  return null;
};

const normalizeLeadSource = (rawSource) => {
  if (rawSource === undefined || rawSource === null || rawSource === "") {
    return null;
  }
  const value = String(rawSource).trim().toLowerCase();
  const map = {
    // Current app values
    call: "call",
    reference: "reference",
    social_media: "social_media",
    "social media": "social_media",
    epc_reference: "epc_reference",
    "epc-reference": "epc_reference",
    epcreference: "epc_reference",
    indiamart: "indiamart",
    other: "other",

    // Legacy aliases
    marketing: "social_media",
    "walk-in": "other",
    walkin: "other",
  };
  return map[value] || value;
};

const populateLead = (query) =>
  query
    .populate("assignedTo", "name phone")
    .populate("createdBy", "name")
    .populate("installationAssign.installationTeamMemberIds", "name phone")
    .populate("installationAssign.installationTeamMemberId", "name phone");

// ── CREATE ───────────────────────────────────────────────────────────────────
exports.createLead = async (req, res) => {
  try {
    const { customerName, phone, address, village, farmSize, waterSource,
      cropType, source, referenceName, note } = req.body;

    if (!customerName || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: "customerName, phone and address are required"
      });
    }

    const lead = await SprinklerLead.create({
      customerName, phone, address,
      village: village || "",
      farmSize: farmSize ? Number(farmSize) : null,
      waterSource: waterSource || null,
      cropType: cropType || "",
      source: normalizeLeadSource(source),
      referenceName: resolveReferenceName(normalizeLeadSource(source), referenceName),
      note: note || "",
      createdBy: req.user._id,
      assignedTo: roleOf(req.user) === "sales" ? req.user._id : null,
      currentStep: "newLead",
      statusHistory: [{ step: "newLead", updatedBy: req.user._id, updatedAt: new Date() }],
    });

    notifyAdmins({
      title: "New Sprinkler Lead",
      body: `${customerName} — ${address}`,
      data: { type: "sprinkler_lead", leadId: lead._id.toString() },
    });

    res.status(201).json({ success: true, message: "Sprinkler lead created", lead });
  } catch (err) {
    console.error("CREATE:", err.message);
    if (err?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── GET ALL ──────────────────────────────────────────────────────────────────
exports.getAllLeads = async (req, res) => {
  try {
    const query = { isDeleted: { $ne: true } };
    if (req.query.status) query.currentStep = req.query.status;
    if (req.query.isCompleted) query.isCompleted = req.query.isCompleted === "true";
    if (req.query.search) {
      query.$or = [
        { customerName: { $regex: req.query.search, $options: "i" } },
        { phone: { $regex: req.query.search, $options: "i" } },
      ];
    }
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      SprinklerLead.find(query)
        .populate("createdBy", "name")
        .populate("assignedTo", "name")
        .populate("installationAssign.installationTeamMemberId", "name phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SprinklerLead.countDocuments(query),
    ]);
    res.status(200).json({
      success: true, total, page,
      pages: Math.ceil(total / limit), leads
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── GET SINGLE ───────────────────────────────────────────────────────────────
exports.getSingleLead = async (req, res) => {
  try {
    const lead = await populateLead(
      SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    );
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const canAccess = roleOf(req.user) === "installation"
      ? checkInstallerOwnership(lead, req.user)
      : checkOwnership(lead, req.user);
    if (!canAccess) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    res.status(200).json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── UPDATE BASIC INFO ────────────────────────────────────────────────────────
exports.updateBasicInfo = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const allowed = ["customerName", "phone", "address", "village", "farmSize",
      "waterSource", "cropType", "source", "referenceName", "note"];
    allowed.forEach(k => {
      if (req.body[k] === undefined) return;
      if (k === "source") {
        lead.source = normalizeLeadSource(req.body.source);
      } else if (k === "referenceName") {
        // skip here — handled after loop
      } else {
        lead[k] = req.body[k];
      }
    });
    // Re-resolve referenceName whenever source or referenceName changes
    if (req.body.source !== undefined || req.body.referenceName !== undefined) {
      lead.referenceName = resolveReferenceName(
        lead.source,
        req.body.referenceName !== undefined ? req.body.referenceName : lead.referenceName
      );
    }
    await lead.save();
    res.status(200).json({ success: true, lead });
  } catch (err) {
    if (err?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── ASSIGN SALES ─────────────────────────────────────────────────────────────
exports.assignLead = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { assignedTo: req.body.assignedTo }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    res.status(200).json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── ASSIGN INSTALLATION TEAM (Admin only) ─────────────────────────────────────
exports.assignInstaller = async (req, res) => {
  try {
    let installerIds = req.body.installerIds;
    if (!Array.isArray(installerIds)) {
      installerIds = req.body.installerId ? [req.body.installerId] : [];
    }
    installerIds = [...new Set(installerIds.filter(Boolean))];

    if (installerIds.length === 0) {
      return res.status(400).json({ success: false, message: "installerIds is required" });
    }

    const installers = await User.find({ _id: { $in: installerIds } }).select("name phone role");
    if (installers.length !== installerIds.length) {
      return res.status(404).json({ success: false, message: "One or more installer users not found" });
    }

    const nonInstallation = installers.find((u) => roleOf(u) !== "installation");
    if (nonInstallation) {
      return res.status(400).json({
        success: false,
        message: `User role is "${nonInstallation.role}". Only users with role "installation" can be assigned.`,
      });
    }

    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (lead.currentStep !== "dealDone" && lead.currentStep !== "installationAssigned") {
      return res.status(400).json({
        success: false,
        message: `Cannot assign installer at step "${lead.currentStep}". Lead must be at "dealDone".`,
      });
    }

    const { scheduledDate, notes } = req.body;
    const installerNames = installers.map((u) => u.name).filter(Boolean);

    lead.installationAssign = {
      installationTeamMemberIds: installerIds,
      installationTeamNames: installerNames,
      // legacy single-member compatibility fields
      installationTeamMemberId: installerIds[0] || null,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      notes: notes || null,
      assignedAt: new Date(),
      assignedBy: req.user._id,
    };
    advanceStep(lead, "installationAssigned", req.user._id,
      `Installation team assigned: ${installerNames.join(", ") || installerIds.length + " member(s)"}`);

    await lead.save();

    const populated = await populateLead(SprinklerLead.findById(lead._id));
    for (const installerId of installerIds) {
      notifyUser(installerId, {
        title: "New Installation Assigned",
        body: `Sprinkler lead "${lead.customerName}" has been assigned to you`,
        data: { type: "sprinkler_installation", leadId: lead._id.toString() },
      });
    }

    res.status(200).json({
      success: true,
      message: `Installation team assigned successfully to ${installerIds.length} member(s)`,
      lead: populated,
    });
  } catch (err) {
    console.error("ASSIGN INSTALLER:", err.message);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

// ── GET MY INSTALLATION LEADS ──────────────────────────────────────────────
exports.getMyInstallationLeads = async (req, res) => {
  try {
    const myId = req.user._id;
    const myIdStr = myId.toString();
    const query = {
      $and: [
        { isDeleted: { $ne: true } },
        {
          $or: [
            { "installationAssign.installationTeamMemberIds": myId },
            { "installationAssign.installationTeamMemberIds": myIdStr },
            { "installationAssign.installationTeamMemberId": myId },
            { "installationAssign.installationTeamMemberId": myIdStr },
          ],
        },
      ],
      currentStep: {
        $in: ["installationAssigned", "installationStarted", "installationCompleted", "systemTested", "projectCompleted"],
      },
    };

    if (req.query.status) query.currentStep = req.query.status;
    if (req.query.search) {
      query.$and.push({
        $or: [
          { customerName: { $regex: req.query.search, $options: "i" } },
          { phone: { $regex: req.query.search, $options: "i" } },
        ],
      });
    }

    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const leads = await SprinklerLead.find(query)
      .populate("assignedTo", "name")
      .populate("installationAssign.installationTeamMemberIds", "name phone")
      .populate("installationAssign.installationTeamMemberId", "name phone")
      .sort({ "installationAssign.assignedAt": -1 })
      .limit(limit);

    res.status(200).json({ success: true, total: leads.length, leads });
  } catch (err) {
    console.error("GET MY INSTALLATION LEADS:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── START INSTALLATION ────────────────────────────────────────────────────────
exports.startInstallation = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (roleOf(req.user) === "sales") {
      if (!checkOwnership(lead, req.user)) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    } else if (!checkInstallerOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Allow first start from assignment/deal and later updates for progressed leads.
    const validForStart = [
      "installationAssigned",
      "dealDone",
      "installationStarted",
      "installationCompleted",
      "systemTested",
      "fullPayment",
      "projectCompleted",
    ];
    if (!validForStart.includes(lead.currentStep)) {
      return res.status(400).json({
        success: false,
        message: `Lead is at "${lead.currentStep}". Installation start details cannot be updated from this step.`,
      });
    }

    const photos = req.files?.beforePhotos ? req.files.beforePhotos.map(f => f.path) : [];

    if (!lead.installation) lead.installation = {};

    if (req.body.startedAt !== undefined) {
      const dt = new Date(req.body.startedAt);
      if (isNaN(dt.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid startedAt date format",
        });
      }
      lead.installation.startedAt = dt;
    } else if (!lead.installation.startedAt) {
      lead.installation.startedAt = new Date();
    }

    if (req.body.notes) lead.installation.notes = req.body.notes;
    if (photos.length > 0) {
      lead.installation.beforePhotos = [
        ...(lead.installation.beforePhotos || []),
        ...photos,
      ];
    }

    const shouldAdvance = ["installationAssigned", "dealDone"].includes(lead.currentStep);
    if (shouldAdvance) {
      advanceStep(lead, "installationStarted", req.user._id, req.body.notes || "Installation started");
    }
    await lead.save();

    const populated = await populateLead(SprinklerLead.findById(lead._id));
    res.status(200).json({
      success: true,
      message: shouldAdvance ? "Installation started" : "Installation start details updated",
      lead: populated,
    });
  } catch (err) {
    console.error("START INSTALLATION:", err.message);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

// ── COMPLETE INSTALLATION ─────────────────────────────────────────────────────
exports.completeInstallation = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (roleOf(req.user) === "sales") {
      if (!checkOwnership(lead, req.user)) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    } else if (!checkInstallerOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Allow first submit + later edits from progressed steps.
    const validForComplete = [
      "installationStarted",
      "installationAssigned",
      "dealDone",
      "installationCompleted",
      "systemTested",
      "fullPayment",
      "projectCompleted",
    ];
    if (!validForComplete.includes(lead.currentStep)) {
      return res.status(400).json({
        success: false,
        message: `Lead is at "${lead.currentStep}". Installation details cannot be updated from this step.`,
      });
    }

    const {
      technicianName,
      installationDate,
      materialUsed,
      extraMaterial,
      workNotes,
      notes,
      pendingWork,
      pendingWorkNote,
      systemTested,
      paymentReceived,
      followUpDate,
      completedBy,
      customerReview,
    } = req.body;
    const photos = req.files?.installPhotos ? req.files.installPhotos.map(f => f.path) : [];

    if (!lead.installation) lead.installation = {};
    if (technicianName !== undefined) {
      lead.installation.technicianName = technicianName ? technicianName.trim() : null;
    }
    if (installationDate !== undefined) {
      lead.installation.installationDate = installationDate ? new Date(installationDate) : null;
    }
    if (materialUsed !== undefined) {
      lead.installation.materialUsed = materialUsed ? materialUsed.trim() : null;
    }
    if (extraMaterial !== undefined) {
      lead.installation.extraMaterial = extraMaterial ? extraMaterial.trim() : null;
    }
    if (workNotes !== undefined) {
      lead.installation.workNotes = workNotes ? workNotes.trim() : null;
    }
    if (notes !== undefined) {
      lead.installation.notes = notes ? notes.trim() : null;
    }

    if (pendingWork !== undefined) {
      const hasPending = pendingWork === true || pendingWork === "true";
      lead.installation.pendingWork = hasPending;
      if (!hasPending) {
        lead.installation.pendingWorkNote = null;
      }
    }

    if (pendingWorkNote !== undefined) {
      lead.installation.pendingWorkNote = pendingWorkNote ? pendingWorkNote.trim() : null;
    }

    if (systemTested !== undefined) {
      lead.installation.systemTested = systemTested === true || systemTested === "true";
      if (lead.installation.systemTested && !lead.installation.testedAt) {
        lead.installation.testedAt = new Date();
      }
    }

    if (paymentReceived !== undefined) {
      const received = paymentReceived === true || paymentReceived === "true";
      lead.installation.paymentReceived = received;
      if (received) {
        lead.installation.followUpDate = null;
      }
    }

    if (followUpDate !== undefined) {
      lead.installation.followUpDate = followUpDate ? new Date(followUpDate) : null;
    }

    if (completedBy !== undefined) {
      lead.installation.completedBy = completedBy ? completedBy.trim() : null;
    }

    if (customerReview !== undefined) {
      lead.installation.customerReview = customerReview ? customerReview.trim() : null;
    }

    if (!lead.installation.completedAt) {
      lead.installation.completedAt = new Date();
    }
    if (photos.length > 0) {
      lead.installation.installPhotos = [
        ...(lead.installation.installPhotos || []),
        ...photos,
      ];
    }

    if (["installationStarted", "installationAssigned", "dealDone"].includes(lead.currentStep)) {
      advanceStep(lead, "installationCompleted", req.user._id, notes || "Installation completed");
    }
    await lead.save();

    const populated = await populateLead(SprinklerLead.findById(lead._id));
    res.status(200).json({ success: true, message: "Installation completed", lead: populated });
  } catch (err) {
    console.error("COMPLETE INSTALLATION:", err.message);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

// ── ADD FOLLOWUP ENTRY ───────────────────────────────────────────────────────
exports.addFollowupEntry = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });

    const { remark, interestLevel, followupType, nextFollowupDate,
      callDuration, attachment } = req.body;

    if (!remark || !followupType || !nextFollowupDate) {
      return res.status(400).json({
        success: false,
        message: "remark, followupType and nextFollowupDate are required",
      });
    }

    const validInterest = ["hot", "warm", "cold"];
    const validType = ["call", "visit", "whatsapp", "meeting", "paymentReminder"];
    if (interestLevel != null && !validInterest.includes(interestLevel))
      return res.status(400).json({ success: false, message: "interestLevel must be hot, warm, or cold" });
    if (!validType.includes(followupType))
      return res.status(400).json({ success: false, message: "Invalid followupType" });

    if (lead.nextFollowupDate) {
      const prevDate = new Date(lead.nextFollowupDate);
      const todayMid = new Date();
      todayMid.setHours(0, 0, 0, 0);
      if (prevDate < todayMid) lead.missedFollowupCount = (lead.missedFollowupCount || 0) + 1;
    }

    lead.followupHistory.push({
      remark, interestLevel, followupType,
      nextFollowupDate: new Date(nextFollowupDate),
      callDuration: callDuration ? Number(callDuration) : null,
      attachment: attachment || null,
      updatedBy: req.user._id,
      createdAt: new Date(),
    });

    lead.lastFollowupDate = new Date();
    lead.lastRemark = remark;
    if (interestLevel !== undefined) lead.interestLevel = interestLevel || null;
    lead.followupType = followupType;
    lead.nextFollowupDate = new Date(nextFollowupDate);
    lead.followupCount = (lead.followupCount || 0) + 1;

    await lead.save();
    res.status(200).json({
      success: true,
      message: "Follow-up entry added",
      followupStatus: computeFollowupStatus(lead.nextFollowupDate, lead.isCompleted),
      suggestedNextDate: interestLevel ? suggestNextDate(interestLevel) : null,
      lead,
    });
  } catch (err) {
    console.error("ADD FOLLOWUP:", err.message);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

// ── GET FOLLOWUP HISTORY ─────────────────────────────────────────────────────
exports.getFollowupHistory = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .select("customerName phone followupHistory nextFollowupDate lastFollowupDate interestLevel followupCount missedFollowupCount isCompleted");
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });

    res.status(200).json({
      success: true,
      customerName: lead.customerName,
      followupCount: lead.followupCount,
      missedFollowupCount: lead.missedFollowupCount,
      interestLevel: lead.interestLevel,
      nextFollowupDate: lead.nextFollowupDate,
      lastFollowupDate: lead.lastFollowupDate,
      followupStatus: computeFollowupStatus(lead.nextFollowupDate, lead.isCompleted),
      history: [...lead.followupHistory].reverse(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── MARK FOLLOWUP DONE ───────────────────────────────────────────────────────
exports.markFollowupDone = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });
    lead.nextFollowupDate = null;
    lead.lastFollowupDate = new Date();
    await lead.save();
    res.status(200).json({ success: true, message: "Follow-up marked as done", lead });
  } catch (err) {
    console.error("MARK FOLLOWUP DONE:", err.message);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

// ── STEP 2: SITE VISIT ───────────────────────────────────────────────────────
exports.updateSiteVisit = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });

    const { visitDate, visitTime, salesPerson, fieldConditionNotes,
      waterAvailabilityNotes, notes } = req.body;
    const photos = req.files ? req.files.map(f => f.path) : [];

    lead.siteVisit = {
      visitDate: visitDate ? new Date(visitDate) : null,
      visitTime: visitTime || null,
      salesPerson: salesPerson || null,
      fieldConditionNotes: fieldConditionNotes || null,
      waterAvailabilityNotes: waterAvailabilityNotes || null,
      notes: notes || null,
      sitePhotos: photos,
      visitedAt: new Date(),
    };
    advanceStep(lead, "siteVisit", req.user._id, notes || "Site visited");
    await lead.save();
    res.status(200).json({ success: true, message: "Site visit saved", lead });
  } catch (err) {
    console.error("SITE VISIT:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ── STEP 3: VISIT DATA ──────────────────────────────────────────────────────
// PUT /sprinkler_lead/:id/visit-data
// Saves panel, pump, pipe, sprinkler and site data collected during field visit.
exports.updateVisitData = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });

    const {
      noOfPanels, pumpCapacity, typeOfPump,
      deliveryPipeLength, noOfSprinklers,
      cableLength, typeOfSite, notes,
    } = req.body;
    const uploadedPhotos = Array.isArray(req.files)
      ? req.files.map((f) => f.path)
      : [];
    const existingPhotos = Array.isArray(lead.visitData?.visitPhotoPaths)
      ? lead.visitData.visitPhotoPaths
      : [];

    lead.visitData = {
      noOfPanels:         noOfPanels         ? Number(noOfPanels)         : null,
      pumpCapacity:       pumpCapacity        || null,
      typeOfPump:         typeOfPump          || null,
      deliveryPipeLength: deliveryPipeLength  ? Number(deliveryPipeLength) : null,
      noOfSprinklers:     noOfSprinklers      ? Number(noOfSprinklers)     : null,
      cableLength:        cableLength         ? Number(cableLength)        : null,
      typeOfSite:         typeOfSite          || null,
      notes:              notes               || null,
      visitPhotoPaths:    uploadedPhotos.length > 0
        ? [...existingPhotos, ...uploadedPhotos]
        : existingPhotos,
      savedAt:            new Date(),
    };

    advanceStep(lead, "visitData", req.user._id, notes || "Visit data saved");
    await lead.save();
    res.status(200).json({ success: true, message: "Visit data saved", lead });
  } catch (err) {
    console.error("VISIT DATA:", err.message);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

// ── STEP 4: QUOTATION ────────────────────────────────────────────────────────
exports.updateQuotation = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });

    const {
      lineItems,
      noOfPanels, noOfKW, noOfSprinklerSet, typeOfSprinkler,
      pumpDetails, sprinkleType, upvcPipeSizes, cableDetails, upvcFittings, controlPanel,
      pipeLength, sprinklerQty, fittings, labourCost, transportCost,
      totalAmount, discount,
      advancePercent, balancePercent, warrantyNote,
      notes,
    } = req.body;

    let parsedLineItems = [];
    if (Array.isArray(lineItems)) {
      parsedLineItems = lineItems;
    } else if (typeof lineItems === "string" && lineItems.trim()) {
      try {
        const decoded = JSON.parse(lineItems);
        if (Array.isArray(decoded)) parsedLineItems = decoded;
      } catch (_) {
        parsedLineItems = [];
      }
    }

    const normalizedLineItems = parsedLineItems
      .map((item) => {
        const description = String(item?.description || "").trim();
        const quantity = String(item?.quantity || "").trim();
        const unitPrice = Number(item?.unitPrice) || 0;
        const total = Number(item?.total) || 0;
        return { description, quantity, unitPrice, total };
      })
      .filter((item) => item.description);

    const computedLineTotal = normalizedLineItems.reduce(
      (sum, item) => sum + item.total,
      0,
    );

    const total =
      totalAmount !== undefined && totalAmount !== null
        ? Number(totalAmount) || 0
        : computedLineTotal;
    const disc = Number(discount) || 0;
    const finalAmt = Math.max(total - disc, 0);
    const existingQuotation = lead.quotation || {};

    lead.quotation = {
      lineItems: normalizedLineItems,
      noOfPanels: noOfPanels ? Number(noOfPanels) : null,
      noOfKW: noOfKW ? Number(noOfKW) : null,
      noOfSprinklerSet: noOfSprinklerSet ? Number(noOfSprinklerSet) : null,
      typeOfSprinkler: typeOfSprinkler || null,
      pumpDetails: pumpDetails || null,
      sprinkleType: sprinkleType || null,
      upvcPipeSizes: upvcPipeSizes || null,
      cableDetails: cableDetails || null,
      upvcFittings: upvcFittings || null,
      controlPanel: controlPanel || null,
      pipeLength: pipeLength ? Number(pipeLength) : null,
      sprinklerQty: sprinklerQty ? Number(sprinklerQty) : null,
      fittings: fittings || null,
      labourCost: Number(labourCost) || 0,
      transportCost: Number(transportCost) || 0,
      totalAmount: total,
      discount: disc,
      finalAmount: finalAmt,
      advancePercent: advancePercent ? Number(advancePercent) : 60,
      balancePercent: balancePercent ? Number(balancePercent) : 40,
      warrantyNote: warrantyNote || null,
      notes: notes || null,
      sentAt: new Date(),
      quotationPdfPath: existingQuotation.quotationPdfPath || null,
      quotationPdfUploadedAt: existingQuotation.quotationPdfUploadedAt || null,
    };
    lead.totalAmount = finalAmt;
    advanceStep(lead, "quotation", req.user._id, notes || "Quotation sent");
    await lead.save();
    res.status(200).json({ success: true, message: "Quotation saved", lead });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};



// ── STEP 4b: UPLOAD QUOTATION PDF ───────────────────────────────────────────
exports.uploadQuotationPdf = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!req.file)
      return res.status(400).json({ success: false, message: "quotationPdf is required" });

    lead.quotation.quotationPdfPath = req.file.path.replace(/\\/g, "/");
    lead.quotation.quotationPdfUploadedAt = new Date();
    lead.markModified("quotation");
    await lead.save();

    res.status(200).json({ success: true, message: "Quotation PDF uploaded", lead });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
};

// ── STEP 4: FOLLOWUP ────────────────────────────────────────────────────────
exports.updateFollowup = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { followupDate, response, customerType, remarks, notes, interestLevel, followupType } = req.body;

    const validResponses = ["thinking", "negotiation", "revisionNeeded", "rejected", "interested", "notInterested"];
    if (response && !validResponses.includes(response))
      return res.status(400).json({ success: false, message: "Invalid response value" });

    lead.followup = {
      followupDate:  followupDate ? new Date(followupDate) : null,
      response:      response     || null,
      customerType:  customerType || null,
      remarks:       remarks      || null,
      notes:         notes        || null,
      createdAt:     new Date(),
    };

    if (followupDate && interestLevel && followupType && (notes || remarks)) {
      const validInterest = ["hot", "warm", "cold"];
      const validType = ["call", "visit", "whatsapp", "meeting", "paymentReminder"];
      if (validInterest.includes(interestLevel) && validType.includes(followupType)) {
        lead.followupHistory.push({
          remark: notes || remarks,
          interestLevel, followupType,
          nextFollowupDate: new Date(followupDate),
          updatedBy: req.user._id,
          createdAt: new Date(),
        });
        lead.lastFollowupDate = new Date();
        lead.lastRemark = notes || remarks;
        lead.interestLevel = interestLevel;
        lead.followupType = followupType;
        lead.followupCount = (lead.followupCount || 0) + 1;
      }
    }

    if (followupDate) lead.nextFollowupDate = new Date(followupDate);
    advanceStep(lead, "followup", req.user._id, notes || "Followup added");
    await lead.save();
    res.status(200).json({ success: true, message: "Followup saved", lead });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── STEP 4b: EDIT FOLLOWUP (PATCH — no step advance) ─────────────────────────
exports.editFollowup = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { followupDate, response, customerType, remarks, notes } = req.body;
    const validResponses = ["thinking", "negotiation", "revisionNeeded", "rejected", "interested", "notInterested"];
    if (response && !validResponses.includes(response))
      return res.status(400).json({ success: false, message: "Invalid response value" });

    if (followupDate   !== undefined) lead.followup.followupDate  = followupDate ? new Date(followupDate) : null;
    if (response       !== undefined) lead.followup.response      = response     || null;
    if (customerType   !== undefined) lead.followup.customerType  = customerType || null;
    if (remarks        !== undefined) lead.followup.remarks       = remarks      || null;
    if (notes          !== undefined) lead.followup.notes         = notes        || null;
    if (followupDate   !== undefined) lead.nextFollowupDate       = followupDate ? new Date(followupDate) : null;

    lead.markModified("followup");
    await lead.save();
    res.status(200).json({ success: true, message: "Followup updated", lead });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── STEP 5: DEAL DONE ───────────────────────────────────────────────────────
exports.updateDeal = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });

    const { finalDealAmount, discountGiven, advancePayment,
      paymentMode, notes } = req.body;

    lead.deal = {
      finalDealAmount: Number(finalDealAmount) || null,
      discountGiven: Number(discountGiven) || 0,
      advancePayment: Number(advancePayment) || null,
      paymentMode: paymentMode || null,
      notes: notes || null,
      closedAt: new Date(),
    };

    if (advancePayment && Number(advancePayment) > 0) {
      if (!lead.payment) lead.payment = { paymentHistory: [], amountReceived: 0 };
      lead.payment.paymentHistory.push({
        amount: Number(advancePayment),
        mode: paymentMode || "cash",
        type: "advance",
        notes: "Advance at deal close",
        date: lead.deal.closedAt,
        recordedBy: req.user._id,
      });
      const total = Number(finalDealAmount) || 0;
      lead.payment.totalAmount = total;
      lead.payment.amountReceived = Number(advancePayment);
      lead.payment.remainingBalance = Math.max(total - Number(advancePayment), 0);
    }

    advanceStep(lead, "dealDone", req.user._id, notes || "Deal closed");
    await lead.save();
    res.status(200).json({ success: true, message: "Deal closed", lead });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── LEGACY STEP 6: INSTALLATION (kept for backwards compat) ──────────────────
exports.updateInstallation = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (roleOf(req.user) === "sales" && !checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });

    const { technicianName, installationDate, materialUsed,
      extraMaterial, workNotes, notes } = req.body;
    const photos = req.files ? req.files.map(f => f.path) : [];

    lead.installation = {
      ...(lead.installation || {}),
      technicianName: technicianName || null,
      installationDate: installationDate ? new Date(installationDate) : null,
      materialUsed: materialUsed || null,
      extraMaterial: extraMaterial || null,
      workNotes: workNotes || null,
      notes: notes || null,
      installPhotos: photos,
      completedAt: new Date(),
      systemTested: true,
    };
    advanceStep(lead, "systemTested", req.user._id, notes || "Installation done");
    await lead.save();
    res.status(200).json({ success: true, message: "Installation saved", lead });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── PAYMENT ──────────────────────────────────────────────────────────────────
exports.addPayment = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    if (!["admin", "sales"].includes(roleOf(req.user))) {
      return res.status(403).json({ success: false, message: "Only admin or sales can record payment" });
    }
    if (!checkOwnership(lead, req.user))
      return res.status(403).json({ success: false, message: "Access denied" });

    const { amount, mode, type, transactionId, notes } = req.body;
    if (!amount || !mode)
      return res.status(400).json({ success: false, message: "amount and mode are required" });

    if (!lead.payment) {
      lead.payment = {
        paymentHistory: [], amountReceived: 0,
        totalAmount: lead.deal?.finalDealAmount || lead.totalAmount || 0
      };
    }

    lead.payment.paymentHistory.push({
      amount: Number(amount), mode,
      type: type || "partial",
      transactionId: transactionId || null,
      notes: notes || null,
      date: new Date(),
      recordedBy: req.user._id,
    });

    const totalPaid = lead.payment.paymentHistory.reduce((s, p) => s + p.amount, 0);
    const totalAmount = lead.deal?.finalDealAmount || lead.totalAmount || 0;
    lead.payment.amountReceived = totalPaid;
    lead.payment.remainingBalance = Math.max(totalAmount - totalPaid, 0);
    lead.payment.totalAmount = totalAmount;
    advanceStep(lead, "fullPayment", req.user._id, "Payment updated");

    if (lead.payment.remainingBalance <= 0) {
      lead.payment.completedAt = new Date();
      advanceStep(lead, "projectCompleted", req.user._id, "Payment cleared; project auto-completed");
    }

    await lead.save();
    res.status(200).json({ success: true, message: "Payment recorded", lead });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── REVIEW ───────────────────────────────────────────────────────────────────
exports.updateReview = async (req, res) => {
  try {
    return res.status(410).json({
      success: false,
      message: "Customer review has been removed from sprinkler workflow",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── DELETE — hard delete (admin only) ────────────────────────────────────────
// Permanently removes the entire document from MongoDB.
// Guard: admin role only.
exports.deleteLead = async (req, res) => {
  try {
    const lead = await SprinklerLead.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    // Only admin can delete
    if (roleOf(req.user) !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can delete leads",
      });
    }

    // Hard delete — permanently removes the entire document including all
    // embedded data: siteVisit, quotation, technicalVisit, followup, deal,
    // installationAssign, installation, payment, review, followupHistory,
    // statusHistory, and all stored photo paths.
    await SprinklerLead.deleteOne({ _id: req.params.id });

    res.status(200).json({
      success: true,
      message: `Lead for "${lead.customerName}" permanently deleted`,
      hardDeleted: true,
    });
  } catch (err) {
    console.error("DELETE LEAD:", err.message);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};