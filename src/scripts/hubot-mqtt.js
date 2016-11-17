/**
 * Description:
 *  List ec2 instances info
 *  Show detail about an instance if specified an instance id
 *  Filter ec2 instances info if specified an instance name
 *
 * Commands:
 *  hubot ec2 ls - Displays Instances
 *
 * Notes:
 *  --instance_id=***     : [optional] The id of an instance. If omit it, returns info about all instances.
 *  --instance_filter=*** : [optional] The name to be used for filtering return values by an instance name.
 */
//var moment = require('moments
//var tsv = require('tsv');

var path = require('path');
var mqtt = require(path.resolve(__dirname, 'mqtt-common'));
//var Paho = require(path.resolve(__dirname, '..', 'lib', 'mqttws31'));
var cmd_char = process.env.HUBOT_COMMAND_CHAR || "\!";
var base_id = "hubot-mqtt.mqtt-";
var command_name = "mqtt";
var robot;
var get_arg_params;

var subscriptions = {};

var actions = {
  pub: {
    name: "pub",
    regexp: "( \-\-[^ ]+)*( [^\-][^ ]+)?( [^\-].+)?$",
//
// Use function to allow use of this.properties
//
//    help: function() {
//      return this.name + " [options] <parent_project_name> <project_name_to_generate>";
//    },
    help: "[options] <topic> <message>",
    arg_params: "msg.match[1]",
    required_params: [
      "msg.match[2]",
      "msg.match[3]"
    ],
    request_message: "\"Publishing message '\" + msg.match[3].trim() + \"' to topic '\" + msg.match[2].trim() + \"'...\"",
    process: function(robot, action, msg) {
      for (var i =0; i < action.required_params.length; i++) {
        var required_param = action.required_params[i];
        
        if (!eval(required_param)) {
          msg.send(show_help(action) + "\n[options] can be :\n--output : use verbose output");
          return;
        }
      }

      msg.send(eval(action.request_message));

      var arg_params = get_arg_params(eval(action.arg_params));

      robot.emit('mqtt:pub', msg, msg.match[2].trim(), msg.match[3].trim());
//      mqtt.publishMessage(
//        msg.match[2].trim(),
//        msg.match[3].trim(),
//        0,
//        false
//      );
    }
  }
};

// Heritate pub action and overrides some properties
/*
actions.pub_json = actions.pub;
actions.pub_json.name = "pub_json";
actions.pub_json.process = function(robot, action, msg) {
  for (var i =0; i < action.required_params.length; i++) {
    var required_param = action.required_params[i];

    if (!eval(required_param)) {
      msg.send(show_help(action));
      return;
    }
  }

  msg.send(eval(action.request_message));

  var arg_params = get_arg_params(eval(action.arg_params));

  robot.emit('mqtt:pub', msg, msg.match[2].trim(), JSON.parse(msg.match[3].trim()));
}
*/

var orig_onSuccess = mqtt.onSuccess;

/**
 * Called on broker connection successfull.
 */
mqtt.onSuccess = function() {
  orig_onSuccess.call(this);

  robot.logger.info('Connection mqtt OK');

  console.log("onSuccess : isConnected = " + mqtt.isConnected());

  //mqtt.subscribeToTopics("lisa/status", 0, false);
  robot.emit('mqtt:onSuccess');
};

mqtt.onMessageArrived = function(message) {
//  console.log("Message arrive on " + message.destinationName);
  if (subscriptions[message.destinationName]) {
//    console.log("Subscriptions exists");
    for (var callback_id in subscriptions[message.destinationName]) {
//      console.log("Emitting event mqtt:onMessage:" + subscriptions[message.destinationName][callback_id]);
      robot.emit("mqtt:onMessage:" + subscriptions[message.destinationName][callback_id], message);
    }
  }
};

function get_arg_params(arg) {
  var output_capture, output;

  output_capture = /--output( |$)/.exec(arg);
  output = output_capture ? true : false;

  return {
    output: output
  };
};


function show_help(action) {
  return "Usage : " + cmd_char + command_name + " " + action.name + " " + action.help;
}

