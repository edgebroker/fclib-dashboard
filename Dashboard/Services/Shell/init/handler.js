function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_shell_" + this.props["shellname"];
    this.sharedQueue = this.flowcontext.getFlowQueue();
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_shell_" + this.props["shellname"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Shell/" + this.props["shellname"],
        type: "service"
    };
    var Util = Java.type("com.swiftmq.util.SwiftUtilities");
    var JAVA_INTEGER = Java.type("java.lang.Integer");
    var WIDTH_L = 20;
    var WIDTH_R = 50;
    var INTEGER = /^\d+$/;
    var IDENTIFIER = /^([a-zA-Z_][a-zA-Z\d_]*)$/;
    var DESTINATION = /^([a-zA-Z_.%$][a-zA-Z\d_.%$]*)$/;
    var HOWTO = ['Result:',
        'HOW TO EXECUTE COMMANDS',
        '\n',
        'Commands may have parameters which are delimited by a blank:',
        '\n',
        '  cmd parm1 parm2 parm3',
        '\n',
        'If a parameter contains blanks, double quote it:',
        '\n',
        '  cmd "parm with blank"',
        '\n',
        'If a parameter contains double quotes, use 2 double quotes for each double quote:',
        '\n',
        '  cmd "parm ""with"" blank"',
        '\n',
        'Optional parameters are shown as [<parm>]. If the optional parameter should not be set,',
        'specify a "-" instead:',
        '\n',
        '  cmd - parm2 parm3',
        '\n',
        'Parameters shown as <param> are mandatory.'
    ];

    var shellCommands = [
        "Result:",
        field("Command", WIDTH_L, ' ') + "| " + field("Description", WIDTH_R, ' '),
        field("", WIDTH_L + WIDTH_R + 2, '-'),
        field("howto", WIDTH_L, ' ') + "| " + field("How to execute commands", WIDTH_R, ' '),
        field("help", WIDTH_L, ' ') + "| " + field("Show available commands", WIDTH_R, ' '),
        field("getcommandmeta", WIDTH_L, ' ') + "| " + field("Returns the meta data for a command", WIDTH_R, ' '),
        field("  <command>", WIDTH_L, ' ') + "| " + field("Command name", WIDTH_R, ' ')
    ];


    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname).topic();

    stream.create().memory(this.compid + "_commands").heap().createIndex("command");

    // Init Requests
    stream.create().input(this.compid + "_initrequests").topic().destinationName(this.streamname).selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendInit(out, input.current().correlationId());
            out.close();
        });

    // Command Requests
    stream.create().input(this.compid + "_commandrequests").topic().destinationName(this.streamname).selector("commandrequest = true")
        .onInput(function (input) {
            stream.log().info("Received command: " + input.current().body());
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            executeCommand(out, input.current());
            out.close();
        });

    this.registerCommand = function (request) {
        var command = request.property("command").value().toString();
        var description = request.property("description").value().toString();
        var parms = request.property("parameters").exists() ? request.property("parameters").value().toString() : "[]";
        var msg = stream.create().message().message()
            .property("command").set(command)
            .property("description").set(description)
            .property("parameters").set(parms);
        stream.memory(self.compid + "_commands").add(msg);
    };

    this.unregisterCommand = function (request) {
        var command = request.property("command").value().toString();
        stream.memory(self.compid + "_commands").index("command").remove(command);
    };


    function help() {
        var s = shellCommands.slice();
        stream.memory(self.compid + "_commands").forEach(function (msg) {
            var command = msg.property("command").value().toString();
            s.push(field(command, WIDTH_L, ' ') + "| " + field(msg.property("description").value().toString(), WIDTH_R, ' '));
            var parms = JSON.parse(msg.property("parameters").value().toString());
            parms.forEach(function (parm) {
                var skey = "<" + parm.name + ">";
                var cmd = "  " + (parm.mandatory ? skey : "[" + skey + "]");
                var description = parm.description;
                if (parm.validator) {
                    switch (parm.validator.type) {
                        case "choice":
                            description += ": " + Util.concat(parm.validator.values, " | ");
                            break;
                    }
                }
                s.push(field(cmd, WIDTH_L, ' ') + "| " + field("  " + description, WIDTH_R, ' '));
            });
        });
        return s;
    }

    function getCommandMeta(cmd) {
        if (cmd.length !== 2)
            throw "Invalid number of parameters for this command: " + cmd[0];
        var command = stream.memory(self.compid + "_commands").index("command").get(cmd[1]);
        if (command.size() === 0)
            throw "Command not found: " + cmd[1];
        command = command.first();
        var meta = {
            command: command.property("command").value().toString(),
            description: command.property("description").value().toString(),
            parameters: JSON.parse(command.property("parameters").value().toString())
        };
        return ["Result:", JSON.stringify(meta)];
    }

    function field(s, length, c) {
        var res = s;
        for (var i = s.length; i < length; i++)
            res += c;
        return res;
    }

    function validate(value, parm) {
        if (!parm.validator)
            return value;
        var converted = value;
        switch (parm.validator.type) {
            case "integer":
                if (!INTEGER.test(value))
                    throw "Value '" + value + "' is not an valid integer!";
                if (parm.converttotype)
                    converted = JAVA_INTEGER.valueOf(value);
                break;
            case "boolean":
                if (parm.converttotype)
                    converted = value === "true";
                break;
            case "identifier":
                if (!IDENTIFIER.test(value))
                    throw "Value '" + value + "' is not an valid identifier (digits, characters and _ are allowed)!";
                break;
            case "destination":
                if (!DESTINATION.test(value))
                    throw "Value '" + value + "' is not a valid destination (digits, characters, _ . % $ are allowed)!";
                break;
            case "choice":
                var found = false;
                for (var i = 0; i < parm.validator.values.length; i++) {
                    if (value === parm.validator.values[i]) {
                        found = true;
                        break;
                    }
                }
                if (!found)
                    throw "Value '" + value + "' is invalid! Allowed are: " + JSON.stringify(parm.validator.values);
                break;
        }
        return converted;
    }

    function fillParameters(cmd, parms) {
        var result = [];
        if (cmd.length - 1 !== parms.length)
            throw "Invalid number of parameters for this command: " + cmd[0];
        if (cmd.length === 1) {
            return result;
        }
        for (var i = 1; i < cmd.length; i++) {
            if (cmd[i] === "-") {
                if (parms[i - 1].mandatory)
                    throw "Parameter '" + parms[i - 1].name + "' is mandatory!";
                result.push({name: parms[i - 1].name, value: "-"});
            } else {
                result.push({name: parms[i - 1].name, value: validate(cmd[i], parms[i - 1])});
            }
        }
        return result;
    }

    function forwardCommand(cmd, cmdMsg) {
        var mem = stream.memory(self.compid + "_commands").index("command").get(cmd[0]);
        if (mem.size() === 0)
            return ["Error:", "Unknown command: " + cmd[0]];

        try {
            var parms = JSON.parse(stream.memory(self.compid + "_commands").index("command").get(cmd[0]).first().property("parameters").value().toString());
            var result = fillParameters(cmd, parms);
            var fwdMsg = stream.create().message().textMessage()
                .replyTo(cmdMsg.replyTo())
                .correlationId(cmdMsg.correlationId())
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .property("command").set(cmd[0]);
            result.forEach(function(keyval){
                fwdMsg.property(keyval.name).set(keyval.value);
            });
            self.executeOutputLink(cmd[0], fwdMsg);
        } catch (e) {
            return ["Error:", e];
        }
        return null;
    }

    function sendInit(output, id) {
        var msg = {
            msgtype: "servicereply",
            streamname: self.streamname,
            eventtype: "init",
            body: {
                time: time.currentTime(),
                message: ["Welcome to " + self.props["shellname"] + " shell!",
                    "Enter shell command or type 'help' to get a list of available commands."]
            }
        };
        output.send(
            stream.create().message()
                .textMessage()
                .correlationId(id)
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(msg))
        );
    }

    function executeCommand(output, cmdMsg) {
        var msg = {
            msgtype: "servicereply",
            streamname: self.streamname,
            eventtype: "commandresult",
            body: {
                time: time.currentTime(),
                message: null
            }
        };
        var id = cmdMsg.correlationId();
        var request = JSON.parse(cmdMsg.body());
        var result;
        var handled = true;
        try {
            var cmd = Util.parseCLICommand(request.command);
            switch (cmd[0]) {
                case "howto":
                    result = HOWTO;
                    break;
                case "help":
                    result = help();
                    break;
                case "getcommandmeta":
                    result = getCommandMeta(cmd);
                    break;
                default:
                    result = forwardCommand(cmd, cmdMsg);
                    handled = result !== null;
                    break;
            }
        } catch (e) {
            handled = true;
            result = ["Error:", e];
        }
        if (handled) {
            msg.body.message = result;
            output.send(
                stream.create().message()
                    .textMessage()
                    .correlationId(id)
                    .property("streamdata").set(true)
                    .property("streamname").set(self.streamname)
                    .body(JSON.stringify(msg))
            );
        }
    }
}