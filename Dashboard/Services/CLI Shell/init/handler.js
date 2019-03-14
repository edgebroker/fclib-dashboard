function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_shell_" + this.props["shellname"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_shell_" + this.props["shellname"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Shell/" + this.props["shellname"],
        type: "service"
    };

    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname).topic();

    // Admin role is required, otherwise a dashboard user can administrate the whole router!
    stream.cli().adminRole(this.props["adminrole"]);

    function sendInit(output, id) {
        var msg = {
            msgtype: "servicereply",
            streamname: self.streamname,
            eventtype: "init",
            body: {
                time: time.currentTime(),
                message: ["Welcome to " + self.props["shellname"] + "@" + stream.routerName() + "!",
                    "Access is limited and protected by admin role: " + self.props["adminrole"],
                    "Enter CLI command or type 'help' to get a list of available commands."]
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

    function executeCommand(output, id, request) {
        var msg = {
            msgtype: "servicereply",
            streamname: self.streamname,
            eventtype: "commandresult",
            body: {
                time: time.currentTime(),
                message: null
            }
        };
        var result = stream.cli()
            .exceptionOff()
            .execute("cc " + request.context)
            .executeWithResult(request.command);
        msg.body.message = JSON.parse(result);
        output.send(
            stream.create().message()
                .textMessage()
                .correlationId(id)
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(msg))
        );
    }

    // Init Requests
    stream.create().input(this.compid+"_initrequests").topic().destinationName(this.streamname).selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendInit(out, input.current().correlationId());
            out.close();
        });

    // Command Requests
    stream.create().input(this.compid+"_commandrequests").topic().destinationName(this.streamname).selector("commandrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            executeCommand(out, input.current().correlationId(), JSON.parse(input.current().body()));
            out.close();
        });
}