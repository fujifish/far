const readline = require("readline");
const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const yaml = require("js-yaml");
const AWS = require("aws-sdk");
const ini = require("ini");
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
    } catch (e) {}

    this.config.name = await this._ask(`Service name`, basename || defaultName);
    this.config.cluster = await this._ask(`AWS Cluster name`, basecluster || defaultName);
    this.config.region = await this._ask(`AWS region`, this.config.region || "eu-west-1");
    await this._askForCredsProfile();

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

  async _askForCredsProfile() {
    let credentials;
    this.config.profile = await this._ask(`AWS credentials profile`, this.config.profile || "default");
    credentials = new AWS.SharedIniFileCredentials({ profile: this.config.profile });
    try {
      // verify credentials validity
      let refresh = util.promisify(credentials.refresh.bind(credentials));
      await refresh();
    } catch (e) {
      if (e.code !== "SharedIniFileCredentialsProviderFailure" && e.code !== "ENOENT") {
        throw e;
      }
      let message = e.code === "ENOENT" ? "AWS credentials file doesn't exist" : e.message;
      let answer = await this._ask(`${message}. Add credentials now (yes/no)?`, "yes");
      if (answer === "yes") {
        let awsDir = path.resolve(os.homedir(), ".aws");
        try {
          fs.mkdirSync(awsDir);
        } catch (e) {
          if (e.code !== "EEXIST") {
            throw e;
          }
        }
        let credsFile = path.resolve(awsDir, "credentials");
        let content = {};
        try {
          content = ini.parse(fs.readFileSync(credsFile, "utf8"));
        } catch (e) {
          if (e.code !== "ENOENT") {
            throw e;
          }
        }
        credentials.accessKeyId = await this._ask(`AWS access key`);
        credentials.accessSecret = await this._ask(`AWS access secret`);
        content[this.config.profile] = {
          aws_access_key_id: credentials.accessKeyId,
          aws_secret_access_key: credentials.accessSecret
        };

        fs.writeFileSync(credsFile, ini.stringify(content, { whitespace: true }), "utf8");
        terminal.log(`Added profile ${this.config.profile} to ${credsFile}`);
      }
    }
  }
}

module.exports = InitCmd;
