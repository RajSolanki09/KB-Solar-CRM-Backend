// Backend/controllers/solarlead.controller.js
const SolarLead = require("../models/solarlead.model");
const User = require("../models/user.model");
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

const resolveSalesPerson = async (salesAssignedId) => {
  if (!salesAssignedId) return { id: null, name: null };
  try {
    const user = await User.findById(salesAssignedId).select("name fullName");
    if (!user) return { id: null, name: null };
    return {
      id: user._id,
      name: user.name || user.fullName || null,
    };
  } catch {
    return { id: null, name: null };
  }
};

const recalcQuotationTotals = (quotation) => {
  const rooftop = Number(quotation.rooftopSystemCost) || 0;
  const elevated = Number(quotation.elevatedStructureCost) || 0;
  const meter = Number(quotation.netMeterCost) || 0;
  const premium = Number(quotation.premiumOtherCost) || 0;
  const subsidy = Number(quotation.subsidyAmount) || 0;

  // total cost = rooftop + elevated + net meter + premium/other
  quotation.totalAmount = rooftop + elevated + meter + premium;
  // system cost after subsidy = total cost - subsidy
  quotation.customerPayable = quotation.totalAmount - subsidy;
};

const normalizeAgreementStatus = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'under review' || raw === 'under_review') return 'underReview';
  if (raw === 'underreview') return 'underReview';
  if (raw === 'approved') return 'approved';
  if (raw === 'rejected') return 'rejected';
  return null;
};

const toMoney = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getLeadTotalAmount = (lead) => {
  return toMoney(lead?.deal?.finalAmount) || toMoney(lead?.totalAmount);
};

const ensurePaymentState = (lead) => {
  if (!lead.payment) lead.payment = {};
  if (!Array.isArray(lead.payment.paymentHistory)) {
    lead.payment.paymentHistory = [];
  }
  if (lead.payment.totalAmount === undefined || lead.payment.totalAmount === null) {
    lead.payment.totalAmount = getLeadTotalAmount(lead);
  }
};

const upsertAdvancePaymentEntry = (lead, { amount, mode, recordedBy, date }) => {
  ensurePaymentState(lead);

  lead.payment.paymentHistory = lead.payment.paymentHistory.filter(
    (p) => !(p?.type === "advance" && p?.notes === "Advance at deal close")
  );

  if (amount > 0) {
    lead.payment.paymentHistory.unshift({
      amount,
      mode: mode || "cash",
      type: "advance",
      notes: "Advance at deal close",
      date: date || new Date(),
      recordedBy: recordedBy || null,
    });
  }
};

const recalcPaymentTotals = (lead) => {
  ensurePaymentState(lead);
  const totalAmount = toMoney(lead.payment.totalAmount) || getLeadTotalAmount(lead);
  const totalPaid = lead.payment.paymentHistory.reduce(
    (sum, p) => sum + toMoney(p?.amount),
    0
  );

  lead.payment.totalAmount = totalAmount;
  lead.payment.amountReceived = totalPaid;
  lead.payment.remainingBalance = Math.max(totalAmount - totalPaid, 0);

  if (lead.payment.remainingBalance <= 0 && totalAmount > 0) {
    lead.payment.completedAt = new Date();
  }
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

    const { visitDate, salesAssignedId, notes } = req.body;

    // visitDate — ISO string with time baked in (e.g. "2025-04-10T14:30:00.000Z")
    if (visitDate !== undefined) {
      lead.visitScheduled.visitDate = visitDate ? new Date(visitDate) : null;
    }

    // salesAssignedId — ObjectId string; null means "None" selected
    // Use "in req.body" so we process it even when the value is explicitly null
    if ("salesAssignedId" in req.body) {
      const sp = await resolveSalesPerson(salesAssignedId);
      lead.visitScheduled.salesAssignedId = sp.id;   // ObjectId FK — NEW field
      lead.visitScheduled.salesAssigned = sp.name; // display name string
    }

    // notes — always save even null so clearing works on edit
    if ("notes" in req.body) {
      lead.visitScheduled.notes = notes || null;
    }

    lead.visitScheduled.scheduledAt = new Date();
    lead.status = "Visit Scheduled";
    lead.markModified("visitScheduled");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Visit scheduled");
  } catch (e) { err(res, e, "UPDATE VISIT SCHEDULE"); }
};

