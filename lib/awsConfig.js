const path = require("path");
const os = require("os");
const fs = require("fs");
const ini = require("ini");

class AWSConfig {

  constructor(config) {
    let awsDir = path.resolve(os.homedir(), ".aws");
    let awsConfigFile = path.resolve(awsDir, "config");
    try {
      let awsConfig = ini.parse(fs.readFileSync(awsConfigFile, "utf8"));
      this._findSettings(awsConfig, config.profile);
    } catch (e) {
      if (e.code !== "ENOENT") {
        throw e;
      }
    }
  }

  _findSettings(awsConfig, profileName) {
    let profile = awsConfig[`profile ${profileName}`];
    if (profile) {
      for (let conf in profile) {
        let farSetting = conf.match(/^far_(.+)$/);
        if (farSetting) {
          this[farSetting[1]] = profile[`far_${farSetting[1]}`];
        }
      }
      if (profile.source_profile) {
        this._findSettings(awsConfig, profile.source_profile)
      }
    }
  }
}

module.exports = AWSConfig;