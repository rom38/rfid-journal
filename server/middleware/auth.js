const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware для проверки JWT токена
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Требуется аутентификация' 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                error: 'Недействительный токен' 
            });
        }
        req.user = user;
        next();
    });
};

// Middleware для проверки ролей (если понадобится в будущем)
const requireRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ 
                success: false, 
                error: 'Недостаточно прав' 
            });
        }
        next();
    };
};

// Функция для аутентификации пользователя
const authenticateUser = async (username, password) => {
    return new Promise((resolve, reject) => {
        console.log(`Attempting to authenticate user: ${username}`);
        console.log(`Password provided: ${password}`);
        
        db.get(
            'SELECT * FROM users WHERE username = ?',
            [username],
            async (err, user) => {
                if (err) {
                    console.error('Database error during authentication:', err);
                    reject(err);
                    return;
                }

                if (!user) {
                    console.log(`User not found: ${username}`);
                    resolve(null);
                    return;
                }

                console.log(`User found: ${user.username}`);
                console.log(`Stored password hash: ${user.password_hash}`);
                console.log(`Checking password...`);

                try {
                    const isValidPassword = await bcrypt.compare(password, user.password_hash);
                    console.log(`Password valid: ${isValidPassword}`);
                    
                    if (isValidPassword) {
                        console.log(`Authentication successful for user: ${username}`);
                        resolve({
                            id: user.id,
                            username: user.username,
                            fullName: user.full_name
                        });
                    } else {
                        console.log(`Invalid password for user: ${username}`);
                        console.log(`Expected password: 'password'`);
                        resolve(null);
                    }
                } catch (error) {
                    console.error('Password comparison error:', error);
                    reject(error);
                }
            }
        );
    });
};

// Генерация JWT токена
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            username: user.username,
            fullName: user.fullName
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

module.exports = {
    authenticateToken,
    requireRole,
    authenticateUser,
    generateToken,
    JWT_SECRET
};
