function fieldMatches(field: string, value: number, minimum: number, maximum: number): boolean {
  return field.split(",").some((part) => {
    const [rangeText, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) return false;
    const [start, end] = rangeText === "*"
      ? [minimum, maximum]
      : rangeText.includes("-")
        ? rangeText.split("-").map(Number)
        : [Number(rangeText), Number(rangeText)];
    return Number.isInteger(start) && Number.isInteger(end) && start >= minimum && end <= maximum && start <= value && value <= end && (value - start) % step === 0;
  });
}

export function isValidCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const;
  return fields.every((field, index) => {
    const [minimum, maximum] = ranges[index];
    return fieldMatches(field, minimum, minimum, maximum) || fieldMatches(field, maximum, minimum, maximum) || [...Array(maximum - minimum + 1)].some((_, offset) => fieldMatches(field, minimum + offset, minimum, maximum));
  });
}

export function cronMatches(expression: string, date = new Date()): boolean {
  if (!isValidCron(expression)) return false;
  const [minute, hour, day, month, weekday] = expression.trim().split(/\s+/);
  const values = [date.getUTCMinutes(), date.getUTCHours(), date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCDay()];
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const;
  return [minute, hour, day, month, weekday].every((field, index) => fieldMatches(field, values[index], ranges[index][0], ranges[index][1]));
}
