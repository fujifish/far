const DeployCmd = require("./deploy");
const terminal = require("../terminal");

class UpdateCmd extends DeployCmd {
  constructor(config) {
    super(config);
  }

  async execute() {
    await this._updateService();
  }

}

module.exports = UpdateCmd;