// ── STEP 2b: TECHNICAL VISIT ─────────────────────────────────────────────────
exports.updateTechnicalVisit = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const {
      systemKW,
      meterPhase,
      inverterBoardType,
      panelBoardType,
      panelCapacity,
      cableType,
      acDBType,
      structureHeight,
      beamLineDetails,
      totalArray,
      scaffoldingDetails,
      panelLayout,
      lugType,
      dbConfigSingle,
      dbConfigThree,
      estimatedCost,
      additionalNotes,
    } = req.body;

    const photos = req.files ? req.files.map((f) => normPath(f.path)) : [];

    if (systemKW !== undefined) lead.technicalVisit.systemKW = systemKW || null;
    if (meterPhase !== undefined) lead.technicalVisit.meterPhase = meterPhase || null;
    if (inverterBoardType !== undefined) lead.technicalVisit.inverterBoardType = inverterBoardType || null;
    if (panelBoardType !== undefined) lead.technicalVisit.panelBoardType = panelBoardType || null;
    if (panelCapacity !== undefined) lead.technicalVisit.panelCapacity = panelCapacity || null;
    if (cableType !== undefined) lead.technicalVisit.cableType = cableType || null;
    if (acDBType !== undefined) lead.technicalVisit.acDBType = acDBType || null;
    if (structureHeight !== undefined) lead.technicalVisit.structureHeight = structureHeight || null;
    if (beamLineDetails !== undefined) lead.technicalVisit.beamLineDetails = beamLineDetails || null;
    if (totalArray !== undefined) lead.technicalVisit.totalArray = totalArray || null;
    if (scaffoldingDetails !== undefined) lead.technicalVisit.scaffoldingDetails = scaffoldingDetails || null;
    if (panelLayout !== undefined) lead.technicalVisit.panelLayout = panelLayout || null;
    if (lugType !== undefined) lead.technicalVisit.lugType = lugType || null;
    if (dbConfigSingle !== undefined) lead.technicalVisit.dbConfigSingle = dbConfigSingle || null;
    if (dbConfigThree !== undefined) lead.technicalVisit.dbConfigThree = dbConfigThree || null;
    if (estimatedCost !== undefined) lead.technicalVisit.estimatedCost = estimatedCost || null;
    if (additionalNotes !== undefined) lead.technicalVisit.additionalNotes = additionalNotes || null;
    if (photos.length > 0) lead.technicalVisit.technicalPhotos = photos;

    lead.technicalVisit.visitedAt = new Date();
    lead.status = "Technical Visit";
    lead.markModified("technicalVisit");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Technical visit saved");
  } catch (e) { err(res, e, "UPDATE TECHNICAL VISIT"); }
};

// ── STEP 3: QUOTATION ─────────────────────────────────────────────────────────
exports.updateQuotation = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const {
      systemSize, panelType, inverterType, structureType, wiringDetails,
      rooftopSystemCost, elevatedStructureCost, netMeterCost, premiumOtherCost,
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

    if (rooftopSystemCost !== undefined) {
      lead.quotation.rooftopSystemCost = Number(rooftopSystemCost) || 0;
    }
    if (elevatedStructureCost !== undefined) {
      lead.quotation.elevatedStructureCost = Number(elevatedStructureCost) || 0;
    }
    if (netMeterCost !== undefined) {
      lead.quotation.netMeterCost = Number(netMeterCost) || 0;
    }
    if (premiumOtherCost !== undefined) {
      lead.quotation.premiumOtherCost = Number(premiumOtherCost) || 0;
    }
    if (subsidyAmount !== undefined) {
      lead.quotation.subsidyAmount = Number(subsidyAmount) || 0;
    }

    if (
      rooftopSystemCost !== undefined ||
      elevatedStructureCost !== undefined ||
      netMeterCost !== undefined ||
      premiumOtherCost !== undefined ||
      subsidyAmount !== undefined
    ) {
      recalcQuotationTotals(lead.quotation);
    } else if (totalAmount !== undefined || subsidyAmount !== undefined) {
      const total = Number(totalAmount ?? lead.quotation.totalAmount) || 0;
      const subsidy = Number(subsidyAmount ?? lead.quotation.subsidyAmount) || 0;
      lead.quotation.totalAmount = total;
      lead.quotation.subsidyAmount = subsidy;
      lead.quotation.customerPayable = total - subsidy;
    }

    lead.quotation.sentAt = new Date();
    lead.status = "Quotation Sent";
    lead.markModified("quotation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Quotation saved");
  } catch (e) { err(res, e, "UPDATE QUOTATION"); }
};

