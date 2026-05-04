// const mongoose = require("mongoose");

// // Standalone payment record — useful for payment reports across all modules
// const paymentSchema = new mongoose.Schema(
//   {
//     referenceType: {
//       type: String,
//       enum: ["Solar", "Sprinkler", "Service"],
//       required: true,
//     },
//     referenceId: {
//       type: mongoose.Schema.Types.ObjectId,
//       required: true,
//     },
//     amount: { type: Number, required: true },
//     paymentMode: {
//       type: String,
//       enum: ["Cash", "Online", "UPI", "Bank Transfer", "Cheque"],
//       required: true,
//     },
//     receivedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },
//     note: { type: String, default: "" },
//   },
//   { timestamps: true }
// );

// paymentSchema.index({ referenceType: 1, referenceId: 1 });
// paymentSchema.index({ createdAt: -1 });

// module.exports = mongoose.model("Payment", paymentSchema);