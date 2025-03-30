const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
    const token = req.cookies.token || req.header("Authorization")?.split(" ")[1];

    if (!token) {
        return res.redirect("/login"); // Chuyển hướng nếu không có token
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.redirect("/login"); // Chuyển hướng nếu token sai hoặc hết hạn
        }
        req.user = user; // Gán thông tin user vào request
        next();
    });
}

function authorizeAdmin(req, res, next) {
    if (req.user?.role === 0) {
        return next(); // Nếu là admin, tiếp tục
    }
    return res.status(403).json({ message: "Bạn không có quyền truy cập" }); // Không phải admin thì chặn
}

module.exports = { authenticateToken, authorizeAdmin };
