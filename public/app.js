/**
 * RFID Журнал посещений - Веб-приложение
 * 
 * Основные функции:
 * 1. Аутентификация пользователей
 * 2. Управление мероприятиями (начало/завершение)
 * 3. Подключение к Bluetooth RFID сканеру через Web Bluetooth API
 * 4. Обработка RFID меток и запись посещений
 * 5. Регистрация новых RFID карт
 * 
 * Web Bluetooth API интеграция:
 * - Использует стандартные UUID сервиса (0xFFE0) и характеристики (0xFFE1)
 * - Поддерживает автоматическое подключение к устройствам с именем "ESP32-RFID"
 * - Обрабатывает уведомления о новых RFID данных
 * - Предоставляет функцию getRFID() для программного получения RFID меток
 */

let currentUser = null;
let currentEvent = null;
let bluetoothDevice = null;
let authToken = null;

// Web Bluetooth API переменные
let bluetoothServer = null;
let bluetoothService = null;
let bluetoothCharacteristic = null;
let isBluetoothConnected = false;
let lastRFIDUID = '';
const BLUETOOTH_SERVICE_UUID = 0xFFE0; // Стандартный сервис для данных
const BLUETOOTH_CHARACTERISTIC_UUID = 0xFFE1; // Стандартная характеристика для данных

// Функция для получения заголовков с авторизацией
function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
}

// Аутентификация
async function login() {
    console.log('Login function called');
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    console.log('Username:', username, 'Password:', password);

    try {
        console.log('Sending login request...');
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Login result:', result);

        if (result.success) {
            console.log('Login successful');
            currentUser = result.user;
            authToken = result.token;
            document.getElementById('userName').textContent = currentUser.fullName;
            document.getElementById('authSection').classList.add('hidden');
            document.getElementById('mainSection').classList.remove('hidden');
            
            loadStats();
            checkActiveEvent();
        } else {
            console.log('Login failed:', result.error);
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
            headers: getAuthHeaders(),
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
        } else {
            alert('Ошибка начала мероприятия: ' + result.error);
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
            method: 'POST',
            headers: getAuthHeaders()
        });

        const result = await response.json();

        if (result.success) {
            updateEventStatus('Не активно', 'status-disconnected');
            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            addToLog('⏹ Мероприятие завершено');
            currentEvent = null;
        } else {
            alert('Ошибка завершения мероприятия: ' + result.error);
        }
    } catch (error) {
        console.error('Error stopping event:', error);
        alert('Ошибка завершения мероприятия');
    }
}

async function checkActiveEvent() {
    try {
        const response = await fetch('/api/events/active', {
            headers: getAuthHeaders()
        });
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

// Web Bluetooth API подключение
async function connectScanner() {
    try {
        if (!navigator.bluetooth) {
            updateScannerStatus('Web Bluetooth не поддерживается', 'status-disconnected');
            alert('Ваш браузер не поддерживает Web Bluetooth API. Используйте Chrome, Edge или Opera.');
            return;
        }

        updateScannerStatus('Поиск устройств...', 'status-connecting');
        
        // Запрашиваем устройство с фильтром по имени (можно настроить под ваше устройство)
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'ESP32-RFID' }], // Имя вашего Bluetooth устройства
            optionalServices: [BLUETOOTH_SERVICE_UUID]
        });

        updateScannerStatus('Подключение...', 'status-connecting');
        addToLog('🔍 Устройство выбрано: ' + (bluetoothDevice.name || 'Unknown'));
        
        // Подключаемся к GATT серверу с таймаутом
        const connectPromise = bluetoothDevice.gatt.connect();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Таймаут подключения (15 сек)')), 15000)
        );

        bluetoothServer = await Promise.race([connectPromise, timeoutPromise]);
        addToLog('✅ Подключено к GATT серверу');
        
        // Получаем сервис
        bluetoothService = await bluetoothServer.getPrimaryService(BLUETOOTH_SERVICE_UUID);
        addToLog('✅ Найден сервис RFID');
        
        // Получаем характеристику
        bluetoothCharacteristic = await bluetoothService.getCharacteristic(BLUETOOTH_CHARACTERISTIC_UUID);
        addToLog('✅ Найдена характеристика RFID');
        
        // Включаем уведомления
        await bluetoothCharacteristic.startNotifications();
        bluetoothCharacteristic.addEventListener('characteristicvaluechanged', 
            (event) => handleBluetoothData(event));
        addToLog('✅ Уведомления включены');
        
        isBluetoothConnected = true;
        updateScannerStatus(`Подключено: ${bluetoothDevice.name || 'Unknown'}`, 'status-connected');
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('connectBtn').textContent = 'BLE подключен';
        document.getElementById('disconnectBtn').disabled = false;
        
        // Обработка отключения
        bluetoothDevice.addEventListener('gattserverdisconnected', () => {
            handleBluetoothDisconnection();
        });
        
        addToLog('✅ Готов к приему RFID данных');
        
    } catch (error) {
        console.error('Bluetooth error:', error);
        updateScannerStatus(`Ошибка: ${error.message}`, 'status-disconnected');
        addToLog(`❌ Ошибка подключения: ${error.message}`);
        resetBluetoothConnection();
    }
}

