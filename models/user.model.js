  const mongoose = require("mongoose");

  const userSchema = new mongoose.Schema(
    {
      name: { type: String, required: false, trim: true },
      phone: { type: String, required: false, trim: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      password: { type: String, required: true, select: false },
      role: {
        type: String,
        enum: ["admin", "sales", "service", "installation"],
        default: "admin",
      },
      image: { type: String, default: null },
      status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
      fcmToken: { type: String, default: null },
    },
    { timestamps: true }
  );

  module.exports = mongoose.model("User", userSchema);