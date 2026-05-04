const express = require("express");
const followupRouter = express.Router();

const auth = require("../middlewares/auth.middleware");
const authorizeRoles = require("../middlewares/role.middleware");

const {
  addFollowup,
  getAllFollowups,
  getLeadFollowups,
  getSingleFollowup,
  updateFollowup,
  deleteFollowup,
  getFollowupSummary,
} = require("../controllers/followup.controller");

/* =========================================================
   CREATE FOLLOWUP
   POST /api/followups/:leadType/:leadId
========================================================= */
followupRouter.post(
  "/:leadType/:leadId",
  auth,
  authorizeRoles("admin", "sales"),
  addFollowup
);


/* =========================================================
   GET ALL FOLLOWUPS (Pagination + Filters)
   GET /api/followups
   Query:
   ?status=Pending
   ?today=true
   ?leadType=Solar
   ?search=rahul
   ?page=1
   ?limit=10
========================================================= */
followupRouter.get(
  "/",
  auth,
  authorizeRoles("admin", "sales"),
  getAllFollowups
);


/* =========================================================
   FOLLOWUP SUMMARY (Dashboard)
   GET /api/followups/summary
========================================================= */
followupRouter.get(
  "/summary",
  auth,
  authorizeRoles("admin", "sales"),
  getFollowupSummary
);


/* =========================================================
   GET FOLLOWUPS BY LEAD
   GET /api/followups/lead/:leadId
========================================================= */
followupRouter.get(
  "/lead/:leadId",
  auth,
  authorizeRoles("admin", "sales"),
  getLeadFollowups
);


/* =========================================================
   GET SINGLE FOLLOWUP
   GET /api/followups/:id
========================================================= */
followupRouter.get(
  "/:id",
  auth,
  authorizeRoles("admin", "sales"),
  getSingleFollowup
);


/* =========================================================
   UPDATE FOLLOWUP
   PUT /api/followups/:id
========================================================= */
followupRouter.put(
  "/:id",
  auth,
  authorizeRoles("admin", "sales"),
  updateFollowup
);


/* =========================================================
   DELETE FOLLOWUP (Admin Only)
   DELETE /api/followups/:id
========================================================= */
followupRouter.delete(
  "/:id",
  auth,
  authorizeRoles("admin"),
  deleteFollowup
);

module.exports = followupRouter;