// Backend/models/sprinklerlead.model.js
// Steps:
//   1. newLead
//   2. siteVisit
//   3. visitData          ← NEW (replaces technicalVisit)
//   4. quotation
//   5. followup
//   6. dealDone
//   7. installationAssigned
//   8. installationStarted
//   9. installationCompleted
//  10. systemTested
//  11. fullPayment
//  12. projectCompleted

const mongoose = require("mongoose");
const { Schema } = mongoose;

// ── FOLLOWUP HISTORY ENTRY ────────────────────────────────────────────────────
const followupHistorySchema = new Schema(
  {
    remark:           { type: String, required: true },
    interestLevel:    { type: String, enum: ["hot", "warm", "cold", null], default: null },
    followupType:     {
      type: String,
      enum: ["call", "visit", "whatsapp", "meeting", "paymentReminder"],
      required: true,
    },
    nextFollowupDate: { type: Date, required: true },
    callDuration:     { type: Number, default: null },
    attachment:       { type: String, default: null },
    updatedBy:        { type: Schema.Types.ObjectId, ref: "User" },
    createdAt:        { type: Date, default: Date.now },
  },
  { _id: true }
);

const sprinklerLeadSchema = new Schema(
  {
    // ── CUSTOMER INFO ──────────────────────────────────────────────────────
    customerName: { type: String, required: true, trim: true },
    phone:        { type: String, required: true, trim: true },
    address:      { type: String, required: true },
    village:      { type: String, default: "" },
    farmSize:     { type: Number, default: null },
    waterSource: {
      type: String,
      enum: ["borewell", "canal", "tank", "river", "other", null],
      default: null,
    },
    cropType: { type: String, default: "" },
    source: {
      type: String,
      enum: [
        "call",
        "reference",
        "social_media",
        "epc_reference",
        "indiamart",
        "marketing", // legacy
        "walk-in", // legacy
        "other",
        null,
      ],
      default: null,
    },
    note:          { type: String, default: "" },
    noteUpdatedAt: { type: Date },
    referenceName: { type: String, default: null, trim: true },

    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdBy:  { type: Schema.Types.ObjectId, ref: "User", required: true },

    // ── WORKFLOW STATUS ────────────────────────────────────────────────────
    currentStep: {
      type: String,
      enum: [
        "newLead",               // Step 1
        "siteVisit",             // Step 2
        "visitData",             // Step 3  ← NEW (field data from site visit)
        "quotation",             // Step 4
        "followup",              // Step 5
        "dealDone",              // Step 6
        "installationAssigned",  // Step 7
        "installationStarted",   // Step 8
        "installationCompleted", // Step 9
        "systemTested",          // Step 10
        "fullPayment",           // Step 11
        "projectCompleted",      // Step 12
        "technicalVisit",        // Legacy — old documents only, maps to visitData
      ],
      default: "newLead",
    },
    isCompleted: { type: Boolean, default: false },
    isDeleted:   { type: Boolean, default: false },

    statusHistory: [
      {
        step:      { type: String },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedAt: { type: Date, default: Date.now },
        note:      { type: String, default: "" },
      },
    ],

    // ── FOLLOWUP SYSTEM ────────────────────────────────────────────────────
    followupHistory:     { type: [followupHistorySchema], default: [] },
    interestLevel:       { type: String, enum: ["hot", "warm", "cold", null], default: null },
    followupType: {
      type: String,
      enum: ["call", "visit", "whatsapp", "meeting", "paymentReminder", null],
      default: null,
    },
    nextFollowupDate:    { type: Date,   default: null },
    lastFollowupDate:    { type: Date,   default: null },
    lastRemark:          { type: String, default: null },
    followupCount:       { type: Number, default: 0 },
    missedFollowupCount: { type: Number, default: 0 },

    // ── STEP 2: SITE VISIT ─────────────────────────────────────────────────
    siteVisit: {
      visitDate:              { type: Date,   default: null },
      visitTime:              { type: String, default: null },
      salesPerson:            { type: String, default: null },
      fieldConditionNotes:    { type: String, default: null },
      waterAvailabilityNotes: { type: String, default: null },
      notes:                  { type: String, default: null },
      sitePhotos:             [{ type: String }],
      visitedAt:              { type: Date,   default: null },
    },

    // ── STEP 3: VISIT DATA ─────────────────────────────────────────────────
    // Detailed field measurements collected during the site visit.
    // Replaces the old "technicalVisit" step for new leads.
    visitData: {
      noOfPanels:         { type: Number, default: null }, // number of solar panels
      pumpCapacity:       { type: String, default: null }, // e.g. "5 HP", "2.2 kW"
      typeOfPump:         { type: String, default: null }, // Submersible / Surface / Solar / etc.
      deliveryPipeLength: { type: Number, default: null }, // metres
      noOfSprinklers:     { type: Number, default: null }, // count
      cableLength:        { type: Number, default: null }, // metres
      typeOfSite:         { type: String, default: null }, // Agricultural / Residential / etc.
      notes:              { type: String, default: null },
      visitPhotoPaths:    [{ type: String }],
      savedAt:            { type: Date,   default: null },
    },

    // ── STEP 3 (LEGACY): TECHNICAL VISIT ──────────────────────────────────
    // Retained so existing documents are not broken.
    // New leads use visitData above instead.
    technicalVisit: {
      finalPipeLength:     { type: Number, default: null },
      finalSprinklerCount: { type: Number, default: null },
      motorHP:             { type: String, default: null },
      pressureCheckNotes:  { type: String, default: null },
      layoutNotes:         { type: String, default: null },
      notes:               { type: String, default: null },
      techPhotos:          [{ type: String }],
      approvedAt:          { type: Date,   default: null },
    },

    // ── STEP 4: QUOTATION ──────────────────────────────────────────────────
    quotation: {
      lineItems: [{
        description: { type: String, default: "" },
        quantity: { type: String, default: "" },
        unitPrice: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
      }],
      // System specification
      noOfPanels:       { type: Number, default: null },
      noOfKW:           { type: Number, default: null },
      noOfSprinklerSet: { type: Number, default: null },
      typeOfSprinkler:  { type: String, default: null },
      // Equipment details
      pumpDetails:      { type: String, default: null },
      sprinkleType:     { type: String, default: null },
      upvcPipeSizes:    { type: String, default: null },
      cableDetails:     { type: String, default: null },
      upvcFittings:     { type: String, default: null },
      controlPanel:     { type: String, default: null },
      // Legacy / additional
      pipeLength:       { type: Number, default: null },
      sprinklerQty:     { type: Number, default: null },
      fittings:         { type: String, default: null },
      labourCost:       { type: Number, default: 0 },
      transportCost:    { type: Number, default: 0 },
      // Cost breakdown
      totalAmount:      { type: Number, default: 0 },
      discount:         { type: Number, default: 0 },
      finalAmount:      { type: Number, default: 0 },
      // Payment terms
      advancePercent:   { type: Number, default: 60 },
      balancePercent:   { type: Number, default: 40 },
      warrantyNote:     { type: String, default: null },
      notes:            { type: String, default: null },
      sentAt:           { type: Date,   default: null },
      // PDF
      quotationPdfPath:       { type: String, default: null },
      quotationPdfUploadedAt: { type: Date,   default: null },
    },

    // ── STEP 5: FOLLOWUP ───────────────────────────────────────────────────
    followup: {
      followupDate:  { type: Date,   default: null },
      response: {
        type: String,
        // Updated values: thinking / negotiation / revisionNeeded / rejected
        // Legacy values kept for backward compat: interested / notInterested
        enum: [
          "thinking", "negotiation", "revisionNeeded", "rejected",
          "interested", "notInterested", null
        ],
        default: null,
      },
      customerType: {
        type: String,
        // Interest level: cold / medium / hot
        enum: ["cold", "medium", "hot", null],
        default: null,
      },
      remarks:       { type: String, default: null },
      notes:         { type: String, default: null },
      createdAt:     { type: Date,   default: null },
    },

    // ── STEP 6: DEAL DONE ──────────────────────────────────────────────────
    deal: {
      finalDealAmount: { type: Number, default: null },
      discountGiven:   { type: Number, default: 0 },
      advancePayment:  { type: Number, default: null },
      paymentMode: {
        type: String,
        enum: ["cash", "bankTransfer", "cheque", "upi", "loan", null],
        default: null,
      },
      expectedInstallDate: { type: Date,   default: null },
      notes:               { type: String, default: null },
      closedAt:            { type: Date,   default: null },
    },

    // ── STEP 7: INSTALLATION TEAM ASSIGNMENT ──────────────────────────────
    // Set by admin after deal is closed.
    installationAssign: {
      // Multi-member canonical fields
      installationTeamMemberIds: [
        { type: Schema.Types.ObjectId, ref: "User", default: null },
      ],
      installationTeamNames: [{ type: String }],

      // Legacy single-member field kept for backward compatibility
      installationTeamMemberId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      scheduledDate: { type: Date,   default: null },
      notes:         { type: String, default: null },
      assignedAt:    { type: Date,   default: null },
      assignedBy:    { type: Schema.Types.ObjectId, ref: "User", default: null },
    },

    // ── STEPS 8–10: INSTALLATION WORK ─────────────────────────────────────
    // Updated progressively by the installation team.
    installation: {
      technicianName:   { type: String,  default: null },
      installationDate: { type: Date,    default: null },
      startedAt:        { type: Date,    default: null },   // step 8 — team on site
      completedAt:      { type: Date,    default: null },   // step 9 — work done
      systemTested:     { type: Boolean, default: false },  // step 10 — system verified
      testedAt:         { type: Date,    default: null },
      pendingWork:      { type: Boolean, default: false },
      pendingWorkNote:  { type: String,  default: null },
      paymentReceived:  { type: Boolean, default: null },
      followUpDate:     { type: Date,    default: null },
      completedBy:      { type: String,  default: null },
      customerReview:   { type: String,  default: null },
      materialUsed:     { type: String,  default: null },
      extraMaterial:    { type: String,  default: null },
      workNotes:        { type: String,  default: null },
      notes:            { type: String,  default: null },
      beforePhotos:     [{ type: String }],  // photos at step 8 (started)
      installPhotos:    [{ type: String }],  // photos at step 9 (completed)
    },

    // ── STEP 11: PAYMENT ───────────────────────────────────────────────────
    payment: {
      totalAmount:      { type: Number, default: 0 },
      amountReceived:   { type: Number, default: 0 },
      remainingBalance: { type: Number, default: 0 },
      paymentHistory: [
        {
          amount: { type: Number },
          mode: {
            type: String,
            enum: ["cash", "bankTransfer", "cheque", "upi", "loan"],
          },
          type: {
            type: String,
            enum: ["advance", "partial", "final"],
            default: "partial",
          },
          transactionId: { type: String, default: null },
          notes:         { type: String, default: null },
          date:          { type: Date,   default: Date.now },
          recordedBy:    { type: Schema.Types.ObjectId, ref: "User" },
        },
      ],
      completedAt: { type: Date, default: null },
    },

    // ── STEP 12: PROJECT COMPLETED / REVIEW ───────────────────────────────
    review: {
      reviewCode: { type: String, default: null },
      rating:     { type: Number, min: 1, max: 5, default: null },
      feedback:   { type: String, default: null },
      notes:      { type: String, default: null },
      reviewedAt: { type: Date,   default: null },
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
sprinklerLeadSchema.index({ currentStep: 1 });
sprinklerLeadSchema.index({ assignedTo: 1 });
sprinklerLeadSchema.index({ createdAt: -1 });
sprinklerLeadSchema.index({ isDeleted: 1 });
sprinklerLeadSchema.index({ nextFollowupDate: 1 });
sprinklerLeadSchema.index({ interestLevel: 1 });
sprinklerLeadSchema.index({ "installationAssign.installationTeamMemberId": 1 });

module.exports = mongoose.model("SprinklerLead", sprinklerLeadSchema);