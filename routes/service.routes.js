const express = require("express");
const serviceRouter = express.Router();

const auth = require("../middlewares/auth.middleware");
const allow = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");

const {
  createService,
  getAllServices,
  getSingleService,
  updateService,
  assignService,
  addPayment,
  uploadPhotos,
  deleteService,
} = require("../controllers/servicerequest.controller");

// ── CRUD
serviceRouter.post(  "/",     auth, allow("admin", "service", "sales"), createService);
serviceRouter.get(   "/",     auth, allow("admin", "service", "sales"), getAllServices);
serviceRouter.get(   "/:id",  auth, allow("admin", "service", "sales"), getSingleService);
serviceRouter.put(   "/:id",  auth, allow("admin", "service", "sales"), updateService);
serviceRouter.delete("/:id",  auth, allow("admin"),            deleteService);

// ── Step actions  (put BEFORE /:id to avoid conflict)
serviceRouter.put( "/:id/assign",  auth, allow("admin"),           assignService);
serviceRouter.post("/:id/payment", auth, allow("admin", "service", "sales"), addPayment);
serviceRouter.post(
  "/:id/photos",
  auth,
  allow("admin", "service", "sales"),
  upload("service/photos").fields([
    { name: "beforePhotos", maxCount: 10 },
    { name: "afterPhotos", maxCount: 10 },
    { name: "photos", maxCount: 10 },
  ]),
  uploadPhotos
);

module.exports = serviceRouter;