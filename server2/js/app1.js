class RFIDBluetoothMonitor {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        this.isConnected = false;
        this.lastUID = '';
        this.pollingInterval = null;
        
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

            // Используем acceptAllDevices и запрашиваем все сервисы
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [] // Пустой массив, чтобы получить базовые сервисы
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

            // Получаем все сервисы для анализа
            const services = await this.server.getPrimaryServices();
            this.addLog(`Найдено сервисов: ${services.length}`, 'info');

            if (services.length === 0) {
                throw new Error('Устройство не содержит доступных сервисов');
            }

            // Детально логируем все найденные сервисы
            this.addLog('=== ДЕТАЛЬНАЯ ИНФОРМАЦИЯ О СЕРВИСАХ ===', 'info');
            for (let service of services) {
                this.addLog(`Сервис UUID: ${service.uuid}`, 'info');
                
                // Получаем характеристики для каждого сервиса
                try {
                    const characteristics = await service.getCharacteristics();
                    this.addLog(`  Характеристик: ${characteristics.length}`, 'info');
                    
                    for (let char of characteristics) {
                        this.addLog(`  - Характеристика: ${char.uuid}`, 'info');
                        this.addLog(`    Свойства: read=${char.properties.read}, notify=${char.properties.notify}, write=${char.properties.write}`, 'info');
                    }
                } catch (error) {
                    this.addLog(`  Ошибка получения характеристик: ${error.message}`, 'error');
                }
            }
            this.addLog('=== КОНЕЦ ИНФОРМАЦИИ О СЕРВИСАХ ===', 'info');

            // Автоматически выбираем подходящий сервис и характеристику
            const result = await this.autoDiscoverServiceAndCharacteristic(services);
            if (!result) {
                throw new Error('Не удалось найти подходящий сервис и характеристику');
            }

            this.service = result.service;
            this.characteristic = result.characteristic;

            this.addLog(`Автоматически выбран сервис: ${this.service.uuid}`, 'success');
            this.addLog(`Автоматически выбрана характеристика: ${this.characteristic.uuid}`, 'success');

            // Настраиваем получение данных
            if (this.characteristic.properties.notify) {
                await this.characteristic.startNotifications();
                this.characteristic.addEventListener('characteristicvaluechanged', 
                    (event) => this.handleData(event));
                this.addLog('Уведомления включены', 'success');
            } else if (this.characteristic.properties.read) {
                this.addLog('Характеристика поддерживает только чтение. Используется режим опроса.', 'warning');
                this.startPolling();
            } else {
                this.addLog('Характеристика не поддерживает уведомления или чтение', 'warning');
            }

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

    async autoDiscoverServiceAndCharacteristic(services) {
        // Приоритет: сервисы с характеристиками, поддерживающими уведомления
        for (let service of services) {
            try {
                const characteristics = await service.getCharacteristics();
                
                // Ищем характеристику с уведомлениями
                const notifyChar = characteristics.find(c => c.properties.notify);
                if (notifyChar) {
                    return { service, characteristic: notifyChar };
                }
                
                // Ищем характеристику с чтением
                const readChar = characteristics.find(c => c.properties.read);
                if (readChar) {
                    return { service, characteristic: readChar };
                }
            } catch (error) {
                continue;
            }
        }

        // Если не нашли подходящую комбинацию, берем первый сервис с первой характеристикой
        for (let service of services) {
            try {
                const characteristics = await service.getCharacteristics();
                if (characteristics.length > 0) {
                    return { service, characteristic: characteristics[0] };
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    startPolling() {
        // Периодическое чтение характеристики
        this.pollingInterval = setInterval(async () => {
            if (!this.isConnected || !this.characteristic || !this.characteristic.properties.read) {
                return;
            }

            try {
                const value = await this.characteristic.readValue();
                this.handleData({ target: { value } });
            } catch (error) {
                this.addLog(`Ошибка опроса характеристики: ${error.message}`, 'error');
            }
        }, 1000);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    async disconnect() {
        this.stopPolling();
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
        this.stopPolling();
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

            let data = '';
            
            // Пробуем разные форматы данных
            try {
                // Пробуем как текст
                const decoder = new TextDecoder();
                data = decoder.decode(value).trim();
                
                // Если текст пустой или содержит непечатаемые символы, пробуем HEX
                if (!data || data.length === 0 || /[\x00-\x1F\x7F]/.test(data)) {
                    data = Array.from(new Uint8Array(value.buffer))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join(':')
                        .toUpperCase();
                }
            } catch (e) {
                // Если TextDecoder не сработал, используем HEX
                data = Array.from(new Uint8Array(value.buffer))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join(':')
                    .toUpperCase();
            }

            // Фильтруем ненужные данные (повторы и служебные сообщения)
            if (!data || data === this.lastUID || data.includes('ESP32-RFID-Reader')) {
                return;
            }

            // Обновляем только если это новые данные
            this.lastUID = data;
            this.updateUID(data);
            this.updateTimestamp();
            this.triggerScanAnimation();
            this.addLog(`Получены данные: ${data}`, 'success');

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