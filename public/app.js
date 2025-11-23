let currentUser = null;
let currentEvent = null;
let bluetoothDevice = null;

// Аутентификация
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (result.success) {
            currentUser = result.user;
            document.getElementById('userName').textContent = currentUser.fullName;
            document.getElementById('authSection').classList.add('hidden');
            document.getElementById('mainSection').classList.remove('hidden');
            
            loadStats();
            checkActiveEvent();
        } else {
            alert('Ошибка входа: ' + result.error);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Управление мероприятиями
async function startEvent() {
    const eventName = prompt('Введите название мероприятия:');
    if (!eventName) return;

    try {
        const response = await fetch('/api/events/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: eventName,
                organizer: currentUser.fullName
            })
        });

        const result = await response.json();

        if (result.success) {
            currentEvent = { id: result.eventId, name: eventName };
            updateEventStatus(`Активно: ${eventName}`, 'status-scanning');
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            addToLog(`🎬 Мероприятие начато: "${eventName}"`);
        }
    } catch (error) {
        console.error('Error starting event:', error);
        alert('Ошибка начала мероприятия');
    }
}

async function stopEvent() {
    if (!currentEvent) return;

    try {
        const response = await fetch(`/api/events/${currentEvent.id}/stop`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            updateEventStatus('Не активно', 'status-disconnected');
            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            addToLog('⏹ Мероприятие завершено');
            currentEvent = null;
        }
    } catch (error) {
        console.error('Error stopping event:', error);
    }
}

async function checkActiveEvent() {
    try {
        const response = await fetch('/api/events/active');
        const result = await response.json();

        if (result.event) {
            currentEvent = result.event;
            updateEventStatus(`Активно: ${currentEvent.name}`, 'status-scanning');
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
        }
    } catch (error) {
        console.error('Error checking active event:', error);
    }
}

// BLE подключение (упрощенная версия)
async function connectScanner() {
    try {
        updateScannerStatus('Сканер подключен (эмуляция)', 'status-connected');
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('connectBtn').textContent = 'BLE подключен';
        
        // Симуляция BLE ввода
        setupTestInput();
        
    } catch (error) {
        console.error('Bluetooth error:', error);
        updateScannerStatus('Ошибка подключения BLE', 'status-disconnected');
    }
}

// Обработка RFID данных
async function handleRFIDScan(rfidUid) {
    if (!currentEvent) {
        addToLog('❌ Нет активного мероприятия');
        return;
    }

    try {
        const response = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rfid_uid: rfidUid,
                event_id: currentEvent.id
            })
        });

        const result = await response.json();

        if (result.success) {
            addToLog(`✅ ${result.studentName} - ${new Date().toLocaleTimeString()}`);
        } else {
            addToLog(`❌ Ошибка записи: ${rfidUid}`);
        }
    } catch (error) {
        console.error('Error recording attendance:', error);
        addToLog('❌ Ошибка связи с сервером');
    }
}

// Регистрация карт
async function registerCard() {
    const uid = document.getElementById('cardUid').value;
    const name = document.getElementById('studentName').value;
    const studentClass = document.getElementById('studentClass').value;

    if (!uid || !name) {
        alert('Заполните UID и ФИО студента');
        return;
    }

    try {
        const response = await fetch('/api/cards/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rfid_uid: uid,
                student_name: name,
                student_class: studentClass
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('Карта успешно зарегистрирована!');
            document.getElementById('cardUid').value = '';
            document.getElementById('studentName').value = '';
            document.getElementById('studentClass').value = '';
            loadStats();
        }
    } catch (error) {
        console.error('Error registering card:', error);
        alert('Ошибка регистрации карты');
    }
}

// Вспомогательные функции
function updateEventStatus(message, cssClass) {
    const status = document.getElementById('eventStatus');
    status.textContent = message;
    status.className = `status ${cssClass}`;
}

function updateScannerStatus(message, cssClass) {
    const status = document.getElementById('scannerStatus');
    status.textContent = message;
    status.className = `status ${cssClass}`;
}

function addToLog(message) {
    const log = document.getElementById('eventLog');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = message;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

async function loadAttendance() {
    if (!currentEvent) return;

    try {
        const response = await fetch(`/api/events/${currentEvent.id}/attendance`);
        const result = await response.json();

        const log = document.getElementById('eventLog');
        log.innerHTML = '';

        result.attendance.forEach(record => {
            addToLog(`${record.student_name} - ${new Date(record.timestamp).toLocaleString()}`);
        });
    } catch (error) {
        console.error('Error loading attendance:', error);
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const result = await response.json();

        document.getElementById('statsEvents').textContent = result.totalEvents;
        document.getElementById('statsRecords').textContent = result.totalRecords;
        document.getElementById('statsCards').textContent = result.totalCards;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function exportData() {
    if (!currentEvent) {
        alert('Нет активного мероприятия для экспорта');
        return;
    }

    window.open(`/api/events/${currentEvent.id}/export`, '_blank');
}

// Тестовые функции (для работы без BLE)
function setupTestInput() {
    document.getElementById('testRfidInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            simulateRFID();
        }
    });
}

function simulateRFID() {
    const testUid = document.getElementById('testRfidInput').value.trim();
    if (testUid) {
        handleRFIDScan(testUid);
        document.getElementById('testRfidInput').value = '';
    }
}

// Генерация тестовых RFID UID
function generateTestUID() {
    return Math.random().toString(16).substr(2, 8).toUpperCase();
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    // Автозаполнение тестового UID
    document.getElementById('cardUid').value = generateTestUID();
    document.getElementById('testRfidInput').value = generateTestUID();
});