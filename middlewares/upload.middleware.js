const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

/**
 * Dynamic upload middleware
 * Usage:  upload("solar/visit").array("photos", 10)
 *         upload("profiles").single("image")
 */
const upload = (folder = "general") => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join("uploads", folder);
      fs.mkdirSync(dir, { recursive: true }); // auto-create folder
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, unique + path.extname(file.originalname));
    },
  });

  const fileFilter = (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only images and PDFs are allowed"), false);
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });
};

module.exports = upload;