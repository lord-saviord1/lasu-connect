// Middleware that rejects any request where the email field
// is not a valid @lasu.edu.ng address — used on register route
const validateLasuMail = (req, res, next) => {
  const { email } = req.body;
  if (!email || !email.toLowerCase().trim().endsWith('@st.lasu.edu.ng')) {
    return res.status(400).json({
      success: false,
      message: 'Registration requires an official LASU Mail address (@lasu.edu.ng).'
    });
  }
  next();
};

module.exports = validateLasuMail;