exports.uploadQuotationPdf = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!req.file) {
      return res.status(400).json({ success: false, message: "quotationPdf is required" });
    }

    lead.quotation.quotationPdfPath = normPath(req.file.path);
    lead.quotation.quotationPdfUploadedAt = new Date();
    lead.markModified("quotation");
    await lead.save();
    await lead.populate("createdBy", "name");

    ok(res, lead, "Quotation PDF uploaded");
  } catch (e) { err(res, e, "UPLOAD QUOTATION PDF"); }
};

// ── STEP 4: FOLLOWUP ──────────────────────────────────────────────────────────
exports.updateFollowup = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const {
      followupDate,
      notes,
      outcome,
      response,
      customerType,
      interestLevel,
      followupType,
    } = req.body;

    const validOutcomes = ["thinking", "negotiation", "revisionNeeded", "rejected"];
    const validCustomerTypes = ["hot", "medium", "cold"];
    const validInterestLevels = ["hot", "warm", "cold"];
    const validFollowupTypes = ["call", "visit", "whatsapp", "meeting", "paymentReminder"];

    const resolvedResponse = response ?? outcome;
    const resolvedInterestLevel =
      interestLevel !== undefined
        ? interestLevel
        : customerType === "medium"
        ? "warm"
        : customerType;

    if (resolvedResponse && !validOutcomes.includes(resolvedResponse)) {
      return res.status(400).json({ success: false, message: "Invalid outcome value" });
    }
    if (customerType && !validCustomerTypes.includes(customerType)) {
      return res.status(400).json({ success: false, message: "Invalid customerType value" });
    }
    if (resolvedInterestLevel && !validInterestLevels.includes(resolvedInterestLevel)) {
      return res.status(400).json({ success: false, message: "Invalid interestLevel value" });
    }
    if (followupType && !validFollowupTypes.includes(followupType)) {
      return res.status(400).json({ success: false, message: "Invalid followupType value" });
    }

    if (followupDate !== undefined) lead.followup.followupDate = followupDate ? new Date(followupDate) : null;
    if (notes !== undefined) lead.followup.notes = notes || null;
    if (resolvedResponse !== undefined) {
      lead.followup.outcome = resolvedResponse || null;
      lead.followup.response = resolvedResponse || null;
    }
    if (customerType !== undefined) lead.followup.customerType = customerType || null;

    if (resolvedInterestLevel !== undefined) lead.interestLevel = resolvedInterestLevel || null;
    if (followupType !== undefined) lead.followupType = followupType || null;

    if (notes !== undefined) {
      lead.lastRemark = notes || null;
    }

    lead.followup.createdAt = new Date();
    if (followupDate !== undefined) {
      lead.nextFollowupDate = followupDate ? new Date(followupDate) : null;
      lead.lastFollowupDate = new Date();
    }
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

    ensurePaymentState(lead);
    if (finalAmount !== undefined) {
      lead.payment.totalAmount = toMoney(finalAmount);
    }

    if (
      finalAmount !== undefined ||
      advancePayment !== undefined ||
      paymentMode !== undefined
    ) {
      const resolvedAdvance =
        advancePayment !== undefined
          ? toMoney(advancePayment)
          : toMoney(lead.deal.advancePayment);
      const resolvedMode = paymentMode !== undefined
        ? paymentMode
        : lead.deal.paymentMode;

      upsertAdvancePaymentEntry(lead, {
        amount: resolvedAdvance,
        mode: resolvedMode,
        recordedBy: req.user?._id,
        date: lead.deal?.closedAt || new Date(),
      });
      recalcPaymentTotals(lead);
      lead.markModified("payment");
    }

    const dealFullyPaid =
      toMoney(lead.payment?.remainingBalance) <= 0 && toMoney(lead.payment?.totalAmount) > 0;
    lead.status = dealFullyPaid ? "Project Completed" : "Deal Closed";
    lead.isCompleted = dealFullyPaid;
    lead.markModified("deal");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Deal saved");
  } catch (e) { err(res, e, "UPDATE DEAL"); }
};

