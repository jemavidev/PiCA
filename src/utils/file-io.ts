/**
 * File I/O Service
 * Provides file operations with error handling and safety checks
 */

import fs from 'fs-extra';
import path from 'path';

export class FileIO {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Read file as text
   */
  async read(relativePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    try {
      return await fs.readFile(fullPath, encoding);
    } catch (error) {
      throw new Error(`Failed to read ${relativePath}: ${error}`);
    }
  }

  /**
   * Write file as text
   */
  async write(relativePath: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    try {
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content, encoding);
    } catch (error) {
      throw new Error(`Failed to write ${relativePath}: ${error}`);
    }
  }

  /**
   * Read JSON file
   */
  async readJSON<T = any>(relativePath: string): Promise<T> {
    const fullPath = this.resolvePath(relativePath);
    try {
      return await fs.readJson(fullPath);
    } catch (error) {
      throw new Error(`Failed to read JSON ${relativePath}: ${error}`);
    }
  }

  /**
   * Write JSON file
   */
  async writeJSON<T = any>(relativePath: string, data: T, pretty: boolean = true): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    try {
      await fs.ensureDir(path.dirname(fullPath));
      if (pretty) {
        await fs.writeJson(fullPath, data, { spaces: 2 });
      } else {
        await fs.writeJson(fullPath, data);
      }
    } catch (error) {
      throw new Error(`Failed to write JSON ${relativePath}: ${error}`);
    }
  }

  /**
   * Append to file
   */
  async append(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    try {
      await fs.ensureDir(path.dirname(fullPath));
      await fs.appendFile(fullPath, content);
    } catch (error) {
      throw new Error(`Failed to append to ${relativePath}: ${error}`);
    }
  }

  /**
   * Delete file
   */
  async delete(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    try {
      await fs.remove(fullPath);
    } catch (error) {
      throw new Error(`Failed to delete ${relativePath}: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(relativePath);
    return fs.pathExists(fullPath);
  }

  /**
   * List directory contents
   */
  async listDir(relativePath: string): Promise<string[]> {
    const fullPath = this.resolvePath(relativePath);
    try {
      const files = await fs.readdir(fullPath);
      return files;
    } catch (error) {
      throw new Error(`Failed to list directory ${relativePath}: ${error}`);
    }
  }

  /**
   * Create directory
   */
  async mkdir(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    try {
      await fs.ensureDir(fullPath);
    } catch (error) {
      throw new Error(`Failed to create directory ${relativePath}: ${error}`);
    }
  }

  /**
   * Copy file
   */
  async copy(fromPath: string, toPath: string): Promise<void> {
    const fromFull = this.resolvePath(fromPath);
    const toFull = this.resolvePath(toPath);
    try {
      await fs.ensureDir(path.dirname(toFull));
      await fs.copy(fromFull, toFull);
    } catch (error) {
      throw new Error(`Failed to copy ${fromPath} to ${toPath}: ${error}`);
    }
  }

  /**
   * Get file stats
   */
  async stat(relativePath: string): Promise<fs.Stats> {
    const fullPath = this.resolvePath(relativePath);
    try {
      return await fs.stat(fullPath);
    } catch (error) {
      throw new Error(`Failed to stat ${relativePath}: ${error}`);
    }
  }

  /**
   * Get file size
   */
  async getSize(relativePath: string): Promise<number> {
    const stats = await this.stat(relativePath);
    return stats.size;
  }

  /**
   * Ensure directory exists with .gitkeep
   */
  async ensureDirWithGitkeep(relativePath: string): Promise<void> {
    await this.mkdir(relativePath);
    const gitkeepPath = path.join(relativePath, '.gitkeep');
    if (!(await this.exists(gitkeepPath))) {
      await this.write(gitkeepPath, '');
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private resolvePath(relativePath: string): string {
    const fullPath = path.join(this.baseDir, relativePath);
    // Security: ensure path doesn't escape baseDir
    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error(`Path traversal attempt: ${relativePath}`);
    }
    return fullPath;
  }
}
