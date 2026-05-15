/**
 * Checksum Service
 * Provides SHA256 and MD5 checksum computation for memory integrity
 */

import crypto from 'crypto';

export class ChecksumService {
  /**
   * Compute checksum for content
   */
  async compute(content: string, algorithm: 'sha256' | 'md5' = 'sha256'): Promise<string> {
    return crypto.createHash(algorithm).update(content).digest('hex');
  }

  /**
   * Verify checksum matches content
   */
  async verify(
    content: string,
    checksum: string,
    algorithm: 'sha256' | 'md5' = 'sha256'
  ): Promise<boolean> {
    const computed = await this.compute(content, algorithm);
    return computed === checksum;
  }

  /**
   * Batch compute checksums
   */
  async computeMany(
    items: Array<{ id: string; content: string }>,
    algorithm: 'sha256' | 'md5' = 'sha256'
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    for (const item of items) {
      const checksum = await this.compute(item.content, algorithm);
      results.set(item.id, checksum);
    }
    return results;
  }
}
