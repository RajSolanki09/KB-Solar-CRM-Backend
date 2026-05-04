const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // Convert to lowercase for case-insensitive comparison
    const userRole = req.user.role.toLowerCase();
    const allowedRoles = roles.map(r => r.toLowerCase());

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: `Access denied. Role ${req.user.role} not allowed`,
      });
    }

    next();
  };
};

module.exports = authorizeRoles;
