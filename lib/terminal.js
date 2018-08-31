const ora = require('ora');
const chalk = require('chalk');

class Logger {
  constructor() {
    this.progress = undefined;
  }

  log(msg, newline=true) {
    if (this.spinner) {
      this.spinner.stop();
      delete this.spinner;
    }
    process.stdout.write(msg);
    if (newline) {
      process.stdout.write("\n");
    }
  }

  info(msg) {
    if (this.spinner) {
      this.spinner.stop();
      delete this.spinner;
    }
    ora(msg).info();
  }

  progressStart(msg = "") {
    if (this.spinner) {
      this.spinner.stop();
      delete this.spinner;
    }
    this.spinner = ora({text: msg}).start();
  }

  progressEnd(msg) {
    this.spinner.succeed(msg);
    delete this.spinner;
  }

  exit(msg, code = 1) {
    if (this.spinner) {
      this.spinner.fail();
    }
    ora(msg).fail(chalk.red(`ERROR: ${msg}`));
    process.exit(code);
  }
}

module.exports = new Logger();