// Обработка данных от Bluetooth устройства
function handleBluetoothData(event) {
    try {
        const value = event.target.value;
        if (!value || value.byteLength === 0) return;

        // Декодируем данные как текст
        const decoder = new TextDecoder();
        const data = decoder.decode(value).trim();

        // Фильтруем ненужные данные (повторы)
        if (!data || data === lastRFIDUID) {
            return;
        }

        // Обновляем только если это новые данные
        lastRFIDUID = data;
        addToLog(`📱 RFID метка: ${data}`);
        
        // Автоматически обрабатываем сканирование
        handleRFIDScan(data);
        
        // Визуальная обратная связь
        triggerScanAnimation();
        
    } catch (error) {
        console.error('Error processing Bluetooth data:', error);
        addToLog(`❌ Ошибка обработки данных: ${error.message}`);
    }
}

// Обработка отключения Bluetooth
function handleBluetoothDisconnection() {
    addToLog('🔌 Отключено от Bluetooth устройства');
    updateScannerStatus('Не подключено', 'status-disconnected');
    resetBluetoothConnection();
}

// Сброс Bluetooth подключения
function resetBluetoothConnection() {
    isBluetoothConnected = false;
    bluetoothDevice = null;
    bluetoothServer = null;
    bluetoothService = null;
    bluetoothCharacteristic = null;
    lastRFIDUID = '';
    
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Подключить BLE';
    }
    
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (disconnectBtn) {
        disconnectBtn.disabled = true;
    }
    
    updateScannerStatus('Не подключено', 'status-disconnected');
}

/**
 * Функция getRFID() - основная функция для получения RFID данных через Web Bluetooth API
 * 
 * @returns {Promise<string|null>} Promise, который разрешается с UID RFID метки или null в случае ошибки/таймаута
 * 
 * Алгоритм работы:
 * 1. Проверяет подключено ли Bluetooth устройство
 * 2. Если есть последний полученный UID, возвращает его и сбрасывает
 * 3. Если нет данных, ожидает новое уведомление от характеристики Bluetooth
 * 4. Использует таймаут 5 секунд для ожидания данных
 * 5. Обрабатывает ошибки декодирования и сетевые ошибки
 * 
 * Использование:
 * const rfidUid = await getRFID();
 * if (rfidUid) {
 *     console.log('Получен RFID:', rfidUid);
 *     handleRFIDScan(rfidUid);
 * }
 */
async function getRFID() {
    if (!isBluetoothConnected) {
        addToLog('❌ Bluetooth не подключен. Сначала подключите устройство.');
        updateScannerStatus('Не подключено', 'status-disconnected');
        return null;
    }
    
    try {
        // Если есть последний UID, возвращаем его
        if (lastRFIDUID) {
            const uid = lastRFIDUID;
            lastRFIDUID = ''; // Сбрасываем после получения
            addToLog(`📱 getRFID() вернул сохраненный UID: ${uid}`);
            return uid;
        }
        
        // Если нет данных, ждем новое уведомление
        addToLog('⏳ getRFID() ожидает данные от Bluetooth устройства...');
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                addToLog('⏰ getRFID() таймаут: данные не получены за 5 секунд');
                bluetoothCharacteristic.removeEventListener('characteristicvaluechanged', handler);
                resolve(null);
            }, 5000); // Таймаут 5 секунд
            
            const handler = (event) => {
                try {
                    const value = event.target.value;
                    if (!value || value.byteLength === 0) return;
                    
                    const decoder = new TextDecoder();
                    const data = decoder.decode(value).trim();
                    
                    if (data && data !== lastRFIDUID) {
                        clearTimeout(timeout);
                        bluetoothCharacteristic.removeEventListener('characteristicvaluechanged', handler);
                        lastRFIDUID = data;
                        addToLog(`✅ getRFID() получил новый UID: ${data}`);
                        resolve(data);
                    }
                } catch (error) {
                    console.error('Error in getRFID handler:', error);
                    addToLog(`❌ Ошибка в обработчике getRFID: ${error.message}`);
                    clearTimeout(timeout);
                    bluetoothCharacteristic.removeEventListener('characteristicvaluechanged', handler);
                    resolve(null);
                }
            };
            
            bluetoothCharacteristic.addEventListener('characteristicvaluechanged', handler);
        });
        
    } catch (error) {
        console.error('Error in getRFID:', error);
        addToLog(`❌ Ошибка получения RFID: ${error.message}`);
        return null;
    }
}

// Визуальная анимация сканирования
function triggerScanAnimation() {
    const scanAnimation = document.getElementById('scanAnimation');
    if (scanAnimation) {
        scanAnimation.style.display = 'block';
        scanAnimation.classList.remove('active');
        void scanAnimation.offsetWidth;
        scanAnimation.classList.add('active');
        
        // Автоматически скрыть анимацию через 2 секунды
        setTimeout(() => {
            scanAnimation.classList.remove('active');
            setTimeout(() => {
                scanAnimation.style.display = 'none';
            }, 500);
        }, 2000);
    }
}