// ── STEP 6: INSTALLATION ASSIGNED ────────────────────────────────────────────
exports.updateInstallationAssign = async (req, res) => {
  try {
    // Accept arrays (multi-member) or legacy single values
    let memberIds   = req.body.installationTeamMemberIds;
    let memberNames = req.body.installationTeamNames;

    // Normalise to arrays
    if (!Array.isArray(memberIds)) {
      memberIds = req.body.installationTeamMemberId
        ? [req.body.installationTeamMemberId]
        : [];
    }
    if (!Array.isArray(memberNames)) {
      memberNames = req.body.installationTeamName
        ? [req.body.installationTeamName]
        : [];
    }

    const { scheduledDate, notes } = req.body;

    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const update = {
      "installationAssign.assignedAt": new Date(),
      "installationAssign.installationTeamMemberIds": memberIds,
      "installationAssign.installationTeamNames": memberNames,
      // keep legacy single fields pointing to first member
      "installationAssign.installationTeamMemberId": memberIds[0] || null,
      "installationAssign.installationTeamName": memberNames[0] || null,
      status: "Installation Assigned",
    };

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

    // Notify all assigned team members
    for (const memberId of memberIds) {
      if (memberId) {
        notifyUser(memberId, {
          title: "New Installation Assigned",
          body: `Solar lead "${updated.customerName}" has been assigned to you`,
          data: { type: "solar_installation", leadId: updated._id.toString() },
        });
      }
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
    const {
      teamAssigned, systemTested, customerSigned, notes,
      structureDone, wiringDone, plumeDone, inverterAcDone, fullyComplete,
      completedDate,
      structureVendorName, structureVendorCo,
      wiringVendorName, wiringVendorCo,
    } = req.body;
    const afterPhotos = req.files?.afterPhotos?.map(f => normPath(f.path)) || [];
    if (teamAssigned !== undefined) lead.installation.teamAssigned = teamAssigned || null;
    if (systemTested !== undefined) lead.installation.systemTested = systemTested === "true" || systemTested === true;
    if (customerSigned !== undefined) lead.installation.customerSigned = customerSigned === "true" || customerSigned === true;
    if (notes !== undefined) lead.installation.notes = notes || null;
    if (afterPhotos.length > 0) lead.installation.installationPhotos = afterPhotos;
    // New checklist fields
    if (structureDone !== undefined) lead.installation.structureDone = structureDone === "true" || structureDone === true;
    if (wiringDone !== undefined) lead.installation.wiringDone = wiringDone === "true" || wiringDone === true;
    if (plumeDone !== undefined) lead.installation.plumeDone = plumeDone === "true" || plumeDone === true;
    if (inverterAcDone !== undefined) lead.installation.inverterAcDone = inverterAcDone === "true" || inverterAcDone === true;
    if (fullyComplete !== undefined) lead.installation.fullyComplete = fullyComplete === "true" || fullyComplete === true;
    if (completedDate !== undefined) lead.installation.completedDate = completedDate ? new Date(completedDate) : null;
    if (structureVendorName !== undefined) lead.installation.structureVendorName = structureVendorName || null;
    if (structureVendorCo !== undefined) lead.installation.structureVendorCo = structureVendorCo || null;
    if (wiringVendorName !== undefined) lead.installation.wiringVendorName = wiringVendorName || null;
    if (wiringVendorCo !== undefined) lead.installation.wiringVendorCo = wiringVendorCo || null;
    lead.installation.completedAt = new Date();
    lead.installation.installationDate = completedDate ? new Date(completedDate) : new Date();
    lead.status = "Installation Completed";
    lead.markModified("installation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Installation completed");
  } catch (e) { err(res, e, "UPDATE INSTALLATION"); }
};

// ── STEP 9: AGREEMENT UPLOAD ────────────────────────────────────────────────
exports.updateAgreementUpload = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      agreementUploaded,
      installationDetailsProvided,
      status,
    } = req.body;

    if (!lead.agreementUpload) lead.agreementUpload = {};

    if (agreementUploaded !== undefined) {
      lead.agreementUpload.agreementUploaded =
        agreementUploaded === 'true' || agreementUploaded === true;
    }
    if (installationDetailsProvided !== undefined) {
      lead.agreementUpload.installationDetailsProvided =
        installationDetailsProvided === 'true' || installationDetailsProvided === true;
    }
    if (status !== undefined) {
      const normalized = normalizeAgreementStatus(status);
      if (!normalized) {
        return res.status(400).json({ success: false, message: 'Invalid agreement upload status' });
      }
      lead.agreementUpload.status = normalized;
    }

    lead.agreementUpload.updatedAt = new Date();
    lead.status = 'Agreement Upload';
    lead.markModified('agreementUpload');
    await lead.save();
    await lead.populate('createdBy', 'name');
    ok(res, lead, 'Agreement upload saved');
  } catch (e) { err(res, e, 'UPDATE AGREEMENT UPLOAD'); }
};

