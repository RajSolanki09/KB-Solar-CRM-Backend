const Material = require("../models/material.model");
const MaterialCustomer = require("../models/materialCustomer.model");
const User = require("../models/user.model");

const MATERIAL_PIPELINE_STATUSES = [
  "New",
  "Source Added",
  "Follow-up",
  "Deal Done",
  "Payment",
  "Completed",
];

const normalizeMaterialPipeline = (pipeline) => {
  const data = pipeline || {};
  const source = data.source || {};
  const followUp = data.followUp || {};
  const dealDone = data.dealDone || {};
  const payment = data.payment || {};
  const dispatch = data.dispatch || {};

  const hasSource = Boolean(
    source.materialId &&
      Number.isFinite(Number(source.materialAmount)) &&
      Number(source.materialAmount) >= 0
  );
  const hasFollowUp = Boolean(followUp.assignedTo && followUp.followUpAt);
  const hasDealDone =
    Number.isFinite(Number(dealDone.finalAmount)) &&
    Number(dealDone.finalAmount) >= 0;
  const hasPayment = typeof payment.paymentComplete === "boolean";
  const hasDispatch = Boolean(dispatch.dispatchDate);

  let currentStep = -1;
  if (hasSource) currentStep = 0;
  if (hasFollowUp) currentStep = 1;
  if (hasDealDone) currentStep = 2;
  if (hasPayment) currentStep = 3;
  if (hasDispatch) currentStep = 4;

  const isCompleted = hasDispatch;
  const status = isCompleted
    ? MATERIAL_PIPELINE_STATUSES[5]
    : MATERIAL_PIPELINE_STATUSES[Math.max(0, currentStep + 1)];

  return {
    currentStep,
    status,
    isCompleted,
    completedAt: isCompleted ? dispatch.dispatchDate || new Date() : null,
  };
};

