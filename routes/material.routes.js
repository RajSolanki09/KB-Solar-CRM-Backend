const express = require("express");
const materialRouter = express.Router();

const auth = require("../middlewares/auth.middleware");
const allow = require("../middlewares/role.middleware");
const {
  getSalesPeopleForMaterialPipeline,
  getMaterialFormSchema,
  getMaterialCustomerFormSchema,
  createMaterial,
  getAllMaterials,
  createMaterialCustomer,
  getAllMaterialCustomers,
  getMaterialCustomerById,
  updateMaterialCustomerPipeline,
  markMaterialCustomerFollowUpDone,
  updateMaterialCustomer,
  deleteMaterialCustomer,
  updateMaterial,
  deleteMaterial,
} = require("../controllers/material.controller");

materialRouter.get("/schema", auth, allow("admin", "service", "sales"), getMaterialFormSchema);
materialRouter.get("/customer/schema", auth, allow("admin", "service", "sales"), getMaterialCustomerFormSchema);
materialRouter.get("/sales-staff", auth, allow("admin", "service", "sales"), getSalesPeopleForMaterialPipeline);
materialRouter.get("/", auth, allow("admin", "service", "sales"), getAllMaterials);
materialRouter.get("/customer", auth, allow("admin", "service", "sales"), getAllMaterialCustomers);
materialRouter.get("/customer/:id", auth, allow("admin", "service", "sales"), getMaterialCustomerById);
materialRouter.post("/", auth, allow("admin", "sales"), createMaterial);
materialRouter.post("/customer", auth, allow("admin", "service", "sales"), createMaterialCustomer);
materialRouter.put("/customer/:id", auth, allow("admin", "service", "sales"), updateMaterialCustomer);
materialRouter.put("/customer/:id/pipeline", auth, allow("admin", "service", "sales"), updateMaterialCustomerPipeline);
materialRouter.put("/customer/:id/followup-done", auth, allow("admin", "service", "sales"), markMaterialCustomerFollowUpDone);
materialRouter.delete("/customer/:id", auth, allow("admin", "service", "sales"), deleteMaterialCustomer);
materialRouter.put("/:id", auth, allow("admin", "sales"), updateMaterial);
materialRouter.delete("/:id", auth, allow("admin", "sales"), deleteMaterial);

module.exports = materialRouter;