// ── STEP 10: METER PROCESS ────────────────────────────────────────────────────
exports.updateMeter = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const {
      applicationDate,
      inspectionDate,
      installedDate,
      gebFileHandover,
      meterInstallationStatus,
      systemRunStatus,
      notes,
    } = req.body;
    const validMeterStatus = ['done', 'pending'];
    if (applicationDate !== undefined) lead.meter.applicationDate = applicationDate ? new Date(applicationDate) : null;
    if (inspectionDate !== undefined) lead.meter.inspectionDate = inspectionDate ? new Date(inspectionDate) : null;
    if (installedDate !== undefined) lead.meter.installedDate = installedDate ? new Date(installedDate) : null;
    if (gebFileHandover !== undefined) {
      lead.meter.gebFileHandover =
        gebFileHandover === true || gebFileHandover === 'true'
          ? true
          : gebFileHandover === false || gebFileHandover === 'false'
              ? false
              : null;
    }
    if (meterInstallationStatus !== undefined) {
      if (meterInstallationStatus && !validMeterStatus.includes(meterInstallationStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid meter installation status' });
      }
      lead.meter.meterInstallationStatus = meterInstallationStatus || null;
    }
    if (systemRunStatus !== undefined) {
      if (systemRunStatus && !validMeterStatus.includes(systemRunStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid system run status' });
      }
      lead.meter.systemRunStatus = systemRunStatus || null;
    }
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
    const { subsidyClaim, receivedAmount, notes } = req.body;
    if (subsidyClaim !== undefined) lead.subsidy.subsidyClaim = subsidyClaim === true || subsidyClaim === 'true' ? true : subsidyClaim === false || subsidyClaim === 'false' ? false : null;
    if (receivedAmount !== undefined) lead.subsidy.receivedAmount = receivedAmount === true || receivedAmount === 'true' ? true : receivedAmount === false || receivedAmount === 'false' ? false : null;
    if (notes !== undefined) lead.subsidy.notes = notes || null;
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

    ensurePaymentState(lead);

    // Sync advance from deal into paymentHistory first (idempotent — removes old
    // advance entry and re-adds at top). This handles leads where advancePayment
    // was stored only in deal/amountReceived without a paymentHistory entry.
    const advanceAmt = toMoney(lead.deal?.advancePayment);
    if (advanceAmt > 0) {
      upsertAdvancePaymentEntry(lead, {
        amount: advanceAmt,
        mode: lead.deal?.paymentMode || "cash",
        recordedBy: null,
        date: lead.deal?.closedAt || new Date(),
      });
    }

    lead.payment.paymentHistory.push({
      amount: Number(amount), mode,
      type: type || "partial",
      notes: notes || null,
      date: new Date(),
      recordedBy: req.user?._id || null,
    });

    recalcPaymentTotals(lead);
    if (lead.payment.remainingBalance <= 0) {
      lead.payment.completedAt = new Date();
      lead.status = "Project Completed";
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

    const { visitDate, salesAssignedId, notes } = req.body;

    if (visitDate !== undefined) {
      lead.visitScheduled.visitDate = visitDate ? new Date(visitDate) : null;
    }

    if ("salesAssignedId" in req.body) {
      const sp = await resolveSalesPerson(salesAssignedId);
      lead.visitScheduled.salesAssignedId = sp.id;
      lead.visitScheduled.salesAssigned = sp.name;
    }

    if ("notes" in req.body) {
      lead.visitScheduled.notes = notes || null;
    }

    lead.markModified("visitScheduled");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Visit schedule updated");
  } catch (e) { err(res, e, "EDIT VISIT SCHEDULE"); }
};

exports.editTechnicalVisit = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const {
      systemKW,
      meterPhase,
      inverterBoardType,
      panelBoardType,
      panelCapacity,
      cableType,
      acDBType,
      structureHeight,
      beamLineDetails,
      totalArray,
      scaffoldingDetails,
      panelLayout,
      lugType,
      dbConfigSingle,
      dbConfigThree,
      estimatedCost,
      additionalNotes,
    } = req.body;

    const photos = req.files ? req.files.map((f) => normPath(f.path)) : [];

    if (systemKW !== undefined) lead.technicalVisit.systemKW = systemKW || null;
    if (meterPhase !== undefined) lead.technicalVisit.meterPhase = meterPhase || null;
    if (inverterBoardType !== undefined) lead.technicalVisit.inverterBoardType = inverterBoardType || null;
    if (panelBoardType !== undefined) lead.technicalVisit.panelBoardType = panelBoardType || null;
    if (panelCapacity !== undefined) lead.technicalVisit.panelCapacity = panelCapacity || null;
    if (cableType !== undefined) lead.technicalVisit.cableType = cableType || null;
    if (acDBType !== undefined) lead.technicalVisit.acDBType = acDBType || null;
    if (structureHeight !== undefined) lead.technicalVisit.structureHeight = structureHeight || null;
    if (beamLineDetails !== undefined) lead.technicalVisit.beamLineDetails = beamLineDetails || null;
    if (totalArray !== undefined) lead.technicalVisit.totalArray = totalArray || null;
    if (scaffoldingDetails !== undefined) lead.technicalVisit.scaffoldingDetails = scaffoldingDetails || null;
    if (panelLayout !== undefined) lead.technicalVisit.panelLayout = panelLayout || null;
    if (lugType !== undefined) lead.technicalVisit.lugType = lugType || null;
    if (dbConfigSingle !== undefined) lead.technicalVisit.dbConfigSingle = dbConfigSingle || null;
    if (dbConfigThree !== undefined) lead.technicalVisit.dbConfigThree = dbConfigThree || null;
    if (estimatedCost !== undefined) lead.technicalVisit.estimatedCost = estimatedCost || null;
    if (additionalNotes !== undefined) lead.technicalVisit.additionalNotes = additionalNotes || null;
    if (photos.length > 0) lead.technicalVisit.technicalPhotos = photos;

    lead.markModified("technicalVisit");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Technical visit updated");
  } catch (e) { err(res, e, "EDIT TECHNICAL VISIT"); }
};

