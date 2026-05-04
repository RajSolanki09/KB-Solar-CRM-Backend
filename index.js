const path = require('path');
require("dotenv").config({ path: path.join(__dirname, '.env') });

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRouter = require("./routes/auth.routes");
const userRouter = require('./routes/user.routes');
const solarRouter = require("./routes/solar.routes");
const sprinklerRouter = require("./routes/sprinkler.routes");
const serviceRouter = require("./routes/service.routes");
const materialRouter = require("./routes/material.routes");
const followupRouter = require("./routes/followup.routes");
const dashboardRouter = require("./routes/dashboard.routes");
const reportRouter = require("./routes/report.routes");
const installationRouter = require("./routes/installation.routes");

const app = express();
const PORT = process.env.PORT || 8000;

/* =====================================================
   CORS CONFIGURATION
===================================================== */

const allowedOrigins = [
  "http://localhost:51811",
  "http://127.0.0.1:51811",
  "http://localhost:3000",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // allow all during development
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], // ← PATCH added
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* =====================================================
  MIDDLEWARES
===================================================== */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// DEV: log incoming requests
app.use((req, res, next) => {
  console.log(`REQ ${req.method} ${req.path} body:`, req.body);
  next();
});

/* =====================================================
  ROUTES
===================================================== */

app.use("/api/auth", authRouter);
app.use("/api/admin", userRouter);
app.use("/api/solar_lead", solarRouter);
app.use("/api/sprinkler_lead", sprinklerRouter);
app.use("/api/service", serviceRouter);
app.use("/api/material", materialRouter);
app.use("/api/followups", followupRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportRouter);
app.use("/api/installation", installationRouter);

/* =====================================================
  HEALTH CHECK
===================================================== */

app.get("/", (req, res) => {
  res.json({ message: "CRM API is running ✅" });
});

/* =====================================================
  ERROR HANDLING
===================================================== */

app.use((err, req, res, next) => {
  console.error("UNCAUGHT ERROR:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: "Server error" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

/* =====================================================
  START SERVER
===================================================== */

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();