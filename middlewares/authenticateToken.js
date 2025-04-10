const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
    const token = req.cookies.token || req.header("Authorization")?.split(" ")[1];

    if (!token) {
        return res.redirect("/login");
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.redirect("/login");
        }
        req.user = user;
        next();
    });
}

function authorizeAdmin(req, res, next) {
    if (req.user?.role === 0) {
        return next();
    }
    return res.status(403).json({ message: "Bạn không có quyền truy cập" });
}

module.exports = { authenticateToken, authorizeAdmin };
