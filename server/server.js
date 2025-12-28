const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { db, initDatabase } = require('./config/database');
const { authenticateToken, authenticateUser, generateToken } = require('./middleware/auth');
const { 
    validateLogin, 
    validateEvent, 
    validateRFIDCard, 
    validateAttendance, 
    validateEventId,
    sanitizeRequestBody 
} = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware безопасности
// app.use(helmet({
//     contentSecurityPolicy: {
//         directives: {
//             defaultSrc: ["'self'"],
//             scriptSrc: ["'self'", "'unsafe-inline'"],
//             styleSrc: ["'self'", "'unsafe-inline'"],
//             imgSrc: ["'self'", "data:", "https:"],
//         },
//     },
//     crossOriginEmbedderPolicy: false
// }));

var DMap = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15, 16: 16, 17: 17, 18: 18, 19: 19, 20: 20, 21: 21, 22: 22, 23: 23, 24: 24, 25: 25, 26: 26, 27: 27, 28: 28, 29: 29, 30: 30, 31: 31, 32: 32, 33: 33, 34: 34, 35: 35, 36: 36, 37: 37, 38: 38, 39: 39, 40: 40, 41: 41, 42: 42, 43: 43, 44: 44, 45: 45, 46: 46, 47: 47, 48: 48, 49: 49, 50: 50, 51: 51, 52: 52, 53: 53, 54: 54, 55: 55, 56: 56, 57: 57, 58: 58, 59: 59, 60: 60, 61: 61, 62: 62, 63: 63, 64: 64, 65: 65, 66: 66, 67: 67, 68: 68, 69: 69, 70: 70, 71: 71, 72: 72, 73: 73, 74: 74, 75: 75, 76: 76, 77: 77, 78: 78, 79: 79, 80: 80, 81: 81, 82: 82, 83: 83, 84: 84, 85: 85, 86: 86, 87: 87, 88: 88, 89: 89, 90: 90, 91: 91, 92: 92, 93: 93, 94: 94, 95: 95, 96: 96, 97: 97, 98: 98, 99: 99, 100: 100, 101: 101, 102: 102, 103: 103, 104: 104, 105: 105, 106: 106, 107: 107, 108: 108, 109: 109, 110: 110, 111: 111, 112: 112, 113: 113, 114: 114, 115: 115, 116: 116, 117: 117, 118: 118, 119: 119, 120: 120, 121: 121, 122: 122, 123: 123, 124: 124, 125: 125, 126: 126, 127: 127, 1027: 129, 8225: 135, 1046: 198, 8222: 132, 1047: 199, 1168: 165, 1048: 200, 1113: 154, 1049: 201, 1045: 197, 1050: 202, 1028: 170, 160: 160, 1040: 192, 1051: 203, 164: 164, 166: 166, 167: 167, 169: 169, 171: 171, 172: 172, 173: 173, 174: 174, 1053: 205, 176: 176, 177: 177, 1114: 156, 181: 181, 182: 182, 183: 183, 8221: 148, 187: 187, 1029: 189, 1056: 208, 1057: 209, 1058: 210, 8364: 136, 1112: 188, 1115: 158, 1059: 211, 1060: 212, 1030: 178, 1061: 213, 1062: 214, 1063: 215, 1116: 157, 1064: 216, 1065: 217, 1031: 175, 1066: 218, 1067: 219, 1068: 220, 1069: 221, 1070: 222, 1032: 163, 8226: 149, 1071: 223, 1072: 224, 8482: 153, 1073: 225, 8240: 137, 1118: 162, 1074: 226, 1110: 179, 8230: 133, 1075: 227, 1033: 138, 1076: 228, 1077: 229, 8211: 150, 1078: 230, 1119: 159, 1079: 231, 1042: 194, 1080: 232, 1034: 140, 1025: 168, 1081: 233, 1082: 234, 8212: 151, 1083: 235, 1169: 180, 1084: 236, 1052: 204, 1085: 237, 1035: 142, 1086: 238, 1087: 239, 1088: 240, 1089: 241, 1090: 242, 1036: 141, 1041: 193, 1091: 243, 1092: 244, 8224: 134, 1093: 245, 8470: 185, 1094: 246, 1054: 206, 1095: 247, 1096: 248, 8249: 139, 1097: 249, 1098: 250, 1044: 196, 1099: 251, 1111: 191, 1055: 207, 1100: 252, 1038: 161, 8220: 147, 1101: 253, 8250: 155, 1102: 254, 8216: 145, 1103: 255, 1043: 195, 1105: 184, 1039: 143, 1026: 128, 1106: 144, 8218: 130, 1107: 131, 8217: 146, 1108: 186, 1109: 190}

