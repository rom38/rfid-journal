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

            let csv = 'Мероприятие;RFID UID;ФИО студента;Класс;Время посещения\n';
            rows.forEach(row => {
                csv += `"${row.event_name}";"${row.rfid_uid}";"${row.student_name}";"${row.student_class || ''}";"${row.timestamp}"\n`;
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
