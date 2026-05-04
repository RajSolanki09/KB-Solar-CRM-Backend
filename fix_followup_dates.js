// fix_followup_dates.js
// Run ONCE with: node fix_followup_dates.js
// Backfills nextFollowupDate for all leads where it's null
// but followup.followupDate has a value.

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/Solar-Plant";

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const result = await mongoose.connection.collection("solarleads").updateMany(
    {
      nextFollowupDate: null,
      "followup.followupDate": { $ne: null },
    },
    [
      {
        $set: {
          nextFollowupDate: "$followup.followupDate",
        },
      },
    ]
  );

  console.log(`✅ Fixed ${result.modifiedCount} solar leads`);
  await mongoose.disconnect();
}

run().catch(console.error);