const parseMaterialPipelineDateTime = ({ followUpAt, followUpDate, followUpTime }) => {
  if (followUpAt) {
    const parsed = new Date(followUpAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (!followUpDate) return null;
  const base = new Date(followUpDate);
  if (Number.isNaN(base.getTime())) return null;

  if (typeof followUpTime === "string" && followUpTime.trim()) {
    const parts = followUpTime.trim().split(":");
    const hh = Number(parts[0]);
    const mm = Number(parts[1] || 0);
    if (
      Number.isFinite(hh) &&
      Number.isFinite(mm) &&
      hh >= 0 &&
      hh <= 23 &&
      mm >= 0 &&
      mm <= 59
    ) {
      base.setHours(hh, mm, 0, 0);
    }
  }

  return base;
};

const parseAndValidateMaterialPayload = (payload) => {
  const {
    materialName,
    brand,
    purchasePrice,
    sellingPrice,
    gstRate,
    note,
    customFields,
  } = payload;

  if (!materialName || purchasePrice == null || sellingPrice == null) {
    return {
      error:
        "materialName, purchasePrice and sellingPrice are required",
    };
  }

  const purchase = Number(purchasePrice);
  const selling = Number(sellingPrice);

  if (!Number.isFinite(purchase) || purchase < 0) {
    return { error: "Invalid purchasePrice" };
  }

  if (!Number.isFinite(selling) || selling < 0) {
    return { error: "Invalid sellingPrice" };
  }

  return {
    value: {
      materialName: String(materialName).trim(),
      brand: brand ? String(brand).trim() : "",
      purchasePrice: purchase,
      sellingPrice: selling,
      gstRate: gstRate ? String(gstRate).trim() : "",
      note: note ? String(note).trim() : "",
      customFields:
        customFields && typeof customFields === "object" ? customFields : {},
    },
  };
};

const MATERIAL_FORM_SCHEMA = {
  gstOptions: ["0%", "5%", "12%", "18%", "28%"],
  sections: [
    {
      key: "material_basic",
      title: "Material Details",
      fields: [
        {
          key: "materialName",
          label: "Material Name",
          type: "text",
          required: true,
        },
        {
          key: "brand",
          label: "Brand",
          type: "text",
          required: false,
        },
      ],
    },
    {
      key: "pricing",
      title: "Pricing",
      fields: [
        {
          key: "purchasePrice",
          label: "Purchase Price",
          type: "number",
          required: true,
          decimal: true,
        },
        {
          key: "sellingPrice",
          label: "Selling Price",
          type: "number",
          required: true,
          decimal: true,
        },
        {
          key: "gstRate",
          label: "GST %",
          type: "dropdown",
          required: false,
          optionsFrom: "gstOptions",
        },
      ],
    },
    {
      key: "note",
      title: "Note",
      fields: [
        {
          key: "note",
          label: "Internal Note",
          type: "multiline",
          required: false,
          maxLines: 4,
        },
      ],
    },
  ],
};

const parseAndValidateMaterialCustomerPayload = (payload) => {
  const { customerName, mobile, address, customFields } = payload;

  if (!customerName || !mobile || !address) {
    return {
      error: "customerName, mobile and address are required",
    };
  }

  let normalizedMobile = String(mobile).replace(/\D+/g, "").trim();
  if (normalizedMobile.length === 12 && normalizedMobile.startsWith("91")) {
    normalizedMobile = normalizedMobile.slice(2);
  }

  if (!/^[6-9][0-9]{9}$/.test(normalizedMobile)) {
    return { error: "Invalid mobile number. Enter a valid 10-digit Indian number" };
  }

  return {
    value: {
      customerName: String(customerName).trim(),
      mobile: normalizedMobile,
      address: String(address).trim(),
      customFields:
        customFields && typeof customFields === "object" ? customFields : {},
    },
  };
};

const MATERIAL_CUSTOMER_FORM_SCHEMA = {
  sections: [
    {
      key: "customer_basic",
      title: "Customer Details",
      fields: [
        {
          key: "customerName",
          label: "Customer Name",
          type: "text",
          required: true,
        },
        {
          key: "mobile",
          label: "Mobile Number",
          type: "text",
          required: true,
        },
        {
          key: "address",
          label: "Address",
          type: "multiline",
          required: true,
          maxLines: 3,
        },
      ],
    },
  ],
};

exports.getMaterialFormSchema = async (req, res) => {
  return res.status(200).json({
    success: true,
    schema: MATERIAL_FORM_SCHEMA,
  });
};

exports.getMaterialCustomerFormSchema = async (req, res) => {
  return res.status(200).json({
    success: true,
    schema: MATERIAL_CUSTOMER_FORM_SCHEMA,
  });
};

exports.createMaterial = async (req, res) => {
  try {
    const parsed = parseAndValidateMaterialPayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const material = await Material.create({
      ...parsed.value,
      createdBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: "Material created successfully",
      material,
    });
  } catch (error) {
    console.error("CREATE MATERIAL ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getAllMaterials = async (req, res) => {
  try {
    const materials = await Material.find()
      .populate({ path: "createdBy", select: "_id name role" })
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, materials });
  } catch (error) {
    console.error("GET MATERIALS ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createMaterialCustomer = async (req, res) => {
  try {
    const parsed = parseAndValidateMaterialCustomerPayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const customer = await MaterialCustomer.create({
      ...parsed.value,
      createdBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: "Material customer created successfully",
      customer,
    });
  } catch (error) {
    console.error("CREATE MATERIAL CUSTOMER ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getAllMaterialCustomers = async (req, res) => {
  try {
    const customers = await MaterialCustomer.find()
      .populate({ path: "createdBy", select: "_id name role" })
      .populate({
        path: "pipeline.source.materialId",
        select: "_id materialName brand",
      })
      .populate({
        path: "pipeline.followUp.assignedTo",
        select: "_id name role",
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, customers });
  } catch (error) {
    console.error("GET MATERIAL CUSTOMERS ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getMaterialCustomerById = async (req, res) => {
  try {
    const customer = await MaterialCustomer.findById(req.params.id)
      .populate({ path: "createdBy", select: "_id name role" })
      .populate({
        path: "pipeline.source.materialId",
        select: "_id materialName brand",
      })
      .populate({
        path: "pipeline.followUp.assignedTo",
        select: "_id name role",
      });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Material customer not found",
      });
    }

    return res.status(200).json({ success: true, customer });
  } catch (error) {
    console.error("GET MATERIAL CUSTOMER DETAIL ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getSalesPeopleForMaterialPipeline = async (req, res) => {
  try {
    const staff = await User.find({ role: "sales", status: "Active" })
      .select("_id name role phone status")
      .sort({ name: 1 });

    return res.status(200).json({ success: true, staff });
  } catch (error) {
    console.error("GET MATERIAL SALES STAFF ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateMaterialCustomerPipeline = async (req, res) => {
  try {
    const { step } = req.body;
    if (!step || typeof step !== "string") {
      return res.status(400).json({ success: false, message: "step is required" });
    }

    const customer = await MaterialCustomer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Material customer not found",
      });
    }

    customer.pipeline = customer.pipeline || {};

    if (step === "source") {
      const { materialId, materialAmount } = req.body;
      if (!materialId || materialAmount == null) {
        return res.status(400).json({
          success: false,
          message: "materialId and materialAmount are required",
        });
      }

      const amount = Number(materialAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ success: false, message: "Invalid materialAmount" });
      }

      const material = await Material.findById(materialId).select("_id materialName");
      if (!material) {
        return res.status(404).json({ success: false, message: "Material not found" });
      }

      customer.pipeline.source = {
        materialId: material._id,
        materialName: material.materialName,
        materialAmount: amount,
        updatedAt: new Date(),
      };
    } else if (step === "followUp") {
      const { assignedTo, followUpAt, followUpDate, followUpTime } = req.body;
      if (!assignedTo) {
        return res.status(400).json({ success: false, message: "assignedTo is required" });
      }

      const followDateTime = parseMaterialPipelineDateTime({
        followUpAt,
        followUpDate,
        followUpTime,
      });
      if (!followDateTime) {
        return res.status(400).json({
          success: false,
          message: "Valid followUpAt or followUpDate is required",
        });
      }

      const assignee = await User.findOne({ _id: assignedTo, role: "sales" }).select("_id name");
      if (!assignee) {
        return res.status(404).json({ success: false, message: "Sales person not found" });
      }

      customer.pipeline.followUp = {
        assignedTo: assignee._id,
        assignedToName: assignee.name,
        followUpAt: followDateTime,
        updatedAt: new Date(),
      };
    } else if (step === "dealDone") {
      const { finalAmount } = req.body;
      const amount = Number(finalAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ success: false, message: "Valid finalAmount is required" });
      }

      customer.pipeline.dealDone = {
        finalAmount: amount,
        updatedAt: new Date(),
      };
    } else if (step === "payment") {
      const { paymentComplete } = req.body;
      if (typeof paymentComplete !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "paymentComplete must be yes/no",
        });
      }

      customer.pipeline.payment = {
        paymentComplete,
        updatedAt: new Date(),
      };
    } else if (step === "dispatch") {
      const { dispatchDate } = req.body;
      const parsed = dispatchDate ? new Date(dispatchDate) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Valid dispatchDate is required",
        });
      }

      customer.pipeline.dispatch = {
        dispatchDate: parsed,
        updatedAt: new Date(),
      };
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid step. Use source, followUp, dealDone, payment or dispatch",
      });
    }

    const normalized = normalizeMaterialPipeline(customer.pipeline);
    customer.pipeline.currentStep = normalized.currentStep;
    customer.pipeline.status = normalized.status;
    customer.pipeline.isCompleted = normalized.isCompleted;
    customer.pipeline.completedAt = normalized.completedAt;

    await customer.save();

    const populated = await MaterialCustomer.findById(customer._id)
      .populate({ path: "createdBy", select: "_id name role" })
      .populate({
        path: "pipeline.source.materialId",
        select: "_id materialName brand",
      })
      .populate({
        path: "pipeline.followUp.assignedTo",
        select: "_id name role",
      });

    return res.status(200).json({
      success: true,
      message: "Material customer pipeline updated successfully",
      customer: populated,
    });
  } catch (error) {
    console.error("UPDATE MATERIAL CUSTOMER PIPELINE ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.markMaterialCustomerFollowUpDone = async (req, res) => {
  try {
    const customer = await MaterialCustomer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Material customer not found",
      });
    }

    customer.pipeline = customer.pipeline || {};
    const followUp = customer.pipeline.followUp || {};

    customer.pipeline.followUp = {
      ...followUp,
      followUpAt: null,
      updatedAt: new Date(),
    };

    const normalized = normalizeMaterialPipeline(customer.pipeline);
    customer.pipeline.currentStep = normalized.currentStep;
    customer.pipeline.status = normalized.status;
    customer.pipeline.isCompleted = normalized.isCompleted;
    customer.pipeline.completedAt = normalized.completedAt;

    await customer.save();

    const populated = await MaterialCustomer.findById(customer._id)
      .populate({ path: "createdBy", select: "_id name role" })
      .populate({
        path: "pipeline.source.materialId",
        select: "_id materialName brand",
      })
      .populate({
        path: "pipeline.followUp.assignedTo",
        select: "_id name role",
      });

    return res.status(200).json({
      success: true,
      message: "Material follow-up marked done",
      customer: populated,
    });
  } catch (error) {
    console.error("MARK MATERIAL FOLLOWUP DONE ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateMaterialCustomer = async (req, res) => {
  try {
    const parsed = parseAndValidateMaterialCustomerPayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const customer = await MaterialCustomer.findByIdAndUpdate(
      req.params.id,
      parsed.value,
      { new: true, runValidators: true }
    )
      .populate({ path: "createdBy", select: "_id name role" })
      .populate({
        path: "pipeline.source.materialId",
        select: "_id materialName brand",
      })
      .populate({
        path: "pipeline.followUp.assignedTo",
        select: "_id name role",
      });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Material customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Material customer updated successfully",
      customer,
    });
  } catch (error) {
    console.error("UPDATE MATERIAL CUSTOMER ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteMaterialCustomer = async (req, res) => {
  try {
    const customer = await MaterialCustomer.findByIdAndDelete(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Material customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Material customer deleted successfully",
    });
  } catch (error) {
    console.error("DELETE MATERIAL CUSTOMER ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateMaterial = async (req, res) => {
  try {
    const parsed = parseAndValidateMaterialPayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const material = await Material.findByIdAndUpdate(
      req.params.id,
      parsed.value,
      { new: true, runValidators: true }
    ).populate({ path: "createdBy", select: "_id name role" });

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Material not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Material updated successfully",
      material,
    });
  } catch (error) {
    console.error("UPDATE MATERIAL ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findByIdAndDelete(req.params.id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Material not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Material deleted successfully",
    });
  } catch (error) {
    console.error("DELETE MATERIAL ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
