const readline = require("readline");
const fs = require("fs");
const path = require("path");
const util = require("util");
const yaml = require("js-yaml");
const AWS = require("aws-sdk");
const Cmd = require("../cmd");
const terminal = require("../terminal");

const REGIONS = {
  "us-east-2":      "US East (Ohio)           ",
  "us-east-1":      "US East (N. Virginia)    ",
  "us-west-1":      "US West (N. California)  ",
  "us-west-2":      "US West (Oregon)         ",
  "eu-central-1":   "EU (Frankfurt)           ",
  "eu-west-1":      "EU (Ireland)             ",
  "eu-west-2":      "EU (London)              ",
  "eu-west-3":      "EU (Paris)               ",
  "eu-north-1":     "EU (Stockholm)           ",
  "ca-central-1":   "Canada (Central)         ",
  "ap-south-1":     "Asia Pacific (Mumbai)    ",
  "ap-northeast-2": "Asia Pacific (Seoul)     ",
  "ap-southeast-1": "Asia Pacific (Singapore) ",
  "ap-southeast-2": "Asia Pacific (Sydney)    ",
  "ap-northeast-1": "Asia Pacific (Tokyo)     ",
  "sa-east-1":      "South America (São Paulo)",
  "cn-north-1":     "China (Beijing)          ",
  "cn-northwest-1": "China (Ningxia)          ",
  "us-gov-east-1":  "AWS GovCloud (US-East)   ",
  "us-gov-west-1":  "AWS GovCloud (US)        "
};

class InitCmd extends Cmd {
  constructor(config) {
    super(config);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async login() {
    // override Cmd#login and do nothing
  }

  async execute() {
    delete this.config._;
    delete this.config.$0;
    delete this.config.command;
    delete this.config.creds;

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

    // await this._askForCredsProfile();
    let regions = Object.keys(REGIONS);
    let regionList = regions.map((r, i) => ` ${REGIONS[r]}\t${r}`).join("\n")
    terminal.log("Available AWS Regions:");
    terminal.log(regionList);
    this.config.region = await this._ask(`Specify AWS region`, this.config.region || "us-west-2");
    this.config.name = await this._ask(`Service name`, basename || defaultName);
    this.config.cluster = await this._ask(`AWS cluster name`, this.config.name);

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

//   async _askForCredsProfile() {
//     let credentials;
//     this.config.profile = await this._ask(`AWS credentials profile`, this.config.profile || "default");
//     let awsConfig = new AWSConfig(this.config.profile);
//     // set the region from the profile
//     this.config.region = this.config.region || awsConfig.region;
//     credentials = new AWS.SharedIniFileCredentials({ profile: this.config.profile });
//     try {
//       // verify credentials validity
//       let refresh = util.promisify(credentials.refresh.bind(credentials));
//       terminal.progressStart("Validating profile credentials");
//       await refresh();
//       terminal.progressEnd();
//     } catch (e) {
//       if (e.code === "ENOENT") {
//         throw new Error("AWS credentials file doesn't exist. Please use aws cli to add the profile.");
//       }
//       throw e;
//     }
//   }
}

module.exports = InitCmd;