exports.editQuotation = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const {
      systemSize, panelType, inverterType, structureType, wiringDetails,
      rooftopSystemCost, elevatedStructureCost, netMeterCost, premiumOtherCost,
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

    if (rooftopSystemCost !== undefined) {
      lead.quotation.rooftopSystemCost = Number(rooftopSystemCost) || 0;
    }
    if (elevatedStructureCost !== undefined) {
      lead.quotation.elevatedStructureCost = Number(elevatedStructureCost) || 0;
    }
    if (netMeterCost !== undefined) {
      lead.quotation.netMeterCost = Number(netMeterCost) || 0;
    }
    if (premiumOtherCost !== undefined) {
      lead.quotation.premiumOtherCost = Number(premiumOtherCost) || 0;
    }
    if (subsidyAmount !== undefined) {
      lead.quotation.subsidyAmount = Number(subsidyAmount) || 0;
    }

    if (
      rooftopSystemCost !== undefined ||
      elevatedStructureCost !== undefined ||
      netMeterCost !== undefined ||
      premiumOtherCost !== undefined ||
      subsidyAmount !== undefined
    ) {
      recalcQuotationTotals(lead.quotation);
    } else if (totalAmount !== undefined || subsidyAmount !== undefined) {
      const total = Number(totalAmount ?? lead.quotation.totalAmount) || 0;
      const subsidy = Number(subsidyAmount ?? lead.quotation.subsidyAmount) || 0;
      lead.quotation.totalAmount = total;
      lead.quotation.subsidyAmount = subsidy;
      lead.quotation.customerPayable = total - subsidy;
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

    const {
      followupDate,
      outcome,
      response,
      customerType,
      notes,
      interestLevel,
      followupType,
    } = req.body;

    const validOutcomes = ["thinking", "negotiation", "revisionNeeded", "rejected"];
    const validCustomerTypes = ["hot", "medium", "cold"];
    const validInterestLevels = ["hot", "warm", "cold"];
    const validFollowupTypes = ["call", "visit", "whatsapp", "meeting", "paymentReminder"];

    const resolvedResponse = response ?? outcome;
    const resolvedInterestLevel =
      interestLevel !== undefined
        ? interestLevel
        : customerType === "medium"
        ? "warm"
        : customerType;

    if (resolvedResponse && !validOutcomes.includes(resolvedResponse)) {
      return res.status(400).json({ success: false, message: "Invalid outcome value" });
    }
    if (customerType && !validCustomerTypes.includes(customerType)) {
      return res.status(400).json({ success: false, message: "Invalid customerType value" });
    }
    if (resolvedInterestLevel && !validInterestLevels.includes(resolvedInterestLevel)) {
      return res.status(400).json({ success: false, message: "Invalid interestLevel value" });
    }
    if (followupType && !validFollowupTypes.includes(followupType)) {
      return res.status(400).json({ success: false, message: "Invalid followupType value" });
    }

    if (followupDate !== undefined) lead.followup.followupDate = followupDate ? new Date(followupDate) : null;
    if (resolvedResponse !== undefined) {
      lead.followup.outcome = resolvedResponse || null;
      lead.followup.response = resolvedResponse || null;
    }
    if (customerType !== undefined) lead.followup.customerType = customerType || null;
    if (notes !== undefined) lead.followup.notes = notes || null;

    if (resolvedInterestLevel !== undefined) lead.interestLevel = resolvedInterestLevel || null;
    if (followupType !== undefined) lead.followupType = followupType || null;

    if (notes !== undefined) {
      lead.lastRemark = notes || null;
    }

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

    ensurePaymentState(lead);
    if (finalAmount !== undefined) {
      lead.payment.totalAmount = toMoney(finalAmount);
    }

    if (
      finalAmount !== undefined ||
      advancePayment !== undefined ||
      paymentMode !== undefined
    ) {
      const resolvedAdvance =
        advancePayment !== undefined
          ? toMoney(advancePayment)
          : toMoney(lead.deal.advancePayment);
      const resolvedMode = paymentMode !== undefined
        ? paymentMode
        : lead.deal.paymentMode;

      upsertAdvancePaymentEntry(lead, {
        amount: resolvedAdvance,
        mode: resolvedMode,
        recordedBy: req.user?._id,
        date: lead.deal?.closedAt || new Date(),
      });
      recalcPaymentTotals(lead);
      lead.markModified("payment");
    }

    lead.isCompleted = lead.payment.remainingBalance <= 0 && lead.payment.totalAmount > 0;
    if (lead.isCompleted) {
      lead.status = "Project Completed";
    } else {
      lead.status = "Deal Closed";
    }
    lead.markModified("deal");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Deal updated");
  } catch (e) { err(res, e, "EDIT DEAL"); }
};

