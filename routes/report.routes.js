const express      = require("express");
const reportRouter = express.Router();

const auth           = require("../middlewares/auth.middleware");
const authorizeRoles = require("../middlewares/role.middleware");

const {
  getSalesReport,
  getInstallationReport,
  getPaymentReport,
  getSubsidyReport,
  getServiceRevenueReport,
  getMonthlyReport,
} = require("../controllers/report.controller");

// All reports → Admin (Owner) only
reportRouter.use(auth);
reportRouter.use(authorizeRoles("admin"));

/**
 * GET /api/reports/sales
 * Query: ?from=2024-01-01&to=2024-12-31&salesPersonId=xxx
 */
reportRouter.get("/sales",        getSalesReport);

/**
 * GET /api/reports/installations
 * Query: ?from=&to=&type=solar|sprinkler
 */
reportRouter.get("/installations", getInstallationReport);

/**
 * GET /api/reports/payments
 * Query: ?from=&to=
 */
reportRouter.get("/payments",     getPaymentReport);

/**
 * GET /api/reports/subsidy
 * Query: ?from=&to=
 */
reportRouter.get("/subsidy",      getSubsidyReport);

/**
 * GET /api/reports/service-revenue
 * Query: ?from=&to=
 */
reportRouter.get("/service-revenue", getServiceRevenueReport);

/**
 * GET /api/reports/monthly
 * Query: ?year=2024
 */
reportRouter.get("/monthly",      getMonthlyReport);

module.exports = reportRouter;