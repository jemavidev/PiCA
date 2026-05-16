#!/usr/bin/env node

/**
 * PiCA CLI Entry Point
 * Dispatches commands to CLIManager
 */

const path = require('path');
const fs = require('fs-extra');

const command = process.argv[2];
const args = process.argv.slice(3);

/**
 * Load PiCA and execute command
 */
async function main() {
  try {
    // Dynamic import of compiled CLI manager
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

    switch (command) {
      case 'init':
        await cli.init();
        break;

      case 'analyze':
        if (!args[0]) {
          console.error('❌ Usage: pica analyze <file>');
          process.exit(1);
        }
        await cli.analyze(args[0]);
        break;

      case 'generate':
        if (!args[0]) {
          console.error('❌ Usage: pica generate <description>');
          process.exit(1);
        }
        await cli.generate(args.join(' '));
        break;

      case 'validate':
        if (!args[0]) {
          console.error('❌ Usage: pica validate <file>');
          process.exit(1);
        }
        await cli.validate(args[0]);
        break;

      case 'status':
        await cli.status();
        break;

      case '-v':
      case '--version':
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
        console.log(`PiCA ${pkg.version}`);
        break;

      case '-h':
      case '--help':
        cli.showHelp();
        break;

      default:
        if (command) {
          console.error(`❌ Unknown command: ${command}\n`);
        }
        cli.showHelp();
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
