  const mongoose = require("mongoose");
  const ServiceRequest = require("../models/servicerequest.model");
  const { notifyUser } = require("../services/notification.service");

  const normPath = (p = "") => p.replace(/\\/g, "/");

  // =============================================
  // 🔹 POPULATE CONFIG
  // =============================================
  const populateConfig = [
    { path: "assignedTo", select: "_id name phone role" },
    { path: "createdBy", select: "_id name phone role" },
  ];

  // =============================================
  // 🔹 GENERATE AUTO SERVICE ID (SRV-2026-0001)
  // =============================================
  const generateServiceId = async () => {
    const year = new Date().getFullYear();

    const lastService = await ServiceRequest.findOne({
      serviceId: { $regex: `^SRV-${year}` },
    }).sort({ createdAt: -1 });

    let nextNumber = 1;

    if (lastService?.serviceId) {
      const lastNumber = parseInt(lastService.serviceId.split("-").pop());
      nextNumber = lastNumber + 1;
    }

    return `SRV-${year}-${String(nextNumber).padStart(4, "0")}`;
  };

  // =============================================
  // ✅ CREATE SERVICE
  // =============================================
  exports.createService = async (req, res) => {
    try {
      const {
        customerName,
        phone,
        address,
        issueType,
        issueDescription,
        priority,
        chargeType,
        chargeAmount,
        assignedTo,
        serviceDate,
        serviceNotes,
      } = req.body;

      // Basic validation
      if (!customerName || !phone || !address || !chargeType || !assignedTo || !serviceDate) {
        return res.status(400).json({
          success: false,
          message: "Required fields missing",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(400).json({
          success: false,
          message: "Invalid assignedTo ID",
        });
      }

      if (chargeType === "Paid" && (!chargeAmount || chargeAmount <= 0)) {
        return res.status(400).json({
          success: false,
          message: "Charge amount must be greater than zero",
        });
      }

      const parsedServiceDate = new Date(serviceDate);
      if (Number.isNaN(parsedServiceDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid serviceDate",
        });
      }

      const serviceId = await generateServiceId();

      const newService = await ServiceRequest.create({
        serviceId,
        customerName,
        phone,
        address,
        issueType: issueType || "",
        issueDescription: issueDescription || "",
        priority: priority || "Medium",
        chargeType,
        chargeAmount: chargeType === "Free" ? 0 : Number(chargeAmount),
        assignedTo,
        status: "Assigned",
        paymentStatus:
          chargeType === "Free" ? "Not Applicable" : "Pending",
        serviceNotes: typeof serviceNotes === "string" ? serviceNotes.trim() : "",
        createdBy: req.user.id,
        assignment: {
          serviceDate: parsedServiceDate,
          assignedAt: new Date(),
        },
      });

      const populatedService = await ServiceRequest.findById(newService._id)
        .populate(populateConfig);

      // Notify assigned technician
      notifyUser(assignedTo, {
        title: "New Service Request Assigned",
        body: `You have been assigned service ${serviceId} for ${customerName}`,
        data: {
          type: "service_request",
          serviceId: newService._id.toString(),
        },
      }).catch((err) => console.error("Service notification error:", err));

      res.status(201).json({
        success: true,
        message: "Service created successfully",
        service: populatedService,
      });

    } catch (error) {
      console.error("CREATE SERVICE ERROR:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };

  // =============================================
  // ✅ GET ALL SERVICES (WITH ROLE FILTER)
  // =============================================

  exports.getAllServices = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, tabIndex } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let query = {};

    // Role filter
    if (req.user.role === "service") {
      query.assignedTo = req.user.id;
    }

    // Tab filter
    const now = new Date();
    const recentCutoff = new Date(now);
    recentCutoff.setDate(recentCutoff.getDate() - 6);
    recentCutoff.setHours(0, 0, 0, 0);

    if (tabIndex === "0") {
      // Recent (last 7 days), not completed
      query.createdAt = { $gte: recentCutoff };
      query.status = { $ne: "Completed" };
    } else if (tabIndex === "1") {
      // Older, not completed
      query.createdAt = { $lt: recentCutoff };
      query.status = { $ne: "Completed" };
    } else if (tabIndex === "2") {
      // Completed only
      query.status = "Completed";
    }

    // Status filter (from chips)
    if (status && status !== "All") {
      query.status = status;
    }

    // Search filter
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { serviceId: { $regex: search, $options: "i" } },
      ];
    }

    const total = await ServiceRequest.countDocuments(query);
    const services = await ServiceRequest.find(query)
      .populate(populateConfig)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Tab counts (for summary badges)
    const recentQuery = req.user.role === "service"
      ? { assignedTo: req.user.id, createdAt: { $gte: recentCutoff }, status: { $ne: "Completed" } }
      : { createdAt: { $gte: recentCutoff }, status: { $ne: "Completed" } };

    const olderQuery = req.user.role === "service"
      ? { assignedTo: req.user.id, createdAt: { $lt: recentCutoff }, status: { $ne: "Completed" } }
      : { createdAt: { $lt: recentCutoff }, status: { $ne: "Completed" } };

    const completedQuery = req.user.role === "service"
      ? { assignedTo: req.user.id, status: "Completed" }
      : { status: "Completed" };

    const [recentCount, olderCount, completedCount] = await Promise.all([
      ServiceRequest.countDocuments(recentQuery),
      ServiceRequest.countDocuments(olderQuery),
      ServiceRequest.countDocuments(completedQuery),
    ]);

    res.status(200).json({
      success: true,
      services,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      tabCounts: {
        recent: recentCount,
        older: olderCount,
        completed: completedCount,
      },
    });

  } catch (error) {
    console.error("GET SERVICES ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

  // =============================================
  // ✅ GET SINGLE SERVICE
  // =============================================
  exports.getSingleService = async (req, res) => {
    try {
      const service = await ServiceRequest.findById(req.params.id)
        .populate(populateConfig);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      res.status(200).json({
        success: true,
        service,
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };

  // =============================================
  // ✅ UPDATE SERVICE
  // =============================================
  exports.updateService = async (req, res) => {
    try {
      const updateData = { ...req.body };

      if (Object.prototype.hasOwnProperty.call(updateData, "serviceNotes")) {
        updateData.serviceNotes =
          typeof updateData.serviceNotes === "string"
            ? updateData.serviceNotes.trim()
            : "";
      }

      const updated = await ServiceRequest.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).populate(populateConfig);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Service updated successfully",
        service: updated,
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };

  // =============================================
  // ✅ ASSIGN SERVICE
  // =============================================
  exports.assignService = async (req, res) => {
    try {
      const { assignedTo, serviceDate, serviceNotes, priority } = req.body;

      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(400).json({
          success: false,
          message: "Invalid technician ID",
        });
      }

      const updated = await ServiceRequest.findByIdAndUpdate(
        req.params.id,
        {
          assignedTo,
          status: "Assigned",
          ...(priority ? { priority } : {}),
          ...(typeof serviceNotes === "string"
            ? { serviceNotes: serviceNotes.trim() }
            : {}),
          assignment: {
            serviceDate,
            assignedAt: new Date(),
          },
        },
        { new: true }
      ).populate(populateConfig);

      res.status(200).json({
        success: true,
        message: "Service assigned successfully",
        service: updated,
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };

  // =============================================
  // ✅ ADD PAYMENT
  // =============================================
  exports.addPayment = async (req, res) => {
    try {
      const { amount, paymentMode } = req.body;
      const validModes = ["Cash", "UPI", "Bank Transfer", "Cheque"];
      const paymentAmount = Number(amount);

      const service = await ServiceRequest.findById(req.params.id);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      if (service.chargeType !== "Paid") {
        return res.status(400).json({
          success: false,
          message: "Payment can only be added for paid services",
        });
      }

      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Amount must be greater than zero",
        });
      }

      if (!validModes.includes(paymentMode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment mode",
        });
      }

      const currentPaid = Number(service.paidAmount || 0);
      const chargeAmount = Number(service.chargeAmount || 0);
      const remaining = Math.max(chargeAmount - currentPaid, 0);

      if (remaining <= 0) {
        return res.status(400).json({
          success: false,
          message: "This service is already fully paid",
        });
      }

      if (paymentAmount > remaining) {
        return res.status(400).json({
          success: false,
          message: `Amount exceeds remaining balance (${remaining})`,
        });
      }

      const paidAmount = currentPaid + paymentAmount;
      service.paidAmount = paidAmount;
      service.paymentMode = paymentMode;
      service.paymentDate = new Date();

      service.paymentHistory.push({
        amount: paymentAmount,
        paymentMode,
        paidAt: new Date(),
        receivedBy: req.user?.id || null,
      });

      if (paidAmount >= chargeAmount) {
        service.paymentStatus = "Paid";
        service.status = "Completed";
        service.paidAmount = chargeAmount;
      } else {
        service.paymentStatus = "Partial";
        if (service.status !== "In Progress") {
          service.status = "Payment Pending";
        }
      }

      await service.save();

      const updated = await ServiceRequest.findById(service._id)
        .populate(populateConfig);

      res.status(200).json({
        success: true,
        message: "Payment added successfully",
        service: updated,
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };

  // =============================================
  // ✅ UPLOAD PHOTOS
  // =============================================
  exports.uploadPhotos = async (req, res) => {
    try {
      const service = await ServiceRequest.findById(req.params.id);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      const beforePhotos = req.files?.beforePhotos?.map(file => normPath(file.path)) || [];
      const afterPhotos = req.files?.afterPhotos?.map(file => normPath(file.path)) || [];
      const legacyPhotos = req.files?.photos?.map(file => normPath(file.path)) || [];

      if (beforePhotos.length === 0 && afterPhotos.length === 0 && legacyPhotos.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No photos uploaded",
        });
      }

      if (beforePhotos.length > 0) {
        service.beforePhotos.push(...beforePhotos);
      }

      if (afterPhotos.length > 0) {
        service.afterPhotos.push(...afterPhotos);
      }

      if (legacyPhotos.length > 0) {
        service.afterPhotos.push(...legacyPhotos);
      }

      await service.save();

      const updated = await ServiceRequest.findById(service._id).populate(populateConfig);

      res.status(200).json({
        success: true,
        message: "Photos uploaded successfully",
        service: updated,
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };

  // =============================================
  // ✅ DELETE SERVICE
  // =============================================
  exports.deleteService = async (req, res) => {
    try {
      const deleted = await ServiceRequest.findByIdAndDelete(req.params.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Service deleted successfully",
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };