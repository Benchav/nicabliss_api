export function parseMoneyToCents(value: unknown, field = "monto"): number {
  const normalized = typeof value === "number" ? value.toFixed(2) : String(value ?? "").trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: `${field} debe ser un importe válido con máximo dos decimales`,
    };
  }

  const [whole, decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: `${field} está fuera del rango permitido`,
    };
  }
  return cents;
}

export function centsToMoney(cents: number): number {
  return Number((cents / 100).toFixed(2));
}
