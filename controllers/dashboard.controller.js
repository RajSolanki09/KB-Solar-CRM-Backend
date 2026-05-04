const SolarLead      = require("../models/solarlead.model");
const SprinklerLead  = require("../models/sprinklerlead.model");
const ServiceRequest = require("../models/servicerequest.model");
const Followup       = require("../models/followup.model");
const User           = require("../models/user.model");

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const todayRange = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  return { start, end };
};

const thisMonthRange = () => {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

// ─────────────────────────────────────────────
//  OWNER DASHBOARD
// ─────────────────────────────────────────────
exports.getOwnerDashboard = async (req, res) => {
  try {
    const { start: todayStart, end: todayEnd }       = todayRange();
    const { start: monthStart, end: monthEnd }       = thisMonthRange();

    const [
      totalSolar,
      totalSprinkler,
      completedSolar,
      completedSprinkler,
      totalServices,
      pendingServices,
      todayFollowups,
      pendingPaymentSolar,
      pendingPaymentSprinkler,
      installationPendingSolar,
      installationPendingSprinkler,
      newLeadsThisMonth,
      totalStaff,
      solarRevenue,
      sprinklerRevenue,
      serviceRevenue,
    ] = await Promise.all([
      SolarLead.countDocuments(),
      SprinklerLead.countDocuments(),
      SolarLead.countDocuments({ isCompleted: true }),
      SprinklerLead.countDocuments({ isCompleted: true }),
      ServiceRequest.countDocuments(),
      ServiceRequest.countDocuments({ status: { $in: ["Open", "Assigned", "In Progress"] } }),

      // Today's followups across both lead types
      Followup.countDocuments({
        followupDate: { $gte: todayStart, $lte: todayEnd },
        status: "Pending",
      }),

      // Leads with pending payment
      SolarLead.countDocuments({
        "payment.remainingBalance": { $gt: 0 },
        currentStep: { $ne: "paymentCompleted" },
      }),
      SprinklerLead.countDocuments({
        "payment.remainingBalance": { $gt: 0 },
        currentStep: { $ne: "projectCompleted" },
      }),

      // Installation pending
      SolarLead.countDocuments({ currentStep: "dealClosed" }),
      SprinklerLead.countDocuments({ currentStep: "dealDone" }),

      // New leads this month
      SolarLead.countDocuments({ createdAt: { $gte: monthStart, $lte: monthEnd } }),

      User.countDocuments({ role: { $in: ["Sales", "Service"] } }),

      // Revenue
      SolarLead.aggregate([
        { $group: { _id: null, total: { $sum: "$payment.amountReceived" } } },
      ]),
      SprinklerLead.aggregate([
        { $group: { _id: null, total: { $sum: "$payment.amountReceived" } } },
      ]),
      ServiceRequest.aggregate([
        { $match: { chargeType: "Paid" } },
        { $group: { _id: null, total: { $sum: "$paidAmount" } } },
      ]),
    ]);

    // Month-wise revenue for chart (last 6 months)
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return {
        month: d.toLocaleString("default", { month: "short" }),
        year:  d.getFullYear(),
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
      };
    });

    const revenueChart = await Promise.all(
      last6Months.map(async (m) => {
        const [s, sp, sv] = await Promise.all([
          SolarLead.aggregate([
            { $match: { "payment.completedAt": { $gte: m.start, $lte: m.end } } },
            { $group: { _id: null, total: { $sum: "$payment.amountReceived" } } },
          ]),
          SprinklerLead.aggregate([
            { $match: { "payment.completedAt": { $gte: m.start, $lte: m.end } } },
            { $group: { _id: null, total: { $sum: "$payment.amountReceived" } } },
          ]),
          ServiceRequest.aggregate([
            { $match: { paymentDate: { $gte: m.start, $lte: m.end }, chargeType: "Paid" } },
            { $group: { _id: null, total: { $sum: "$paidAmount" } } },
          ]),
        ]);
        return {
          label:    `${m.month} ${m.year}`,
          solar:    s[0]?.total  || 0,
          sprinkler: sp[0]?.total || 0,
          service:  sv[0]?.total || 0,
          total:    (s[0]?.total || 0) + (sp[0]?.total || 0) + (sv[0]?.total || 0),
        };
      })
    );

    res.status(200).json({
      success: true,
      cards: {
        totalLeads:           totalSolar + totalSprinkler,
        solarLeads:           totalSolar,
        sprinklerLeads:       totalSprinkler,
        completedLeads:       completedSolar + completedSprinkler,
        totalServices,
        pendingServices,
        todayFollowups,
        pendingPayment:       pendingPaymentSolar + pendingPaymentSprinkler,
        installationPending:  installationPendingSolar + installationPendingSprinkler,
        newLeadsThisMonth,
        totalStaff,
      },
      revenue: {
        solar:     solarRevenue[0]?.total     || 0,
        sprinkler: sprinklerRevenue[0]?.total || 0,
        service:   serviceRevenue[0]?.total   || 0,
        total:    (solarRevenue[0]?.total || 0) +
                  (sprinklerRevenue[0]?.total || 0) +
                  (serviceRevenue[0]?.total || 0),
      },
      revenueChart,
    });

  } catch (err) {
    console.error("OWNER DASHBOARD ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─────────────────────────────────────────────
//  SALES DASHBOARD
// ─────────────────────────────────────────────
exports.getSalesDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const { start: todayStart, end: todayEnd }   = todayRange();
    const { start: monthStart, end: monthEnd }   = thisMonthRange();

    const [
      myTotalLeads,
      mySolarLeads,
      mySprinklerLeads,
      myCompletedLeads,
      myDealsClosed,
      todayFollowups,
      overdueFollowups,
      pendingQuotations,
      newLeadsThisMonth,
      dealsThisMonth,
    ] = await Promise.all([
      // All leads assigned to me
      Promise.all([
        SolarLead.countDocuments({ assignedTo: userId }),
        SprinklerLead.countDocuments({ assignedTo: userId }),
      ]).then(([s, sp]) => s + sp),

      SolarLead.countDocuments({ assignedTo: userId }),
      SprinklerLead.countDocuments({ assignedTo: userId }),

      // Completed
      Promise.all([
        SolarLead.countDocuments({ assignedTo: userId, isCompleted: true }),
        SprinklerLead.countDocuments({ assignedTo: userId, isCompleted: true }),
      ]).then(([s, sp]) => s + sp),

      // Deals closed (dealClosed / dealDone step)
      Promise.all([
        SolarLead.countDocuments({ assignedTo: userId, currentStep: { $in: ["dealClosed","portalSubmitted","installed","meterInstalled","subsidyCompleted","paymentCompleted"] } }),
        SprinklerLead.countDocuments({ assignedTo: userId, currentStep: { $in: ["dealDone","installation","fullPayment","customerReview","projectCompleted"] } }),
      ]).then(([s, sp]) => s + sp),

      // Today's followups
      Followup.countDocuments({
        createdBy: userId,
        followupDate: { $gte: todayStart, $lte: todayEnd },
        status: "Pending",
      }),

      // Overdue followups
      Followup.countDocuments({
        createdBy: userId,
        followupDate: { $lt: todayStart },
        status: "Pending",
      }),

      // Pending quotations (visited but no quotation yet)
      Promise.all([
        SolarLead.countDocuments({ assignedTo: userId, currentStep: "visited" }),
        SprinklerLead.countDocuments({ assignedTo: userId, currentStep: "siteVisit" }),
      ]).then(([s, sp]) => s + sp),

      // New this month
      Promise.all([
        SolarLead.countDocuments({ assignedTo: userId, createdAt: { $gte: monthStart, $lte: monthEnd } }),
        SprinklerLead.countDocuments({ assignedTo: userId, createdAt: { $gte: monthStart, $lte: monthEnd } }),
      ]).then(([s, sp]) => s + sp),

      // Deals this month
      Promise.all([
        SolarLead.countDocuments({ assignedTo: userId, currentStep: "dealClosed", "deal.closedAt": { $gte: monthStart, $lte: monthEnd } }),
        SprinklerLead.countDocuments({ assignedTo: userId, currentStep: "dealDone", "deal.closedAt": { $gte: monthStart, $lte: monthEnd } }),
      ]).then(([s, sp]) => s + sp),
    ]);

    // Recent followups for today
    const recentFollowups = await Followup.find({
      createdBy: userId,
      followupDate: { $gte: todayStart, $lte: todayEnd },
      status: "Pending",
    })
      .limit(10)
      .sort({ followupDate: 1 });

    // My recent leads
    const recentLeads = await SolarLead.find({ assignedTo: userId })
      .select("customerName phone currentStep isCompleted createdAt")
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      cards: {
        myTotalLeads,
        mySolarLeads,
        mySprinklerLeads,
        myCompletedLeads,
        myDealsClosed,
        todayFollowups,
        overdueFollowups,
        pendingQuotations,
        newLeadsThisMonth,
        dealsThisMonth,
        conversionRate: myTotalLeads > 0
          ? ((myDealsClosed / myTotalLeads) * 100).toFixed(1)
          : 0,
      },
      recentFollowups,
      recentLeads,
    });

  } catch (err) {
    console.error("SALES DASHBOARD ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─────────────────────────────────────────────
//  SERVICE DASHBOARD
// ─────────────────────────────────────────────
exports.getServiceDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const { start: todayStart, end: todayEnd } = todayRange();
    const { start: monthStart, end: monthEnd } = thisMonthRange();

    const [
      todayServices,
      pendingServices,
      inProgressServices,
      completedServices,
      completedThisMonth,
      paidPending,
      totalRevenue,
    ] = await Promise.all([
      // Today assigned to me
      ServiceRequest.countDocuments({
        assignedTo: userId,
        "assignment.serviceDate": { $gte: todayStart, $lte: todayEnd },
      }),

      ServiceRequest.countDocuments({ assignedTo: userId, status: "Assigned" }),
      ServiceRequest.countDocuments({ assignedTo: userId, status: "In Progress" }),
      ServiceRequest.countDocuments({ assignedTo: userId, status: { $in: ["Resolved","Closed"] } }),

      ServiceRequest.countDocuments({
        assignedTo: userId,
        status: { $in: ["Resolved","Closed"] },
        resolvedAt: { $gte: monthStart, $lte: monthEnd },
      }),

      // Paid but payment not collected
      ServiceRequest.countDocuments({
        assignedTo: userId,
        chargeType: "Paid",
        paymentStatus: { $in: ["Pending","Partial"] },
      }),

      // My total revenue collected
      ServiceRequest.aggregate([
        { $match: { assignedTo: userId, chargeType: "Paid" } },
        { $group: { _id: null, total: { $sum: "$paidAmount" } } },
      ]),
    ]);

    // Today's service list
    const todayList = await ServiceRequest.find({
      assignedTo: userId,
      "assignment.serviceDate": { $gte: todayStart, $lte: todayEnd },
    })
      .select("serviceId customerName phone address status chargeType chargeAmount")
      .sort({ "assignment.serviceDate": 1 });

    // Recent completed
    const recentCompleted = await ServiceRequest.find({
      assignedTo: userId,
      status: { $in: ["Resolved","Closed"] },
    })
      .select("serviceId customerName status chargeType paidAmount resolvedAt")
      .sort({ resolvedAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      cards: {
        todayServices,
        pendingServices,
        inProgressServices,
        completedServices,
        completedThisMonth,
        paidPending,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
      todayList,
      recentCompleted,
    });

  } catch (err) {
    console.error("SERVICE DASHBOARD ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};