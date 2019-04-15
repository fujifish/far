const fs = require("fs");
try {
  // check if the config file exists
  fs.readFileSync(`${require("os").homedir()}/.aws/config`);
  process.env.AWS_SDK_LOAD_CONFIG = true;
} catch (e) {
  // ignore
}
const AWS = require("aws-sdk");

class Far {
  constructor(config) {
    this.config = config;

    this._validateConfig();
  }

  _validateConfig() {
    if (!this.config.env) {
      throw new Error(`env must be specified`);
    }
    if (this.config.name && !this.config.name.match(/^[a-zA-Z0-9_-]+$/)) {
      throw new Error(`name "${this.config.name}" contains invalid characters`);
    }
    if (this.config.type && this.config.type !== "fargate" && this.config.type !== "ec2") {
      throw new Error(`type "${this.config.type}" is not one of "fargate" or "ec2"`);
    }
    if (this.config.cpu && [256, 512, 1024, 2048, 4096].indexOf(this.config.cpu) === -1) {
      throw new Error(`cpu "${this.config.cpu}" is not a valid vCPU value`);
    }
  }

  async execute(command) {
    this.config.command = command;
    let Cmd = new require(`./lib/commands/${command}`);
    let cmd = new Cmd(this.config);
    return await cmd.run();
  }
}

module.exports = Far;
