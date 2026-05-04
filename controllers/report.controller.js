const SolarLead      = require("../models/solarlead.model");
const SprinklerLead  = require("../models/sprinklerlead.model");
const ServiceRequest = require("../models/servicerequest.model");
const User           = require("../models/user.model");

// ─────────────────────────────────────────────
//  HELPER: date range filter from query
// ─────────────────────────────────────────────
const dateRange = (req) => {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to)   filter.createdAt.$lte = new Date(new Date(req.query.to).setHours(23, 59, 59, 999));
  }
  return filter;
};

// ─────────────────────────────────────────────
//  1. SALES REPORT — team-wise lead performance
// ─────────────────────────────────────────────
exports.getSalesReport = async (req, res) => {
  try {
    const matchStage = { ...dateRange(req) };
    if (req.query.salesPersonId) matchStage.assignedTo = require("mongoose").Types.ObjectId(req.query.salesPersonId);

    const [solarByPerson, sprinklerByPerson, salesTeam] = await Promise.all([

      // Solar leads grouped by sales person
      SolarLead.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$assignedTo",
            totalLeads:     { $sum: 1 },
            completed:      { $sum: { $cond: ["$isCompleted", 1, 0] } },
            dealsClosed:    { $sum: { $cond: [{ $eq: ["$currentStep", "dealClosed"] }, 1, 0] } },
            totalRevenue:   { $sum: "$payment.amountReceived" },
          },
        },
        {
          $lookup: {
            from: "users", localField: "_id",
            foreignField: "_id", as: "person",
          },
        },
        { $unwind: { path: "$person", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name:         "$person.name",
            phone:        "$person.phone",
            totalLeads:   1,
            completed:    1,
            dealsClosed:  1,
            totalRevenue: 1,
            conversionRate: {
              $cond: [
                { $gt: ["$totalLeads", 0] },
                { $multiply: [{ $divide: ["$dealsClosed", "$totalLeads"] }, 100] },
                0,
              ],
            },
          },
        },
        { $sort: { totalLeads: -1 } },
      ]),

      // Sprinkler leads grouped by sales person
      SprinklerLead.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$assignedTo",
            totalLeads:   { $sum: 1 },
            completed:    { $sum: { $cond: ["$isCompleted", 1, 0] } },
            dealsClosed:  { $sum: { $cond: [{ $eq: ["$currentStep", "dealDone"] }, 1, 0] } },
            totalRevenue: { $sum: "$payment.amountReceived" },
          },
        },
        {
          $lookup: {
            from: "users", localField: "_id",
            foreignField: "_id", as: "person",
          },
        },
        { $unwind: { path: "$person", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: "$person.name", phone: "$person.phone",
            totalLeads: 1, completed: 1, dealsClosed: 1, totalRevenue: 1,
          },
        },
        { $sort: { totalLeads: -1 } },
      ]),

      // All sales team members
      User.find({ role: "Sales" }).select("_id name phone"),
    ]);

    // Merge solar + sprinkler by person
    const merged = {};
    salesTeam.forEach(s => {
      merged[s._id.toString()] = {
        _id: s._id, name: s.name, phone: s.phone,
        solar:     { leads: 0, completed: 0, deals: 0, revenue: 0 },
        sprinkler: { leads: 0, completed: 0, deals: 0, revenue: 0 },
      };
    });

    solarByPerson.forEach(r => {
      const key = r._id?.toString();
      if (key && merged[key]) {
        merged[key].solar = { leads: r.totalLeads, completed: r.completed, deals: r.dealsClosed, revenue: r.totalRevenue || 0 };
      }
    });

    sprinklerByPerson.forEach(r => {
      const key = r._id?.toString();
      if (key && merged[key]) {
        merged[key].sprinkler = { leads: r.totalLeads, completed: r.completed, deals: r.dealsClosed, revenue: r.totalRevenue || 0 };
      }
    });

    const report = Object.values(merged).map(p => ({
      ...p,
      totalLeads:   p.solar.leads + p.sprinkler.leads,
      totalDeals:   p.solar.deals + p.sprinkler.deals,
      totalRevenue: p.solar.revenue + p.sprinkler.revenue,
    }));

    res.status(200).json({ success: true, report });

  } catch (err) {
    console.error("SALES REPORT ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─────────────────────────────────────────────
//  2. INSTALLATION REPORT
// ─────────────────────────────────────────────
exports.getInstallationReport = async (req, res) => {
  try {
    const dateFilter = dateRange(req);
    const typeFilter = req.query.type; // "solar" | "sprinkler" | undefined

    const solarFilter   = { ...dateFilter, "installation.completedAt": { $exists: true } };
    const sprinklerFilter = { ...dateFilter, "installation.completedAt": { $exists: true } };

    const [solar, sprinkler] = await Promise.all([
      typeFilter === "sprinkler" ? [] :
        SolarLead.find(solarFilter)
          .select("customerName phone address installation.teamAssigned installation.installationDate installation.systemTested installation.customerSigned installation.completedAt currentStep")
          .sort({ "installation.completedAt": -1 }),

      typeFilter === "solar" ? [] :
        SprinklerLead.find(sprinklerFilter)
          .select("customerName phone address installation.teamAssigned installation.installationDate installation.systemTested installation.customerSigned installation.completedAt currentStep")
          .sort({ "installation.completedAt": -1 }),
    ]);

    const summary = {
      solar:     { total: solar.length,     tested: solar.filter(l => l.installation?.systemTested).length,     signed: solar.filter(l => l.installation?.customerSigned).length },
      sprinkler: { total: sprinkler.length, tested: sprinkler.filter(l => l.installation?.systemTested).length, signed: sprinkler.filter(l => l.installation?.customerSigned).length },
    };

    res.status(200).json({ success: true, summary, solar, sprinkler });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─────────────────────────────────────────────
//  3. PAYMENT REPORT
// ─────────────────────────────────────────────
exports.getPaymentReport = async (req, res) => {
  try {
    const dateFilter = dateRange(req);
    const serviceDateFilter = { chargeType: "Paid" };

    if (req.query.from || req.query.to) {
      serviceDateFilter.paymentDate = {};
      if (req.query.from) serviceDateFilter.paymentDate.$gte = new Date(req.query.from);
      if (req.query.to) {
        serviceDateFilter.paymentDate.$lte = new Date(
          new Date(req.query.to).setHours(23, 59, 59, 999)
        );
      }
    }

    const [solarPayments, sprinklerPayments, servicePayments] = await Promise.all([

      SolarLead.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalAmount:    { $sum: "$payment.totalAmount" },
            received:       { $sum: "$payment.amountReceived" },
            pending:        { $sum: "$payment.remainingBalance" },
            completedCount: { $sum: { $cond: ["$isCompleted", 1, 0] } },
            totalLeads:     { $sum: 1 },
          },
        },
      ]),

      SprinklerLead.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalAmount:    { $sum: "$payment.totalAmount" },
            received:       { $sum: "$payment.amountReceived" },
            pending:        { $sum: "$payment.remainingBalance" },
            completedCount: { $sum: { $cond: ["$isCompleted", 1, 0] } },
            totalLeads:     { $sum: 1 },
          },
        },
      ]),

      ServiceRequest.aggregate([
        { $match: serviceDateFilter },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$chargeAmount" },
            received:    { $sum: "$paidAmount" },
            pending:     { $sum: { $subtract: ["$chargeAmount", "$paidAmount"] } },
          },
        },
      ]),
    ]);

    const solar     = solarPayments[0]     || { totalAmount: 0, received: 0, pending: 0 };
    const sprinkler = sprinklerPayments[0] || { totalAmount: 0, received: 0, pending: 0 };
    const service   = servicePayments[0]   || { totalAmount: 0, received: 0, pending: 0 };

    res.status(200).json({
      success: true,
      solar, sprinkler, service,
      overall: {
        totalAmount: solar.totalAmount + sprinkler.totalAmount + service.totalAmount,
        received:    solar.received    + sprinkler.received    + service.received,
        pending:     solar.pending     + sprinkler.pending     + service.pending,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─────────────────────────────────────────────
//  4. SUBSIDY REPORT (Solar only)
// ─────────────────────────────────────────────
exports.getSubsidyReport = async (req, res) => {
  try {
    const dateFilter = dateRange(req);

    const [byStatus, leads] = await Promise.all([
      SolarLead.aggregate([
        { $match: { ...dateFilter, "subsidy.approvalStatus": { $exists: true } } },
        {
          $group: {
            _id:   "$subsidy.approvalStatus",
            count: { $sum: 1 },
            totalSubsidyAmount: { $sum: "$quotation.subsidyAmount" },
          },
        },
      ]),

      SolarLead.find({
        ...dateFilter,
        "subsidy.approvalStatus": { $exists: true },
      })
        .select("customerName phone address quotation.subsidyAmount quotation.totalAmount subsidy currentStep")
        .sort({ "subsidy.creditedDate": -1 }),
    ]);

    const summary = { claimSubmitted: 0, underReview: 0, approved: 0, credited: 0, rejected: 0 };
    byStatus.forEach(s => { if (s._id) summary[s._id] = s.count; });

    const totalSubsidyExpected = leads.reduce((s, l) => s + (l.quotation?.subsidyAmount || 0), 0);
    const totalCredited = leads
      .filter(l => l.subsidy?.approvalStatus === "credited")
      .reduce((s, l) => s + (l.quotation?.subsidyAmount || 0), 0);

    res.status(200).json({
      success: true,
      summary,
      totalSubsidyExpected,
      totalCredited,
      leads,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─────────────────────────────────────────────
//  5. SERVICE REVENUE REPORT
// ─────────────────────────────────────────────
exports.getServiceRevenueReport = async (req, res) => {
  try {
    const dateFilter = dateRange(req);

    const [byType, byTechnician, services] = await Promise.all([

      // Free vs Paid breakdown
      ServiceRequest.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id:         "$chargeType",
            count:       { $sum: 1 },
            totalCharge: { $sum: "$chargeAmount" },
            totalPaid:   { $sum: "$paidAmount" },
          },
        },
      ]),

      // Revenue by technician
      ServiceRequest.aggregate([
        { $match: { ...dateFilter, chargeType: "Paid" } },
        {
          $group: {
            _id:       "$assignedTo",
            count:     { $sum: 1 },
            revenue:   { $sum: "$paidAmount" },
          },
        },
        {
          $lookup: {
            from: "users", localField: "_id",
            foreignField: "_id", as: "tech",
          },
        },
        { $unwind: { path: "$tech", preserveNullAndEmptyArrays: true } },
        { $project: { name: "$tech.name", phone: "$tech.phone", count: 1, revenue: 1 } },
        { $sort: { revenue: -1 } },
      ]),

      // Recent paid services
      ServiceRequest.find({ ...dateFilter, chargeType: "Paid" })
        .select("serviceId customerName phone chargeAmount paidAmount paymentStatus status createdAt")
        .populate("assignedTo", "_id name phone")
        .sort({ createdAt: -1 })
        .limit(50),
    ]);

    const paidRow = byType.find(r => r._id === "Paid")  || { count: 0, totalCharge: 0, totalPaid: 0 };
    const freeRow = byType.find(r => r._id === "Free")  || { count: 0 };

    res.status(200).json({
      success: true,
      summary: {
        paidServices:  paidRow.count,
        freeServices:  freeRow.count,
        totalCharged:  paidRow.totalCharge,
        totalCollected: paidRow.totalPaid,
        pending:       paidRow.totalCharge - paidRow.totalPaid,
      },
      byTechnician,
      services,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─────────────────────────────────────────────
//  6. MONTHLY PROFIT REPORT
// ─────────────────────────────────────────────
exports.getMonthlyReport = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();

    const startOfYear = new Date(`${year}-01-01`);
    const endOfYear   = new Date(`${year}-12-31T23:59:59`);

    const groupByMonth = {
      $group: {
        _id:      { month: { $month: "$createdAt" } },
        leads:    { $sum: 1 },
        revenue:  { $sum: "$payment.amountReceived" },
        completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
      },
    };

    const [solarMonthly, sprinklerMonthly, serviceMonthly] = await Promise.all([
      SolarLead.aggregate([
        { $match: { createdAt: { $gte: startOfYear, $lte: endOfYear } } },
        groupByMonth,
        { $sort: { "_id.month": 1 } },
      ]),

      SprinklerLead.aggregate([
        { $match: { createdAt: { $gte: startOfYear, $lte: endOfYear } } },
        groupByMonth,
        { $sort: { "_id.month": 1 } },
      ]),

      ServiceRequest.aggregate([
        { $match: { createdAt: { $gte: startOfYear, $lte: endOfYear }, chargeType: "Paid" } },
        {
          $group: {
            _id:     { month: { $month: "$createdAt" } },
            count:   { $sum: 1 },
            revenue: { $sum: "$paidAmount" },
          },
        },
        { $sort: { "_id.month": 1 } },
      ]),
    ]);

    // Build 12-month array
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const solar     = solarMonthly.find(r => r._id.month === m)      || { leads: 0, revenue: 0, completed: 0 };
      const sprinkler = sprinklerMonthly.find(r => r._id.month === m)  || { leads: 0, revenue: 0, completed: 0 };
      const service   = serviceMonthly.find(r => r._id.month === m)    || { count: 0, revenue: 0 };

      const totalRevenue = (solar.revenue || 0) + (sprinkler.revenue || 0) + (service.revenue || 0);

      return {
        month: m,
        monthName: new Date(year, i, 1).toLocaleString("default", { month: "long" }),
        solar:     { leads: solar.leads, completed: solar.completed, revenue: solar.revenue || 0 },
        sprinkler: { leads: sprinkler.leads, completed: sprinkler.completed, revenue: sprinkler.revenue || 0 },
        service:   { count: service.count, revenue: service.revenue || 0 },
        totalLeadCount: solar.leads + sprinkler.leads,
        totalServiceCount: service.count,
        totalLeads:   solar.leads + sprinkler.leads + service.count,
        totalRevenue,
      };
    });

    const yearTotal = months.reduce((acc, m) => ({
      leads:   acc.leads   + m.totalLeads,
      revenue: acc.revenue + m.totalRevenue,
    }), { leads: 0, revenue: 0 });

    res.status(200).json({ success: true, year, yearTotal, months });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};