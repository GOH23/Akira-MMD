function IsUUID(input: string, strict: boolean = true): boolean {
    if (typeof input !== 'string') return false;

    // Базовое регулярное выражение для UUID v4
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // Дополнительные проверки для строгого режима
    if (strict) {
        // Проверка регистра и дефисов
        return uuidPattern.test(input) &&
            (input === input.toLowerCase() || input === input.toUpperCase());
    }

    // Нестрогий режим: игнорирует регистр и дефисы
    const normalized = input.replace(/[^0-9a-f]/gi, '');
    return normalized.length === 32 &&
        parseInt(normalized.substring(12, 16), 16) === 4;
}
export { IsUUID }