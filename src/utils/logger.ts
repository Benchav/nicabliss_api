export class Logger {
  public static info(message: string, context?: string): void {
    const time = new Date().toISOString();
    console.log(`[${time}] [INFO] ${context ? `[${context}] ` : ""}${message}`);
  }

  public static error(message: string, error?: unknown, context?: string): void {
    const time = new Date().toISOString();
    console.error(`[${time}] [ERROR] ${context ? `[${context}] ` : ""}${message}`, error ?? "");
  }
}
