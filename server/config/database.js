const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '../database', 'attendance.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Инициализация базы данных
const initDatabase = async () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Таблица мероприятий
            db.run(`CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                organizer TEXT NOT NULL,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                is_active BOOLEAN DEFAULT 1,
                CHECK(LENGTH(name) > 0 AND LENGTH(name) <= 255)
            )`);

            // Таблица посещений
            db.run(`CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rfid_uid TEXT NOT NULL,
                student_name TEXT,
                event_id INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(event_id) REFERENCES events(id),
                CHECK(LENGTH(rfid_uid) > 0 AND LENGTH(rfid_uid) <= 50)
            )`);

            // Таблица пользователей (учителей/организаторов)
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CHECK(LENGTH(username) > 0 AND LENGTH(username) <= 50),
                CHECK(LENGTH(full_name) > 0 AND LENGTH(full_name) <= 100)
            )`);

            // Таблица зарегистрированных карт
            db.run(`CREATE TABLE IF NOT EXISTS registered_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rfid_uid TEXT UNIQUE NOT NULL,
                student_name TEXT NOT NULL,
                student_class TEXT,
                registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                CHECK(LENGTH(rfid_uid) > 0 AND LENGTH(rfid_uid) <= 50),
                CHECK(LENGTH(student_name) > 0 AND LENGTH(student_name) <= 100),
                CHECK(LENGTH(student_class) <= 20)
            )`);

            // Создание индексов для оптимизации
            db.run('CREATE INDEX IF NOT EXISTS idx_attendance_event_id ON attendance(event_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_attendance_rfid_uid ON attendance(rfid_uid)');
            db.run('CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active)');
            db.run('CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time)');

            // Добавляем тестового пользователя (с хешированным паролем)
            const createTestUser = async () => {
                const hashedPassword = await bcrypt.hash('password', 10);
                db.run(`INSERT OR IGNORE INTO users (username, password_hash, full_name) 
                        VALUES (?, ?, ?)`, 
                        ['test', hashedPassword, 'TestProfile']);
                
                // Тестовые RFID карты
                db.run(`INSERT OR IGNORE INTO registered_cards (rfid_uid, student_name, student_class) 
                        VALUES (?, ?, ?)`, 
                        ['A1B2C3D4', 'Петров Иван', '10А']);
                db.run(`INSERT OR IGNORE INTO registered_cards (rfid_uid, student_name, student_class) 
                        VALUES (?, ?, ?)`, 
                        ['D4C3B2A1', 'Сидорова Анна', '10Б']);
            };

            createTestUser().then(resolve).catch(reject);
        });
    });
};

module.exports = { db, initDatabase };