const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: `${field} debe usar el formato YYYY-MM-DD`,
    };
  }
}
