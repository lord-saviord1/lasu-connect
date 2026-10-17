const jwt = require('jsonwebtoken');
const User = require('../models/User');

// For PUBLIC routes that can personalise for a signed-in viewer (e.g. "you
// upvoted this"). Never rejects: a missing, invalid or expired token simply
// means the viewer is treated as anonymous.
module.exports = async function optionalAuth(req, res, next) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user && user.isVerified) req.user = user;
    } catch (e) { /* anonymous */ }
  }
  next();
};