function UnicodeToWin1251(s) {
    if (s == undefined) return s;
    var L = []
    for (var i=0; i<s.length; i++) {
        var ord = s.charCodeAt(i)
        if (!(ord in DMap))
            throw "Character "+s.charAt(i)+" isn't supported by win1251!"
        L.push(String.fromCharCode(DMap[ord]))
    }
    return L.join('')
}

function utf8_decode (aa) {
    if (!aa) return aa;
    var bb = '', c = 0;
    for (var i = 0; i < aa.length; i++) {
        c = aa.charCodeAt(i);
        if (c > 127) {
            if (c > 1024) {
                if (c == 1025) {
                    c = 1016;
                } else if (c == 1105) {
                    c = 1032;
                }
                bb += String.fromCharCode(c - 848);
            }
        } else {
            bb += aa.charAt(i);
        }
    }
    return bb;
}


app.use(helmet({
    contentSecurityPolicy: false, // Отключаем CSP для локальной разработки
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов за 15 минут
    message: {
        success: false,
        error: 'Слишком много запросов, попробуйте позже'
    }
});
app.use(limiter);

// Основное middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(sanitizeRequestBody);

// Глобальная обработка ошибок
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера'
    });
});

// API Routes

// Аутентификация
app.post('/api/login', validateLogin, async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`Login attempt for user: ${username}`);

        const user = await authenticateUser(username, password);
        
        if (user) {
            console.log(`Login successful for user: ${username}`);
            const token = generateToken(user);
            res.json({
                success: true,
                user: user,
                token: token
            });
        } else {
            console.log(`Login failed for user: ${username}`);
            res.status(401).json({
                success: false,
                error: 'Неверные учетные данные'
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка аутентификации'
        });
    }
});

// Начать мероприятие
app.post('/api/events/start', authenticateToken, validateEvent, (req, res) => {
    const { name, organizer } = req.body;

    // Сначала завершаем все активные мероприятия
    db.run(
        'UPDATE events SET end_time = CURRENT_TIMESTAMP, is_active = 0 WHERE is_active = 1',
        function(err) {
            if (err) {
                console.error('Error stopping previous events:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка завершения предыдущих мероприятий' 
                });
            }

            // Создаем новое мероприятие
            db.run(
                'INSERT INTO events (name, organizer) VALUES (?, ?)',
                [name, organizer],
                function(err) {
                    if (err) {
                        console.error('Error creating event:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Ошибка создания мероприятия' 
                        });
                    }
                    res.json({
                        success: true,
                        eventId: this.lastID,
                        message: `Мероприятие "${name}" начато`
                    });
                }
            );
        }
    );
});

// Завершить мероприятие
app.post('/api/events/:id/stop', authenticateToken, validateEventId, (req, res) => {
    const eventId = req.params.id;

    db.run(
        'UPDATE events SET end_time = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?',
        [eventId],
        function(err) {
            if (err) {
                console.error('Error stopping event:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка завершения мероприятия' 
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Мероприятие не найдено'
                });
            }

            res.json({
                success: true,
                message: 'Мероприятие завершено'
            });
        }
    );
});

// Получить активное мероприятие
app.get('/api/events/active', authenticateToken, (req, res) => {
    db.get(
        'SELECT * FROM events WHERE is_active = 1 ORDER BY start_time DESC LIMIT 1',
        (err, row) => {
            if (err) {
                console.error('Error getting active event:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка получения активного мероприятия' 
                });
            }
            res.json({ event: row });
        }
    );
});

// Запись посещения
app.post('/api/attendance', authenticateToken, validateAttendance, (req, res) => {
    const { rfid_uid, event_id } = req.body;
    const timestamp = new Date().toISOString();

    // Проверяем, зарегистрирована ли карта
    db.get(
        'SELECT student_name FROM registered_cards WHERE rfid_uid = ?',
        [rfid_uid],
        (err, card) => {
            if (err) {
                console.error('Error checking card:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка проверки карты' 
                });
            }

            const studentName = card ? card.student_name : 'Неизвестный студент';

            // Записываем посещение
            db.run(
                'INSERT INTO attendance (rfid_uid, student_name, event_id, timestamp) VALUES (?, ?, ?, ?)',
                [rfid_uid, studentName, event_id, timestamp],
                function(err) {
                    if (err) {
                        console.error('Error recording attendance:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Ошибка записи посещения' 
                        });
                    }
                    res.json({
                        success: true,
                        recordId: this.lastID,
                        studentName: studentName,
                        timestamp: timestamp,
                        message: `Записан: ${studentName}`
                    });
                }
            );
        }
    );
});

