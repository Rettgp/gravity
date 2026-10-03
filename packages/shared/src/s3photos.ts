import { DeleteObjectsCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PhotoStore } from './photos.js';

/** Private S3 bucket (no public access, no presigned URLs): photos only ever leave through the authenticated API. */
export class S3Photos implements PhotoStore {
  private s3 = new S3Client({});
  constructor(private bucket: string) {}
  async put(key: string, bytes: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }));
  }
  async get(key: string) {
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return { bytes: Buffer.from(await r.Body!.transformToByteArray()), contentType: r.ContentType ?? 'image/jpeg' };
    } catch (e) {
      if (e instanceof NoSuchKey) return undefined;
      throw e;
    }
  }
  async delete(keys: string[]) {
    if (keys.length) await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
  }
}
