const mongoose = require("mongoose");
const { Schema } = mongoose;

const materialSchema = new Schema(
  {
    materialName: { type: String, required: true, trim: true },
    brand: { type: String, default: "", trim: true },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: String, default: "" },
    note: { type: String, default: "" },
    customFields: { type: Schema.Types.Mixed, default: {} },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

materialSchema.index({ materialName: 1 });
materialSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Material", materialSchema);