module.exports = function(robotAdapter) {
  var regx;
  robot = robotAdapter;
  subscriptions = {};
  var help_msg = "- MQTT commands -\n";
//  var negative_regx;

  for (var key in actions) {
    if (actions.hasOwnProperty(key)) {
      var action = actions[key];
      // Keep information for gobal help
      help_msg += action.name + "\n\t" + show_help(action) + "\n";
      regx = new RegExp("^@?(?:" + robot.name + "\\s+)?" + cmd_char + command_name + " " + action.name + action.regexp, "i");

      robot.hear(regx, {
        id: base_id + action.name
      }, action.process.bind(this, robot, action));

      robot.logger.info(">>> MQTT command added : " + action.name);
    }
  }

  regx = new RegExp("^@?(?:" + robot.name + "\\s+)?" + cmd_char + command_name + "( \-\-.+)*$", 'i');
  robot.hear(regx, {
    id: base_id + 'help'
  }, function(msg) {
    var msg_txt = help_msg;

    msg_txt += "\n[options] can be :\n--output : use verbose output";
    msg.send(msg_txt);
  });

  mqtt.configureMQTTConnection(
        process.env.MQTT_HOST,
        Number(process.env.MQTT_PORT || '443'),
        process.env.MQTT_CONTEXT,
        process.env.MQTT_CLI_ID + "-hubot-mqtt",
        null,
        Number(process.env.MQTT_CONNECT_TIMEOUT) || 30000,
        Number(process.env.MQTT_KEEPALIVE) || 10,
        true,
        process.env.MQTT_USERNAME,
        process.env.MQTT_PASSWORD,
        true
    );

  robot.logger.debug("Connecting with configuration : " + JSON.stringify(mqtt.clientConfiguration));
  mqtt.mqttConnect();

  robot.on('reload_scripts', function() {
    mqtt.mqttDisconnect();
  });

  robot.on('reload_scripts_hubot-scripts', function() {
    mqtt.mqttDisconnect();
  });

  robot.on('reload_scripts_hubot-external-scripts', function() {
    mqtt.mqttDisconnect();
  });


  robot.on('help:get', function(msg, command, action_id) {
    // a message is passed
    if (msg) {
      // there is a command specified
      if (command) {
        // command is this command name
        if (command.toUpperCase() == command_name.toUpperCase()) {
          if (action_id) {
            // for each actions
            for (var key in actions) {
              if (actions.hasOwnProperty(key)) {
                // action is is equal to current iteration key
                if (action_id.toUpperCase() === key.toUpperCase()) {
                // send help message
                msg.send(show_help(actions[key]) + "\n[options] can be :\n--output : use verbose output");
                  // stop
                  break;
                }
              }
            }
          } else {
            // output full current command help
            var msg_txt = help_msg;

            msg_txt += "\n[options] can be :\n--output : use verbose output";
            msg.send(msg_txt);            
          }
        }
      } else {
        // output full current command help
        var msg_txt = help_msg;

        msg_txt += "\n[options] can be :\n--output : use verbose output";
        msg.send(msg_txt);
      }
    }
  });

  robot.on('mqtt:pub', function(msg, topic, message, qos, retain) {
    console.log("mqtt:pub : isConnected = " + mqtt.isConnected());
    if (mqtt.isConnected()) {
      mqtt.publishMessage(
        topic,
        message,
        Number(qos) || 0,
        (retain === 'true')
      );

      if (msg) {
        msg.send("Message published !");
      }
    } else {
      if (msg) {
        msg.send("Not connected to MQTT broker, couldn't publish to topic '" + topic + "' !");
      } else {
        robot.logger.error("Not connected to MQTT broker, couldn't publish to topic '" + topic + "' with callback_id '" + callback_id + "' !");
      }
    }
  });

  robot.on('mqtt:sub', function(msg, callback_id, topic, qos) {
    console.log("mqtt:sub : isConnected = " + mqtt.isConnected());
    if (mqtt.isConnected()) {
      if (callback_id) {
        mqtt.subscribeToTopics(
          topic,
          Number(qos) || 0,
          false
        );

        if (!subscriptions[topic]) {
          subscriptions[topic] = [];
        }
        subscriptions[topic].push(callback_id);

        if (msg) {
          msg.send("Topic '" + topic + "'' subscribed !");
        } else {
          robot.logger.info("Topic '" + topic + "' subscribed with callback_id '" + callback_id + "' !");
        }
      } else {
        if (msg) {
          msg.send("Callback id not provided subscribing to topic '" + topic + "', but is mandatory !");
        } else {
          robot.logger.error("Callback id not provided subscribing to topic '" + topic + "', but is mandatory !");
        }
      }
    } else { 
      if (msg) {
        msg.send("Not connected to MQTT broker, couldn't subscribe to topic '" + topic + "' !");
      } else {
        robot.logger.error("Not connected to MQTT broker, couldn't subscribe to topic '" + topic + "' with callback_id '" + callback_id + "' !");
      }
    }
  });
};
