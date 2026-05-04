const Followup = require("../models/followup.model");
const SolarLead = require("../models/solarlead.model");
const SprinklerLead = require("../models/sprinklerlead.model");

/* =========================================================
   ADD FOLLOWUP
========================================================= */
exports.addFollowup = async (req, res) => {
  try {
    const { leadId, leadType } = req.params;
    const { followupDate, notes, nextFollowupDate } = req.body;

    if (!["Solar", "Sprinkler"].includes(leadType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leadType",
      });
    }

    if (!followupDate) {
      return res.status(400).json({
        success: false,
        message: "followupDate is required",
      });
    }

    let lead;

    if (leadType === "Solar") {
      lead = await SolarLead.findById(leadId);
    } else {
      lead = await SprinklerLead.findById(leadId);
    }

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `${leadType} lead not found`,
      });
    }

    // Sales can only add followup to their assigned leads
    if (
      req.user.role === "Sales" &&
      lead.assignedTo?.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const followup = await Followup.create({
      leadId,
      leadType,
      customerName: lead.customerName,
      customerPhone: lead.phone || lead.mobile || "",
      followupDate,
      notes,
      nextFollowupDate,
      createdBy: req.user.id,
    });

    // Update lead nextFollowupDate
    if (nextFollowupDate) {
      if (leadType === "Solar") {
        await SolarLead.findByIdAndUpdate(leadId, {
          nextFollowupDate,
        });
      } else {
        await SprinklerLead.findByIdAndUpdate(leadId, {
          nextFollowupDate,
        });
      }
    }

    const populated = await Followup.findById(followup._id)
      .populate("createdBy", "_id name phone");

    res.status(201).json({
      success: true,
      message: "Followup added successfully",
      followup: populated,
    });

  } catch (error) {
    console.error("ADD FOLLOWUP ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* =========================================================
   GET ALL FOLLOWUPS (Pagination + Filters)
========================================================= */
exports.getAllFollowups = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "Sales") {
      query.createdBy = req.user.id;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.leadType) {
      query.leadType = req.query.leadType;
    }

    if (req.query.today === "true") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setHours(23, 59, 59, 999);

      query.followupDate = { $gte: start, $lte: end };
    }

    if (req.query.search) {
      query.$or = [
        { customerName: { $regex: req.query.search, $options: "i" } },
        { customerPhone: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const followups = await Followup.find(query)
      .populate("createdBy", "_id name phone")
      .sort({ followupDate: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Followup.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      followups,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* =========================================================
   GET FOLLOWUPS FOR SPECIFIC LEAD
========================================================= */
exports.getLeadFollowups = async (req, res) => {
  try {
    const { leadId } = req.params;

    const followups = await Followup.find({ leadId })
      .populate("createdBy", "_id name phone")
      .sort({ followupDate: -1 });

    res.status(200).json({
      success: true,
      count: followups.length,
      followups,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* =========================================================
   GET SINGLE FOLLOWUP
========================================================= */
exports.getSingleFollowup = async (req, res) => {
  try {
    const followup = await Followup.findById(req.params.id)
      .populate("createdBy", "_id name phone");

    if (!followup) {
      return res.status(404).json({
        success: false,
        message: "Followup not found",
      });
    }

    if (
      req.user.role === "Sales" &&
      followup.createdBy._id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.status(200).json({
      success: true,
      followup,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* =========================================================
   UPDATE FOLLOWUP
========================================================= */
exports.updateFollowup = async (req, res) => {
  try {
    const followup = await Followup.findById(req.params.id);

    if (!followup) {
      return res.status(404).json({
        success: false,
        message: "Followup not found",
      });
    }

    if (
      req.user.role === "Sales" &&
      followup.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const updateData = { ...req.body };

    const allowedStatus = ["Pending", "Done", "Cancelled"];
    const allowedResponses = [
      "Interested",
      "Not Interested",
      "Call Later",
      "No Response",
      "Deal Done",
    ];

    if (updateData.status && !allowedStatus.includes(updateData.status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    if (
      updateData.customerResponse &&
      !allowedResponses.includes(updateData.customerResponse)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer response",
      });
    }

    // Auto completedAt
    if (updateData.status === "Done" && !followup.completedAt) {
      updateData.completedAt = new Date();
    }

    // Update lead nextFollowupDate if changed
    if (updateData.nextFollowupDate) {
      if (followup.leadType === "Solar") {
        await SolarLead.findByIdAndUpdate(followup.leadId, {
          nextFollowupDate: updateData.nextFollowupDate,
        });
      } else {
        await SprinklerLead.findByIdAndUpdate(followup.leadId, {
          nextFollowupDate: updateData.nextFollowupDate,
        });
      }
    }

    const updated = await Followup.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("createdBy", "_id name phone");

    res.status(200).json({
      success: true,
      message: "Followup updated successfully",
      followup: updated,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* =========================================================
   DELETE FOLLOWUP
========================================================= */
exports.deleteFollowup = async (req, res) => {
  try {
    const followup = await Followup.findByIdAndDelete(req.params.id);

    if (!followup) {
      return res.status(404).json({
        success: false,
        message: "Followup not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Followup deleted successfully",
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* =========================================================
   FOLLOWUP SUMMARY (Dashboard)
========================================================= */
exports.getFollowupSummary = async (req, res) => {
  try {
    let baseQuery = {};

    if (req.user.role === "Sales") {
      baseQuery.createdBy = req.user.id;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const today = await Followup.countDocuments({
      ...baseQuery,
      followupDate: { $gte: todayStart, $lte: todayEnd },
      status: "Pending",
    });

    const pending = await Followup.countDocuments({
      ...baseQuery,
      status: "Pending",
    });

    const overdue = await Followup.countDocuments({
      ...baseQuery,
      followupDate: { $lt: todayStart },
      status: "Pending",
    });

    res.status(200).json({
      success: true,
      today,
      pending,
      overdue,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};