exports.editInstallationAssign = async (req, res) => {
  try {
    // Accept arrays (multi-member) or legacy single values
    let memberIds   = req.body.installationTeamMemberIds;
    let memberNames = req.body.installationTeamNames;

    if (!Array.isArray(memberIds)) {
      memberIds = req.body.installationTeamMemberId
        ? [req.body.installationTeamMemberId]
        : undefined;
    }
    if (!Array.isArray(memberNames)) {
      memberNames = req.body.installationTeamName
        ? [req.body.installationTeamName]
        : undefined;
    }

    const { scheduledDate, notes } = req.body;

    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const update = {};
    if (memberIds !== undefined) {
      update["installationAssign.installationTeamMemberIds"] = memberIds;
      update["installationAssign.installationTeamMemberId"] = memberIds[0] || null;
    }
    if (memberNames !== undefined) {
      update["installationAssign.installationTeamNames"] = memberNames;
      update["installationAssign.installationTeamName"] = memberNames[0] || null;
    }
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
    const {
      teamAssigned, systemTested, customerSigned, notes,
      structureDone, wiringDone, plumeDone, inverterAcDone, fullyComplete,
      completedDate,
      structureVendorName, structureVendorCo,
      wiringVendorName, wiringVendorCo,
    } = req.body;
    const beforePhotos = req.files?.beforePhotos?.map(f => normPath(f.path)) || [];
    const afterPhotos = req.files?.afterPhotos?.map(f => normPath(f.path)) || [];
    if (teamAssigned !== undefined) lead.installation.teamAssigned = teamAssigned || null;
    if (systemTested !== undefined) lead.installation.systemTested = systemTested === "true" || systemTested === true;
    if (customerSigned !== undefined) lead.installation.customerSigned = customerSigned === "true" || customerSigned === true;
    if (notes !== undefined) lead.installation.notes = notes || null;
    if (beforePhotos.length > 0) lead.installation.beforePhotos = beforePhotos;
    if (afterPhotos.length > 0) lead.installation.installationPhotos = afterPhotos;
    // New checklist fields
    if (structureDone !== undefined) lead.installation.structureDone = structureDone === "true" || structureDone === true;
    if (wiringDone !== undefined) lead.installation.wiringDone = wiringDone === "true" || wiringDone === true;
    if (plumeDone !== undefined) lead.installation.plumeDone = plumeDone === "true" || plumeDone === true;
    if (inverterAcDone !== undefined) lead.installation.inverterAcDone = inverterAcDone === "true" || inverterAcDone === true;
    if (fullyComplete !== undefined) lead.installation.fullyComplete = fullyComplete === "true" || fullyComplete === true;
    if (completedDate !== undefined) lead.installation.completedDate = completedDate ? new Date(completedDate) : null;
    if (structureVendorName !== undefined) lead.installation.structureVendorName = structureVendorName || null;
    if (structureVendorCo !== undefined) lead.installation.structureVendorCo = structureVendorCo || null;
    if (wiringVendorName !== undefined) lead.installation.wiringVendorName = wiringVendorName || null;
    if (wiringVendorCo !== undefined) lead.installation.wiringVendorCo = wiringVendorCo || null;
    lead.markModified("installation");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Installation updated");
  } catch (e) { err(res, e, "EDIT INSTALLATION"); }
};