// Регистрация новой RFID карты
app.post('/api/cards/register', authenticateToken, validateRFIDCard, (req, res) => {
    const { rfid_uid, student_name, student_class } = req.body;

    db.run(
        'INSERT OR REPLACE INTO registered_cards (rfid_uid, student_name, student_class) VALUES (?, ?, ?)',
        [rfid_uid, student_name, student_class],
        function(err) {
            if (err) {
                console.error('Error registering card:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка регистрации карты' 
                });
            }
            res.json({
                success: true,
                message: `Карта зарегистрирована для: ${student_name}`
            });
        }
    );
});

// Получить журнал посещений для мероприятия
app.get('/api/events/:id/attendance', authenticateToken, validateEventId, (req, res) => {
    const eventId = req.params.id;

    db.all(
        `SELECT a.*, rc.student_class 
         FROM attendance a 
         LEFT JOIN registered_cards rc ON a.rfid_uid = rc.rfid_uid 
         WHERE a.event_id = ? 
         ORDER BY a.timestamp DESC`,
        [eventId],
        (err, rows) => {
            if (err) {
                console.error('Error getting attendance:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка получения журнала посещений' 
                });
            }
            res.json({ attendance: rows });
        }
    );
});

// Экспорт данных в CSV
// app.get('/api/events/id/export', authenticateToken, validateEventId, (req, res) => {
// app.get('/api/events/id/export', authenticateToken, (req, res) => {
app.get('/api/events/id/export', authenticateToken, (req, res, next) => {next()}, (req, res) => {
    // const eventId = req.params.id;
    const eventId = 1;

    // `SELECT e.name as event_name, a.rfid_uid, a.student_name, 
    //         rc.student_class, a.timestamp 
    //  FROM attendance a 
    //  JOIN events e ON a.event_id = e.id 
    //  LEFT JOIN registered_cards rc ON a.rfid_uid = rc.rfid_uid 
    //  WHERE a.event_id = ? 
    //  ORDER BY a.timestamp`,
    
    db.all(
        `SELECT e.name as event_name, a.rfid_uid, a.student_name, 
                rc.student_class, a.timestamp 
         FROM attendance a 
         JOIN events e ON a.event_id = e.id 
         LEFT JOIN registered_cards rc ON a.rfid_uid = rc.rfid_uid 
         ORDER BY a.timestamp`,
        // [eventId],
        [],
        (err, rows) => {
            if (err) {
                console.error('Error exporting data:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка экспорта данных' 
                });
            }

            let csv = utf8_decode('Мероприятие;RFID UID;ФИО студента;Класс;Время посещения\n');
            rows.forEach(row => {
                csv += `"${utf8_decode(row.event_name)}";"${row.rfid_uid}";"${utf8_decode(row.student_name)}";"${utf8_decode(row.student_class) || ''}";"${row.timestamp}"\n`;
            });

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=event_${eventId}_attendance.csv`);
            res.send(csv);
        }
    );
});

// Получить список зарегистрированных карт
app.get('/api/cards', authenticateToken, (req, res) => {
    db.all(
        'SELECT * FROM registered_cards ORDER BY student_name',
        (err, rows) => {
            if (err) {
                console.error('Error getting cards:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка получения списка карт' 
                });
            }
            res.json({ cards: rows });
        }
    );
});

// Статистика
app.get('/api/stats', authenticateToken, (req, res) => {
    const queries = {
        totalEvents: 'SELECT COUNT(*) as count FROM events',
        totalRecords: 'SELECT COUNT(*) as count FROM attendance',
        totalCards: 'SELECT COUNT(*) as count FROM registered_cards'
    };

    const results = {};

    db.get(queries.totalEvents, (err, row) => {
        if (err) {
            console.error('Error getting stats:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Ошибка получения статистики' 
            });
        }
        results.totalEvents = row.count;

        db.get(queries.totalRecords, (err, row) => {
            if (err) {
                console.error('Error getting stats:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка получения статистики' 
                });
            }
            results.totalRecords = row.count;

            db.get(queries.totalCards, (err, row) => {
                if (err) {
                    console.error('Error getting stats:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Ошибка получения статистики' 
                    });
                }
                results.totalCards = row.count;

                res.json(results);
            });
        });
    });
});

// Запуск сервера
const startServer = async () => {
    try {
        await initDatabase();
        
        app.listen(PORT, HOST, () => {
            console.log(`🚀 Сервер запущен на порту ${PORT}`);
            console.log(`📊 Откройте в браузере: http://${HOST}:${PORT}`);
            console.log(`🔑 Тестовый пользователь: test / password`);
            console.log(`🔒 Режим безопасности: ВКЛЮЧЕН`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Запускаем сервер
startServer();
