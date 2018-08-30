const AWS = require("aws-sdk");
const terminal = require("./terminal");

class Cmd {
  constructor(config) {
    this.config = config;
    this.config.basename = this.config.name;
    this.config.name = `${this.config.name}-${this.config.env}`;
    this.config.basecluster = this.config.cluster;
    this.config.cluster = `${this.config.cluster}-${this.config.env}`;
    this.config.role = this.config.role || "far-tasks";

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
    let account = await this.sts.getCallerIdentity({}).promise();
    terminal.log(`account: ${account.Arn}\n`);
    return this.execute();
  }
}

module.exports = Cmd;