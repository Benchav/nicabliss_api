import bcrypt from "bcryptjs";

export class PasswordHasher {
  private static readonly SALT_ROUNDS = 10;

  public static async hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, this.SALT_ROUNDS);
  }

  public static hashSync(plainText: string): string {
    return bcrypt.hashSync(plainText, this.SALT_ROUNDS);
  }

  public static async compare(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
