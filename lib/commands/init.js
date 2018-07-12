const readline = require("readline");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const Cmd = require("../cmd");
const terminal = require("../terminal");

class InitCmd extends Cmd {
  constructor(config) {
    super(config);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async execute() {
    delete this.config._;
    delete this.config.$0;
    let env = this.config.env;
    delete this.config.env;
    let basename = this.config.basename;
    delete this.config.basename;
    let basecluster = this.config.basecluster;
    delete this.config.basecluster;
    
    let defaultName = path.basename(process.cwd());
    try {
      // try to read the default name from the local package.json
      defaultName = require(path.resolve(process.cwd(), "package.json")).name;
    } catch(e) {}

    this.config.name = await this._ask(`Service name`, basename || defaultName);
    this.config.cluster = await this._ask(`AWS Cluster name`, basecluster || defaultName);
    this.config.region = await this._ask(`AWS region`, this.config.region || "eu-west-1");
    this.config.profile = await this._ask(`AWS credentials profile`, this.config.profile || "default");

    Object.keys(this.config).forEach(k => {
      if (this.config[k] === undefined || this.config[k] === null) {
        delete this.config[k];
      }
      if (typeof this.config[k] === "string") {
        this.config[k] = this.config[k].trim();
        if (this.config[k] === ".") {
          delete this.config[k];
        }
      }
    });

    let file = `farconfig.${env}`;
    fs.writeFileSync(file, yaml.safeDump(this.config));
    terminal.log(`Wrote configuration to ${file}`);
    this.rl.close();
  }

  async _ask(question, defaultAnswer) {
    return new Promise(resolve => {
      this.rl.question(`${question}${defaultAnswer ? ` ["${defaultAnswer}"]` : ""}: `, answer => {
        resolve(answer || defaultAnswer);
      });
    });
  }
}

module.exports = InitCmd;
