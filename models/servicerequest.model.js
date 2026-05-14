const mongoose = require("mongoose");
const { Schema } = mongoose;

const serviceRequestSchema = new Schema(
  {
    serviceId: { type: String, unique: true },

    // BASIC INFO
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    issueType: { type: String, default: "" },
    issueDescription: { type: String, default: "" },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Urgent"],
      default: "Medium",
    },

    linkedLeadId: { type: Schema.Types.ObjectId, default: null },
    linkedLeadType: {
      type: String,
      enum: ["Solar", "Sprinkler", null],
      default: null,
    },

    // CHARGE
    chargeType: {
      type: String,
      enum: ["Free", "Paid"],
      required: true,
    },
    chargeAmount: { type: Number, default: 0 },

    // ✅ FIXED ASSIGNMENT
    assignedTo: {
      type: Schema.Types.ObjectId,  // 👈 FIXED
      ref: "User",
      required: true,
    },

    assignment: {
      serviceDate: { type: Date },
      assignedAt: { type: Date },
    },

    // STATUS
    status: {
      type: String,
      enum: [
        "Open",
        "Assigned",
        "In Progress",
        "Payment Pending",
        "Completed",
        "Resolved",
        "Closed",
      ],
      default: "Open",
    },

    resolvedAt: { type: Date, default: null },

    // PHOTOS
    beforePhotos: [{ type: String }],
    afterPhotos: [{ type: String }],

    serviceNotes: { type: String, default: "" },

    // PAYMENT
    paymentStatus: {
      type: String,
      enum: ["Not Applicable", "Pending", "Partial", "Paid"],
      default: "Not Applicable",
    },
    paidAmount: { type: Number, default: 0 },
    paymentMode: {
      type: String,
      enum: ["Cash", "UPI", "Bank Transfer", "Cheque", null],
      default: null,
    },
    paymentDate: { type: Date, default: null },
    paymentHistory: [
      {
        amount: { type: Number, required: true, min: 0 },
        paymentMode: {
          type: String,
          enum: ["Cash", "UPI", "Bank Transfer", "Cheque"],
          required: true,
        },
        paidAt: { type: Date, default: Date.now },
        receivedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
      },
    ],
    // Completed flag for quick filtering
    
    isComplete: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

serviceRequestSchema.index({ status: 1 });
serviceRequestSchema.index({ assignedTo: 1 });
serviceRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);