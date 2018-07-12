const ScaleCmd = require("./scale");

class StopCmd extends ScaleCmd {
  constructor(config) {
    super(config);
    this.config.count = 0;
  }
}

module.exports = StopCmd;
