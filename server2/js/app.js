class RFIDBluetoothMonitor {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        this.isConnected = false;
        this.lastUID = '';
        this.pollingInterval = null;
        
        // Используем стандартные UUID для лучшей совместимости
        this.SERVICE_UUID = 0xFFE0; // Стандартный сервис для данных
        this.CHARACTERISTIC_UUID = 0xFFE1; // Стандартная характеристика для данных
        
        this.initializeElements();
        this.setupEventListeners();
        this.addLog('Готов к подключению через Bluetooth', 'info');
        this.checkBluetoothAvailability();
    }

    initializeElements() {
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.statusDot = document.getElementById('statusDot');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.uidText = document.getElementById('uidText');
        this.deviceName = document.getElementById('deviceName');
        this.timestamp = document.getElementById('timestamp');
        this.dataStatus = document.getElementById('dataStatus');
        this.scanAnimation = document.getElementById('scanAnimation');
        this.logContent = document.getElementById('logContent');
    }

    setupEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
    }

    async checkBluetoothAvailability() {
        if (!navigator.bluetooth) {
            this.showError('Web Bluetooth не поддерживается в вашем браузере');
            return false;
        }
        
        try {
            const availability = await navigator.bluetooth.getAvailability();
            if (!availability) {
                this.addLog('Bluetooth адаптер не доступен. Убедитесь, что Bluetooth включен.', 'error');
            } else {
                this.addLog('Bluetooth адаптер доступен', 'success');
            }
        } catch (error) {
            this.addLog('Не удалось проверить доступность Bluetooth', 'error');
        }
        
        return true;
    }

    async connect() {
        try {
            this.updateConnectionStatus('connecting', 'Поиск устройств...');
            this.addLog('Запуск поиска Bluetooth устройств...', 'info');

            // Ищем устройство с нашим сервисом
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'ESP32-RFID' }],
                optionalServices: [this.SERVICE_UUID]
            });

            this.addLog(`Устройство выбрано: ${this.device.name || 'Unknown'}`, 'success');
            this.updateConnectionStatus('connecting', 'Подключение...');

            // Подключение с таймаутом
            const connectPromise = this.device.gatt.connect();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Таймаут подключения')), 15000)
            );

            this.server = await Promise.race([connectPromise, timeoutPromise]);
            this.addLog('Подключено к GATT серверу', 'success');

            // Получаем наш сервис
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            this.addLog('Найден сервис RFID', 'success');

            // Получаем нашу характеристику
            this.characteristic = await this.service.getCharacteristic(this.CHARACTERISTIC_UUID);
            this.addLog('Найдена характеристика RFID', 'success');

            // Включаем уведомления
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', 
                (event) => this.handleData(event));
            this.addLog('Уведомления включены', 'success');

            this.isConnected = true;
            this.updateConnectionStatus('connected', `Подключено: ${this.device.name || 'Unknown'}`);
            this.deviceName.textContent = this.device.name || 'Unknown';
            
            this.connectBtn.disabled = true;
            this.disconnectBtn.disabled = false;

            this.addLog('Готов к приему RFID данных', 'success');

            // Обработка отключения
            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnection();
            });

        } catch (error) {
            this.addLog(`Ошибка подключения: ${error.message}`, 'error');
            this.updateConnectionStatus('error', `Ошибка: ${error.message}`);
            this.resetConnection();
        }
    }

    async disconnect() {
        try {
            if (this.device && this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }
        } catch (error) {
            console.log('Error during disconnect:', error);
        }
        this.handleDisconnection();
    }

    handleDisconnection() {
        this.addLog('Отключено от устройства', 'info');
        this.updateConnectionStatus('disconnected', 'Не подключено');
        this.resetConnection();
    }

    resetConnection() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        this.lastUID = '';
        
        this.connectBtn.disabled = false;
        this.disconnectBtn.disabled = true;
        this.deviceName.textContent = '—';
        this.dataStatus.textContent = 'Ожидание данных';
        this.dataStatus.style.color = '#e0e0e0';
    }

    handleData(event) {
        try {
            const value = event.target.value;
            if (!value || value.byteLength === 0) return;

            // Декодируем данные как текст
            const decoder = new TextDecoder();
            const data = decoder.decode(value).trim();

            // Фильтруем ненужные данные (повторы)
            if (!data || data === this.lastUID) {
                return;
            }

            // Обновляем только если это новые данные
            this.lastUID = data;
            this.updateUID(data);
            this.updateTimestamp();
            this.triggerScanAnimation();
            this.addLog(`RFID метка: ${data}`, 'success');

        } catch (error) {
            this.addLog(`Ошибка обработки данных: ${error.message}`, 'error');
        }
    }

    updateUID(uid) {
        this.uidText.textContent = uid;
        this.uidText.parentElement.classList.remove('uid-update');
        void this.uidText.parentElement.offsetWidth;
        this.uidText.parentElement.classList.add('uid-update');
        
        this.dataStatus.textContent = 'Данные получены';
        this.dataStatus.style.color = '#4CAF50';
    }

    updateTimestamp() {
        const now = new Date();
        this.timestamp.textContent = now.toLocaleTimeString();
    }

    updateConnectionStatus(status, message) {
        this.connectionStatus.textContent = message;
        this.statusDot.className = 'status-dot';
        
        switch (status) {
            case 'connected':
                this.statusDot.classList.add('connected');
                break;
            case 'connecting':
                this.statusDot.classList.add('connecting');
                break;
            case 'error':
                this.statusDot.style.background = '#dc3545';
                break;
            default:
                this.statusDot.style.background = '#dc3545';
                break;
        }
    }

    triggerScanAnimation() {
        this.scanAnimation.classList.remove('active');
        void this.scanAnimation.offsetWidth;
        this.scanAnimation.classList.add('active');
    }

    addLog(message, type = 'info') {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.logContent.appendChild(logEntry);
        this.logContent.scrollTop = this.logContent.scrollHeight;
        
        const entries = this.logContent.getElementsByClassName('log-entry');
        if (entries.length > 50) {
            entries[0].remove();
        }
    }

    showError(message) {
        const container = document.querySelector('.container');
        container.innerHTML = `
            <div style="text-align: center; color: white; padding: 50px;">
                <h1>❌ ${message}</h1>
                <p>Пожалуйста, используйте поддерживаемый браузер:</p>
                <ul style="list-style: none; padding: 20px;">
                    <li>• Chrome 56+ (Desktop/Android)</li>
                    <li>• Edge 79+</li>
                    <li>• Opera 43+</li>
                </ul>
            </div>
        `;
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    new RFIDBluetoothMonitor();
});