// Отключение Bluetooth
async function disconnectScanner() {
    try {
        if (bluetoothDevice && bluetoothDevice.gatt.connected) {
            bluetoothDevice.gatt.disconnect();
        }
    } catch (error) {
        console.log('Error during disconnect:', error);
    }
    handleBluetoothDisconnection();
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
            headers: getAuthHeaders(),
            body: JSON.stringify({
                rfid_uid: rfidUid,
                event_id: currentEvent.id
            })
        });

        const result = await response.json();

        if (result.success) {
            addToLog(`✅ ${result.studentName} - ${new Date().toLocaleTimeString()}`);
        } else {
            addToLog(`❌ Ошибка записи: ${result.error || rfidUid}`);
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
            headers: getAuthHeaders(),
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
        } else {
            alert('Ошибка регистрации карты: ' + result.error);
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
        const response = await fetch(`/api/events/${currentEvent.id}/attendance`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        const log = document.getElementById('eventLog');
        log.innerHTML = '';

        result.attendance.forEach(record => {
            addToLog(`${record.student_name} - ${new Date(record.timestamp).toLocaleString()}`);
        });
    } catch (error) {
        console.error('Error loading attendance:', error);
        alert('Ошибка загрузки журнала посещений');
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats', {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        document.getElementById('statsEvents').textContent = result.totalEvents;
        document.getElementById('statsRecords').textContent = result.totalRecords;
        document.getElementById('statsCards').textContent = result.totalCards;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function exportData() {
    // if (!currentEvent) {
    //     // alert('Нет активного мероприятия для экспорта');
    //     currentEvent='all';
    //     return;
    // }

    // Создаем временную ссылку для скачивания файла
    // const exportUrl = `/api/events/${currentEvent.id}/export`;
    const exportUrl = `/api/events/1/export`;
    
    try {
        const response = await fetch(exportUrl, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `event_${currentEvent.id}_attendance.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        addToLog('✅ Файл CSV успешно скачан');
    } catch (error) {
        console.error('Export error:', error);
        alert(`Ошибка экспорта: ${error.message}`);
        addToLog(`❌ Ошибка экспорта: ${error.message}`);
    }
}

// Тестовые функции (для работы без BLE)
function setupTestInput() {
    const testInput = document.getElementById('testRfidInput');
    if (testInput) {
        testInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                simulateRFID();
            }
        });
    }
}

function simulateRFID() {
    const testUid = document.getElementById('testRfidInput')?.value.trim();
    if (testUid) {
        handleRFIDScan(testUid);
        const input = document.getElementById('testRfidInput');
        if (input) input.value = '';
    }
}

// Ручной вызов getRFID() для тестирования
async function testGetRFID() {
    addToLog('🔍 Запрос RFID данных...');
    const rfidData = await getRFID();
    if (rfidData) {
        addToLog(`✅ Получен RFID: ${rfidData}`);
        handleRFIDScan(rfidData);
    } else {
        addToLog('❌ RFID данные не получены (таймаут или ошибка)');
    }
}

// Генерация тестовых RFID UID
function generateTestUID() {
    return Math.random().toString(16).substr(2, 8).toUpperCase();
}

// Инициализация и привязка событий
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    
    // Проверка поддержки Web Bluetooth
    if (!navigator.bluetooth) {
        console.warn('Web Bluetooth API не поддерживается в этом браузере');
        addToLog('⚠️ Web Bluetooth не поддерживается. Используйте Chrome/Edge/Opera.');
    }
    
    // Привязка обработчиков событий через getElementById и addEventListener
    function initializeEventListeners() {
        // Кнопка входа
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', login);
            console.log('Login button event listener added');
        }
        
        // Кнопки управления мероприятием
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', startEvent);
            console.log('Start event button event listener added');
        }
        
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', stopEvent);
            console.log('Stop event button event listener added');
        }
        
        // Кнопка регистрации карты
        const registerCardBtn = document.getElementById('registerCardBtn');
        if (registerCardBtn) {
            registerCardBtn.addEventListener('click', registerCard);
            console.log('Register card button event listener added');
        }
        
        // Кнопки Bluetooth
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', connectScanner);
            console.log('Connect scanner button event listener added');
        }
        
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', disconnectScanner);
            console.log('Disconnect scanner button event listener added');
        }
        
        // Кнопки журнала событий
        const loadAttendanceBtn = document.getElementById('loadAttendanceBtn');
        if (loadAttendanceBtn) {
            loadAttendanceBtn.addEventListener('click', loadAttendance);
            console.log('Load attendance button event listener added');
        }
        
        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', exportData);
            console.log('Export data button event listener added');
        }
        
        // Автозаполнение тестового UID
        const cardUidInput = document.getElementById('cardUid');
        if (cardUidInput) {
            cardUidInput.value = generateTestUID();
        }
        
        console.log('All event listeners initialized successfully');
    }
    
    // Инициализация обработчиков событий
    initializeEventListeners();
});
