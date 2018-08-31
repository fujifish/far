const chalk = require("chalk");
const {table, getBorderCharacters} = require("table");
const Cmd = require("../cmd");
const terminal = require("../terminal");

class StatusCmd extends Cmd {
  constructor(config) {
    super(config);
  }

  async execute() {
    terminal.progressStart("Retrieving service status");
    let result = await this.ecs
      .describeServices({
        cluster: this.config.cluster,
        services: [this.config.name]
      })
      .promise();
    let service = result.services[0];
    result = await this.ecs
      .describeTaskDefinition({
        taskDefinition: service.taskDefinition
      })
      .promise();
    terminal.progressEnd();
    let definition = result.taskDefinition;
    terminal.log(``);
    terminal.log(`Service:   ${service.serviceName} (${this._status(service.status)})`);
    terminal.log(`Type:      ${service.launchType}`);
    terminal.log(`Created:   ${service.createdAt}`);
    terminal.log(`Cluster:   ${service.clusterArn}`);
    terminal.log(`Task Def:  ${service.taskDefinition}`);
    terminal.log(`Image:     ${definition.containerDefinitions[0].image}`);
    terminal.log(`Desired:   ${service.desiredCount}`);
    terminal.log(`Pending:   ${service.pendingCount}`);
    terminal.log(`Running:   ${service.runningCount}`);

    if (service.events && this.config.events > 0) {
      let numEvents = Math.min(service.events.length, this.config.events);
      let moreEvents = "";
      if (service.events.length > numEvents) {
        moreEvents = ` (showing latest ${numEvents} out of ${service.events.length} total)`;
      }
      terminal.log(`Events${moreEvents}:`);
      for (let i = 0; i < numEvents; ++i) {
        let e = service.events[i];
        terminal.log(` [${new Date(e.createdAt).toISOString()}] ${e.message}`);
      }
    }
    if (service.failures) {
      terminal.log("Failures:");
      service.failures.forEach(f => {
        terminal.log(` ${f.arn}: ${f.reason}`);
      });
    }
  }

  _status(status) {
    let color = {
      ACTIVE: "green",
      INACTIVE: "red",
      DRAINING: "blue",
      PRIMARY: "blue"
    }[status];
    return chalk[color](status);
  }
}

module.exports = StatusCmd;
