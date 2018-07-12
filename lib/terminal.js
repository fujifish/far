class Logger {
  constructor() {
    this.progress = undefined;
  }

  log(msg, newline=true) {
    process.stdout.write(msg);
    if (newline) {
      process.stdout.write("\n");
    }
  }

  progressStart(msg, interval=500) {
    this.log(`${msg}...`, false);
    if (this.progress) {
      clearInterval(this.progress);
    }
    this.progress = setInterval(() => {
      process.stdout.write(".");
    }, interval);
  }

  progressEnd(msg="Done.") {
    clearInterval(this.progress);
    delete this.progress;
    this.log(` ${msg}`);
  }

  exit(msg, code = 1) {
    if (this.progress) {
      clearInterval(this.progress);
      delete this.progress;
      process.stdout.write(" ERROR.\n");
    }
    this.log(`ERROR: ${msg}`);
    process.exit(code);
  }
}

module.exports = new Logger();