function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Probe/" + this.props["probename"],
        type: "multivalue",
        fields: this.props["fieldlabels"]
    };
    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: []
        }
    };

    for (var i = 0; i < this.props["properties"].length; i++) {
        this.msg.body.values[i] = 0;
    }

    // Test the context
    stream.cli().execute("cc "+this.props["context"]);

    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();

    function sendUpdate(type, output, force) {
        var changed = false;
        for (var i = 0; i < self.props["properties"].length; i++) {
            var value = stream.cli().sumProperty(self.props["context"], self.props["properties"][i]);
            if (self.msg.body.values[i] !== value) {
                self.msg.body.values[i] = value;
                changed = true;
            }
        }
        if (changed || force) {
            self.msg.eventtype = type;
            self.msg.body.time = time.currentTime();
            output.send(
                stream.create().message()
                    .textMessage()
                    .property("streamdata").set(true)
                    .property("streamname").set(self.streamname)
                    .body(JSON.stringify(self.msg))
            );
            self.executeOutputLink("Out", self.msg);
        }
    }

    stream.create().timer(this.compid).interval().seconds(this.props["updateintervalsec"]).onTimer(function (timer) {
        sendUpdate("update", stream.output(self.streamname), false);
    });

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendUpdate("init", out, true);
            out.close();
        });

}