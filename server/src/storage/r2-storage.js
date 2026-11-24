import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertValidKey } from './keys.js';

/** Content-Disposition value with an ASCII fallback name and the UTF-8 name per RFC 6266. */
export function contentDisposition(name, inline) {
  if (inline) {
    return 'inline';
  }
  const ascii = String(name)
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** The S3 endpoint for a Cloudflare R2 account, unless one is configured explicitly. */
export function r2Endpoint({ R2_ENDPOINT, R2_ACCOUNT_ID }) {
  return R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

/**
 * Cloudflare R2 (S3 compatible) storage. Objects are private: the server authorizes a request,
 * then redirects the browser to a short-lived signed URL so file bytes never pass through the
 * application server. client and presign are injectable so tests need no network.
 */
export function createR2Storage({
  client,
  bucket,
  signedUrlTtlSeconds,
  presign = getSignedUrl,
  now = () => Date.now(),
}) {
  // Signing times are rounded down to half the lifetime, so every request in that window gets the
  // same URL. That lets browsers reuse cached bytes instead of downloading a thumbnail again each
  // time the list scrolls, while each URL still has at least half its lifetime left when issued.
  const windowMs = (signedUrlTtlSeconds * 1000) / 2;

  return {
    /** How long a redirect to a signed URL may be cached, with a margin for clock skew. */
    redirectCacheSeconds: Math.max(0, Math.floor(signedUrlTtlSeconds / 2) - 10),

    async put(key, buffer, { contentType } = {}) {
      assertValidKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          // Keys are random and never overwritten, so the bytes behind a key never change.
          CacheControl: 'private, max-age=86400, immutable',
        }),
      );
    },

    async get(key) {
      assertValidKey(key);
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { stream: result.Body, size: result.ContentLength };
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          return null;
        }
        throw err;
      }
    },

    /** Server-side copy inside the bucket: no bytes pass through the application. */
    async copy(fromKey, toKey) {
      assertValidKey(fromKey);
      assertValidKey(toKey);
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: toKey,
          CopySource: `${bucket}/${fromKey}`,
        }),
      );
    },

    async delete(key) {
      assertValidKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    /**
     * A GET URL valid for signedUrlTtlSeconds. The response type and disposition are fixed in
     * the signature, so a visitor cannot change how the browser treats the file.
     */
    async signedUrl(key, { filename = 'file', contentType, inline = false } = {}) {
      assertValidKey(key);
      return presign(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: contentType,
          ResponseContentDisposition: contentDisposition(filename, inline),
        }),
        {
          expiresIn: signedUrlTtlSeconds,
          signingDate: new Date(Math.floor(now() / windowMs) * windowMs),
        },
      );
    },
  };
}

export function createR2Client(env) {
  return new S3Client({
    region: 'auto',
    endpoint: r2Endpoint(env),
    // Path-style keeps every signed URL on the endpoint host, so the CSP needs one origin.
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}
