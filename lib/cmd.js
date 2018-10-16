const AWS = require("aws-sdk");
const chalk = require("chalk");
const AWSConfig = require("./awsConfig");
const terminal = require("./terminal");

class Cmd {
  constructor(config) {
    this.config = config;
    this.config.basename = this.config.name;
    this.config.name = `${this.config.name}-${this.config.env}`;
    this.config.basecluster = this.config.cluster;
    this.config.cluster = `${this.config.cluster}-${this.config.env}`;
    this.config.role = this.config.role || "far-tasks";
    this.awsConfig = new AWSConfig(this.config.profile);

    // convert all docker build options into object
    // build options are explained in: https://docs.docker.com/engine/api/v1.24/#32-images section "Build image from a Dockerfile"
    this.config.dockerBuild = {};
    for (let key in this.config) {
      let match = key.match(/^dockerBuild\.(.+)$/);
      if (match) {
        this.config.dockerBuild[match[1]] = this.config[key];
      }
    }

    let options = {
      region: this.config.region
    };

    this.sts = new AWS.STS(options);
    this.ecr = new AWS.ECR(options);
    this.ecs = new AWS.ECS(options);
    this.ec2 = new AWS.EC2(options);
    this.cwl = new AWS.CloudWatchLogs(options);
    this.sm = new AWS.SecretsManager(options);
    this.iam = new AWS.IAM(options);
  }

  async run() {
    await this.login();
    return this.execute();
  }
  
  async login() {
    let command = chalk.bold(this.config.command);
    let name = chalk.greenBright(this.config.basename);
    let env = `${chalk.blueBright(this.config.env)}${
      this.config.draft ? chalk.cyan(" (draft)") : ""
    }`;
    let profile = chalk.bold(this.config.profile)
    let prefix = `${command} • ${name} • ${env} • ${profile}`;
    terminal.progressStart(`${prefix} (logging-in...)`);
    let account = await this.sts.getCallerIdentity({}).promise();
    terminal.progressEnd(`${prefix} (${account.Arn})`);
  }
}

module.exports = Cmd;