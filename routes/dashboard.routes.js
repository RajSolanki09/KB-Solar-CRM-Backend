const express         = require("express");
const dashboardRouter = express.Router();

const auth           = require("../middlewares/auth.middleware");
const authorizeRoles = require("../middlewares/role.middleware");

const {
  getOwnerDashboard,
  getSalesDashboard,
  getServiceDashboard,
} = require("../controllers/dashboard.controller");

/**
 * GET /api/dashboard/owner
 * Owner only — full stats, revenue, charts
 */
dashboardRouter.get(
  "/owner",
  auth,
  authorizeRoles("admin"),
  getOwnerDashboard
);

/**
 * GET /api/dashboard/sales
 * Sales only — my leads, followups, targets
 */
dashboardRouter.get(
  "/sales",
  auth,
  authorizeRoles("admin", "sales"),
  getSalesDashboard
);

/**
 * GET /api/dashboard/service
 * Service team — today's jobs, pending, revenue
 */
dashboardRouter.get(
  "/service",
  auth,
  authorizeRoles("admin", "service"),
  getServiceDashboard
);

module.exports = dashboardRouter;