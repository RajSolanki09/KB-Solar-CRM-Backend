const mongoose = require("mongoose");

const followupSchema = new mongoose.Schema(
  {
    leadType: {
      type: String,
      enum: ["Solar", "Sprinkler"],
      required: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Denormalized for fast listing (no extra populate needed)
    customerName:  { type: String, default: "" },
    customerPhone: { type: String, default: "" },

    followupDate: { type: Date, required: true },
    notes:        { type: String, default: null },

    customerResponse: {
      type: String,
      enum: ["Interested", "Not Interested", "Call Later", "No Response", "Deal Done", null],
      default: null,
    },

    nextFollowupDate: { type: Date, default: null },
    completedAt:      { type: Date, default: null },

    status: {
      type: String,
      enum: ["Pending", "Done", "Cancelled"],
      default: "Pending",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

followupSchema.index({ followupDate: 1 });
followupSchema.index({ status: 1 });
followupSchema.index({ createdBy: 1 });
followupSchema.index({ leadId: 1 });

module.exports = mongoose.model("Followup", followupSchema);