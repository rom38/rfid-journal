const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        return;
    }
    console.log('Connected to SQLite database');
});

// Проверяем пользователей
db.all('SELECT id, username, full_name FROM users', (err, rows) => {
    if (err) {
        console.error('Error querying users:', err.message);
        return;
    }
    console.log('\n=== USERS TABLE ===');
    if (rows.length === 0) {
        console.log('No users found in database');
    } else {
        rows.forEach(row => {
            console.log(`ID: ${row.id}, Username: ${row.username}, Full Name: ${row.full_name}`);
        });
    }
    
    db.close();
});
