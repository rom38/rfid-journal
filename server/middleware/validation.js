// Валидация входных данных
const validateLogin = (req, res, next) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Логин и пароль обязательны'
        });
    }

    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({
            success: false,
            error: 'Логин должен быть от 3 до 50 символов'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            error: 'Пароль должен быть не менее 6 символов'
        });
    }

    next();
};

const validateEvent = (req, res, next) => {
    const { name, organizer } = req.body;

    if (!name || !organizer) {
        return res.status(400).json({
            success: false,
            error: 'Название мероприятия и организатор обязательны'
        });
    }

    if (name.length < 3 || name.length > 255) {
        return res.status(400).json({
            success: false,
            error: 'Название мероприятия должно быть от 3 до 255 символов'
        });
    }

    if (organizer.length < 2 || organizer.length > 100) {
        return res.status(400).json({
            success: false,
            error: 'Имя организатора должно быть от 2 до 100 символов'
        });
    }

    next();
};

const validateRFIDCard = (req, res, next) => {
    const { rfid_uid, student_name, student_class } = req.body;

    if (!rfid_uid || !student_name) {
        return res.status(400).json({
            success: false,
            error: 'UID карты и ФИО студента обязательны'
        });
    }

    // Валидация RFID UID (буквы и цифры, 4-50 символов)
    const rfidRegex = /^[A-Za-z0-9]{4,50}$/;
    if (!rfidRegex.test(rfid_uid)) {
        return res.status(400).json({
            success: false,
            error: 'UID карты должен содержать только буквы и цифры (4-50 символов)'
        });
    }

    if (student_name.length < 2 || student_name.length > 100) {
        return res.status(400).json({
            success: false,
            error: 'ФИО студента должно быть от 2 до 100 символов'
        });
    }

    if (student_class && student_class.length > 20) {
        return res.status(400).json({
            success: false,
            error: 'Название класса не должно превышать 20 символов'
        });
    }

    next();
};

const validateAttendance = (req, res, next) => {
    const { rfid_uid, event_id } = req.body;

    if (!rfid_uid || !event_id) {
        return res.status(400).json({
            success: false,
            error: 'UID карты и ID мероприятия обязательны'
        });
    }

    const rfidRegex = /^[A-Za-z0-9]{4,50}$/;
    if (!rfidRegex.test(rfid_uid)) {
        return res.status(400).json({
            success: false,
            error: 'Некорректный формат UID карты'
        });
    }

    if (isNaN(event_id) || event_id <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Некорректный ID мероприятия'
        });
    }

    next();
};

const validateEventId = (req, res, next) => {
    const eventId = req.params.id;

    if (!eventId || isNaN(eventId) || eventId <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Некорректный ID мероприятия'
        });
    }

    next();
};

// Санитизация данных для защиты от XSS
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    
    return input
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
};

// Middleware для санитизации всех строковых полей в теле запроса
const sanitizeRequestBody = (req, res, next) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = sanitizeInput(req.body[key]);
            }
        });
    }
    next();
};

module.exports = {
    validateLogin,
    validateEvent,
    validateRFIDCard,
    validateAttendance,
    validateEventId,
    sanitizeRequestBody,
    sanitizeInput }