exports.editAgreementUpload = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (!checkOwnership(lead, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      agreementUploaded,
      installationDetailsProvided,
      status,
    } = req.body;

    if (!lead.agreementUpload) lead.agreementUpload = {};

    if (agreementUploaded !== undefined) {
      lead.agreementUpload.agreementUploaded =
        agreementUploaded === 'true' || agreementUploaded === true;
    }
    if (installationDetailsProvided !== undefined) {
      lead.agreementUpload.installationDetailsProvided =
        installationDetailsProvided === 'true' || installationDetailsProvided === true;
    }
    if (status !== undefined) {
      const normalized = normalizeAgreementStatus(status);
      if (!normalized) {
        return res.status(400).json({ success: false, message: 'Invalid agreement upload status' });
      }
      lead.agreementUpload.status = normalized;
    }

    lead.agreementUpload.updatedAt = new Date();
    lead.markModified('agreementUpload');
    await lead.save();
    await lead.populate('createdBy', 'name');
    ok(res, lead, 'Agreement upload updated');
  } catch (e) { err(res, e, 'EDIT AGREEMENT UPLOAD'); }
};

exports.editMeter = async (req, res) => {
  try {
    const lead = await SolarLead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const {
      applicationDate,
      inspectionDate,
      installedDate,
      gebFileHandover,
      meterInstallationStatus,
      systemRunStatus,
      notes,
    } = req.body;
    const validMeterStatus = ['done', 'pending'];
    if (applicationDate !== undefined) lead.meter.applicationDate = applicationDate ? new Date(applicationDate) : null;
    if (inspectionDate !== undefined) lead.meter.inspectionDate = inspectionDate ? new Date(inspectionDate) : null;
    if (installedDate !== undefined) lead.meter.installedDate = installedDate ? new Date(installedDate) : null;
    if (gebFileHandover !== undefined) {
      lead.meter.gebFileHandover =
        gebFileHandover === true || gebFileHandover === 'true'
          ? true
          : gebFileHandover === false || gebFileHandover === 'false'
              ? false
              : null;
    }
    if (meterInstallationStatus !== undefined) {
      if (meterInstallationStatus && !validMeterStatus.includes(meterInstallationStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid meter installation status' });
      }
      lead.meter.meterInstallationStatus = meterInstallationStatus || null;
    }
    if (systemRunStatus !== undefined) {
      if (systemRunStatus && !validMeterStatus.includes(systemRunStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid system run status' });
      }
      lead.meter.systemRunStatus = systemRunStatus || null;
    }
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
    const { subsidyClaim, receivedAmount, notes } = req.body;
    if (subsidyClaim !== undefined) lead.subsidy.subsidyClaim = subsidyClaim === true || subsidyClaim === 'true' ? true : subsidyClaim === false || subsidyClaim === 'false' ? false : null;
    if (receivedAmount !== undefined) lead.subsidy.receivedAmount = receivedAmount === true || receivedAmount === 'true' ? true : receivedAmount === false || receivedAmount === 'false' ? false : null;
    if (notes !== undefined) lead.subsidy.notes = notes || null;
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

    ensurePaymentState(lead);
    lead.payment.paymentHistory.push({
      amount: Number(amount), mode,
      type: type || "partial",
      notes: notes || null,
      date: new Date(),
      recordedBy: req.user?._id || null,
    });

    recalcPaymentTotals(lead);
    if (lead.payment.remainingBalance <= 0) {
      lead.payment.completedAt = new Date();
      lead.status = "Project Completed";
      lead.isCompleted = true;
    }
    lead.markModified("payment");
    await lead.save();
    await lead.populate("createdBy", "name");
    ok(res, lead, "Payment recorded");
  } catch (e) { err(res, e, "EDIT PAYMENT"); }
};