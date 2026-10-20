import { UserModel } from "../models/user.model.js";
import { PasswordHasher } from "../utils/hasher.js";

export class UserRepository {
  private users: Map<string, UserModel> = new Map();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const adminHash = PasswordHasher.hashSync("12345");
    const admin: UserModel = {
      id: "usr_admin_001",
      username: "admin",
      email: "admin@nicabliss.com",
      passwordHash: adminHash,
      role: "ADMIN",
      fullName: "Administrador Nicabliss",
      createdAt: new Date().toISOString(),
    };
    this.users.set(admin.id, admin);
  }

  public async findByUsername(username: string): Promise<UserModel | null> {
    const normalized = username.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === normalized) {
        return { ...u };
      }
    }
    return null;
  }

  public async findByEmail(email: string): Promise<UserModel | null> {
    const normalized = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === normalized) {
        return { ...u };
      }
    }
    return null;
  }

  public async findById(id: string): Promise<UserModel | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  public async save(user: UserModel): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  public async findAll(): Promise<UserModel[]> {
    return Array.from(this.users.values()).map(u => ({ ...u }));
  }
}
