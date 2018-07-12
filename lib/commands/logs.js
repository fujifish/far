const path = require("path");
const Cmd = require("../cmd");
const terminal = require("../terminal");

class LogsCmd extends Cmd {
  constructor(config) {
    super(config);
    this.eventIds = {};
  }
  
  async execute() {
    await this._getLogs(this.config.start || Date.now(), this.config.end);
  }
  
  async _wait(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }
  
  async _getLogs(start, end) {
    let params = {
      logGroupName: `awslogs-far-${this.config.name}`,
      interleaved: true,
      startTime: start,
      endTime: end
    };
    
    let lastEventTime = start;
    let nextToken;
    let result;
    do {
      params.nextToken = nextToken;
      result = await this.cwl.filterLogEvents(params).promise();
      result.events.forEach(e => {
        if (lastEventTime < e.timestamp) {
          lastEventTime = e.timestamp;
        }
        if (!this.eventIds[e.eventId]) {
          this.eventIds[e.eventId] = true;
          terminal.log(`${path.basename(e.logStreamName)}: [${new Date(e.timestamp).toISOString()}] ${e.message}`);
        }
      });
    } while (nextToken = result.nextToken)
    await this._wait(1000);
    return await this._getLogs(lastEventTime, end);
  }
}

module.exports = LogsCmd;
