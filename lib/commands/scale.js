const Cmd = require("../cmd");
const terminal = require("../terminal");

class ScaleCmd extends Cmd {
  constructor(config) {
    super(config);
  }

  async execute() {
    terminal.progressStart(`Scaling service ${this.config.name} to ${this.config.count}`);
    await this.ecs
      .updateService({
        cluster: this.config.cluster,
        service: this.config.name,
        desiredCount: this.config.count
      })
      .promise();
    terminal.progressEnd();
  }
}

module.exports = ScaleCmd;
