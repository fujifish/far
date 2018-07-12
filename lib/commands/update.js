const DeployCmd = require("./deploy");
const terminal = require("../terminal");

class UpdateCmd extends DeployCmd {
  constructor(config) {
    super(config);
  }

  async execute() {
    terminal.log(`Updating service ${this.config.name}`);
    await this._updateService();
  }

}

module.exports = UpdateCmd;
