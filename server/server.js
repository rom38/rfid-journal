const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Инициализация базы данных
const dbPath = path.join(__dirname, 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Создание таблиц
db.serialize(() => {
    // Таблица мероприятий
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        organizer TEXT NOT NULL,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        is_active BOOLEAN DEFAULT 1
    )`);

    // Таблица посещений
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rfid_uid TEXT NOT NULL,
        student_name TEXT,
        event_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(event_id) REFERENCES events(id)
    )`);

    // Таблица пользователей (учителей/организаторов)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL
    )`);

    // Таблица зарегистрированных карт
    db.run(`CREATE TABLE IF NOT EXISTS registered_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rfid_uid TEXT UNIQUE NOT NULL,
        student_name TEXT NOT NULL,
        student_class TEXT,
        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Добавляем тестового пользователя
    db.run(`INSERT OR IGNORE INTO users (username, password_hash, full_name) 
            VALUES (?, ?, ?)`, 
            ['test', 'password', 'TestProfile']);
    // Тестовые RFID карты
    db.run(`INSERT OR IGNORE INTO registered_cards (rfid_uid, student_name, student_class) 
            VALUES (?, ?, ?)`, 
            ['A1B2C3D4', 'Петров Иван', '10А']);
    db.run(`INSERT OR IGNORE INTO registered_cards (rfid_uid, student_name, student_class) 
            VALUES (?, ?, ?)`, 
            ['D4C3B2A1', 'Сидорова Анна', '10Б']);
});

// API Routes

// Аутентификация
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get(
        'SELECT * FROM users WHERE username = ? AND password_hash = ?',
        [username, password],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (row) {
                res.json({
                    success: true,
                    user: {
                        id: row.id,
                        username: row.username,
                        fullName: row.full_name
                    }
                });
            } else {
                res.status(401).json({
                    success: false,
                    error: 'Неверные учетные данные'
                });
            }
        }
    );
});

// Начать мероприятие
app.post('/api/events/start', (req, res) => {
    const { name, organizer } = req.body;

    // Сначала завершаем все активные мероприятия
    db.run(
        'UPDATE events SET end_time = CURRENT_TIMESTAMP, is_active = 0 WHERE is_active = 1',
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Создаем новое мероприятие
            db.run(
                'INSERT INTO events (name, organizer) VALUES (?, ?)',
                [name, organizer],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
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
app.post('/api/events/:id/stop', (req, res) => {
    const eventId = req.params.id;

    db.run(
        'UPDATE events SET end_time = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?',
        [eventId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                message: 'Мероприятие завершено'
            });
        }
    );
});

// Получить активное мероприятие
app.get('/api/events/active', (req, res) => {
    db.get(
        'SELECT * FROM events WHERE is_active = 1 ORDER BY start_time DESC LIMIT 1',
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ event: row });
        }
    );
});

// Запись посещения
app.post('/api/attendance', (req, res) => {
    const { rfid_uid, event_id } = req.body;
    const timestamp = new Date().toISOString();

    // Проверяем, зарегистрирована ли карта
    db.get(
        'SELECT student_name FROM registered_cards WHERE rfid_uid = ?',
        [rfid_uid],
        (err, card) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const studentName = card ? card.student_name : 'Неизвестный студент';

            // Записываем посещение
            db.run(
                'INSERT INTO attendance (rfid_uid, student_name, event_id, timestamp) VALUES (?, ?, ?, ?)',
                [rfid_uid, studentName, event_id, timestamp],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
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
app.post('/api/cards/register', (req, res) => {
    const { rfid_uid, student_name, student_class } = req.body;

    db.run(
        'INSERT OR REPLACE INTO registered_cards (rfid_uid, student_name, student_class) VALUES (?, ?, ?)',
        [rfid_uid, student_name, student_class],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                message: `Карта зарегистрирована для: ${student_name}`
            });
        }
    );
});

// Получить журнал посещений для мероприятия
app.get('/api/events/:id/attendance', (req, res) => {
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
                return res.status(500).json({ error: err.message });
            }
            res.json({ attendance: rows });
        }
    );
});

// Экспорт данных в CSV
app.get('/api/events/:id/export', (req, res) => {
    const eventId = req.params.id;

    db.all(
        `SELECT e.name as event_name, a.rfid_uid, a.student_name, 
                rc.student_class, a.timestamp 
         FROM attendance a 
         JOIN events e ON a.event_id = e.id 
         LEFT JOIN registered_cards rc ON a.rfid_uid = rc.rfid_uid 
         WHERE a.event_id = ? 
         ORDER BY a.timestamp`,
        [eventId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
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
app.get('/api/cards', (req, res) => {
    db.all(
        'SELECT * FROM registered_cards ORDER BY student_name',
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ cards: rows });
        }
    );
});

// Статистика
app.get('/api/stats', (req, res) => {
    const queries = {
        totalEvents: 'SELECT COUNT(*) as count FROM events',
        totalRecords: 'SELECT COUNT(*) as count FROM attendance',
        totalCards: 'SELECT COUNT(*) as count FROM registered_cards',
        recentActivity: `SELECT a.*, e.name as event_name 
                        FROM attendance a 
                        JOIN events e ON a.event_id = e.id 
                        ORDER BY a.timestamp DESC 
                        LIMIT 10`
    };

    const results = {};

    db.get(queries.totalEvents, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        results.totalEvents = row.count;

        db.get(queries.totalRecords, (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            results.totalRecords = row.count;

            db.get(queries.totalCards, (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                results.totalCards = row.count;

                db.all(queries.recentActivity, (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });
                    results.recentActivity = rows;

                    res.json(results);
                });
            });
        });
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Откройте в браузере: http://localhost:${PORT}`);
    console.log(`🔑 Тестовый пользователь: test / password`);
});