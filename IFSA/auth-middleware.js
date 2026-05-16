// ============================================================
//  IFSA AUTH MIDDLEWARE — Phase 3
//  Verifies student JWT from httpOnly cookie or Authorization header.
//  Usage in server.js:
//    const { verifyStudentToken } = require('./auth-middleware');
//    app.get('/api/student/me', verifyStudentToken, (req, res) => { ... });
// ============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET         = process.env.JWT_SECRET || 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_IN_PRODUCTION';
const STUDENT_JWT_SECRET = process.env.STUDENT_JWT_SECRET || JWT_SECRET + '_student';

/**
 * Middleware: verifies the student session cookie (ifsa_student_token).
 * On success, attaches req.student = { id, name, email, batchId, locationId, role:'student' }.
 */
function verifyStudentToken(req, res, next) {
    // Try cookie first (set by /api/student/login), then Authorization header fallback
    let token = null;

    if (req.headers.cookie) {
        const match = req.headers.cookie.match(/ifsa_student_token=([^;]+)/);
        if (match) token = match[1];
    }
    if (!token) {
        const auth = req.headers['authorization'];
        if (auth && auth.startsWith('Bearer ')) token = auth.slice(7);
    }

    if (!token) {
        return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }

    jwt.verify(token, STUDENT_JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Session expired. Please log in again.' });
        }
        req.student = decoded;
        next();
    });
}

module.exports = { verifyStudentToken, STUDENT_JWT_SECRET };
