#!/usr/bin/env node

/**
 * PiCA Init Entry Point
 * Initializes a new PiCA project
 */

const path = require('path');

/**
 * Initialize PiCA project
 */
async function main() {
  try {
    const { CLIManager } = await import('../dist/cli/cli-manager.js');

    const projectPath = process.cwd();
    const piPath = '.pica';
    const apiKey = process.env.OPENROUTER_API_KEY || '';

    const cli = new CLIManager({
      projectPath,
      piPath,
      apiKey,
      verbose: process.env.PICA_VERBOSE === 'true',
    });

    await cli.init();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
