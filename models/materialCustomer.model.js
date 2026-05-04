const mongoose = require("mongoose");
const { Schema } = mongoose;

const materialCustomerSchema = new Schema(
  {
    customerName: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    customFields: { type: Schema.Types.Mixed, default: {} },
    pipeline: {
      currentStep: { type: Number, default: -1, min: -1, max: 4 },
      status: { type: String, default: 'New' },
      isCompleted: { type: Boolean, default: false },
      source: {
        materialId: { type: Schema.Types.ObjectId, ref: 'Material' },
        materialName: { type: String, default: '' },
        materialAmount: { type: Number, min: 0 },
        updatedAt: { type: Date },
      },
      followUp: {
        assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
        assignedToName: { type: String, default: '' },
        followUpAt: { type: Date },
        updatedAt: { type: Date },
      },
      dealDone: {
        finalAmount: { type: Number, min: 0 },
        updatedAt: { type: Date },
      },
      payment: {
        paymentComplete: { type: Boolean },
        updatedAt: { type: Date },
      },
      dispatch: {
        dispatchDate: { type: Date },
        updatedAt: { type: Date },
      },
      completedAt: { type: Date },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

materialCustomerSchema.index({ customerName: 1 });
materialCustomerSchema.index({ mobile: 1 });
materialCustomerSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MaterialCustomer", materialCustomerSchema);
