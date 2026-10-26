import "server-only";
// src/lib/storage/storage.ts
//
// Prototype: writes to local /uploads directory
// Production: swap to S3 or Cloudinary via PROVIDER_STORAGE env var
// The interface stays the same — application code never changes

import { createHash, randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

// ─── Interface (the contract) ───

export interface StorageResult {
  fileUrl: string;
  filePath: string;
  checksum: string;
  sizeBytes: number;
}

export interface IStorageProvider {
  upload(buffer: Buffer, filename: string, mimeType: string): Promise<StorageResult>;
  delete(fileUrl: string): Promise<void>;
  getPresignedUrl(fileUrl: string): Promise<string>;
  exists(fileUrl: string): Promise<boolean>;
  read(fileUrl: string): Promise<Buffer>;
}

// ─── Local storage implementation (zero cost) ───

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "documents");

export class LocalStorageProvider implements IStorageProvider {
  private initialized = false;

  private async ensureDir(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    this.initialized = true;
  }

  async upload(buffer: Buffer, filename: string, mimeType: string): Promise<StorageResult> {
    await this.ensureDir();

    // Generate unique filename to prevent collisions
    const ext = path.extname(filename).toLowerCase() || ".bin";
    const uniqueName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    // Compute SHA-256 checksum
    const checksum = createHash("sha256").update(buffer).digest("hex");

    // Write file
    await fs.writeFile(filePath, buffer);

    // Return URL-safe path (served by Next.js /api/files/[...path] or static)
    const fileUrl = `/uploads/documents/${uniqueName}`;

    return {
      fileUrl,
      filePath,
      checksum,
      sizeBytes: buffer.length,
    };
  }

  async delete(fileUrl: string): Promise<void> {
    const filename = path.basename(fileUrl);
    const filePath = path.join(UPLOAD_DIR, filename);
    try {
      await fs.unlink(filePath);
    } catch {
      // File already deleted or doesn't exist — that's fine
    }
  }

  async getPresignedUrl(fileUrl: string): Promise<string> {
    // Local storage doesn't need presigned URLs
    // Just return the path — Next.js serves it from /public or via API
    return fileUrl;
  }

  async exists(fileUrl: string): Promise<boolean> {
    const filename = path.basename(fileUrl);
    const filePath = path.join(UPLOAD_DIR, filename);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async read(fileUrl: string): Promise<Buffer> {
    // basename() blocks path traversal — only files inside UPLOAD_DIR are readable
    return fs.readFile(path.join(UPLOAD_DIR, path.basename(fileUrl)));
  }
}

// ─── S3 storage stub (implement when budget allows) ───

// export class S3StorageProvider implements IStorageProvider {
//   constructor(private config: { bucket: string; region: string; accessKey: string; secretKey: string }) {}
//   async upload(buffer: Buffer, filename: string, mimeType: string): Promise<StorageResult> { throw new Error("S3 not configured"); }
//   async delete(fileUrl: string): Promise<void> { throw new Error("S3 not configured"); }
//   async getPresignedUrl(fileUrl: string): Promise<string> { throw new Error("S3 not configured"); }
//   async exists(fileUrl: string): Promise<boolean> { throw new Error("S3 not configured"); }
// }

// ─── Provider factory ───

let _storage: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (!_storage) {
    const provider = process.env.PROVIDER_STORAGE || "local";
    switch (provider) {
      case "local":
        _storage = new LocalStorageProvider();
        break;
      // case "s3":
      //   _storage = new S3StorageProvider({ ... });
      //   break;
      default:
        _storage = new LocalStorageProvider();
    }
  }
  return _storage;
}
