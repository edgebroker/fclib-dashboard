function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name : stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label : stream.fullyQualifiedName().replace(/\./g, "/")+"/Probe/"+this.props["probename"],
        type : "multivalue",
        fields: ["Open Requests"]
    };
    this.updateIntervalSec = this.props["updateintervalsec"];
    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: [0]
        }
    };

    stream.create().memory(this.compid+"_messages").heap().limit().count(this.props["maxopenrequests"]).sliding();
    stream.memory(this.compid+"_messages").createIndex(this.props["correlationproprequest"]);

    stream.create().timer(this.compid+"_at_the_minute_starter").next().beginOfMinute().onTimer(function (t) {
        stream.create().timer(self.compid+"_update").interval().seconds(self.updateIntervalSec).onTimer(function (timer) {
            sendUpdate();
        }).start();
    });

    function sendUpdate() {
        self.msg.body.values[0] = stream.memory(self.compid+"_messages").size();
        self.msg.eventtype = "update";
        self.msg.body.time = time.currentTime();
        stream.output(self.streamname).send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(self.msg))
        );
        self.executeOutputLink("Out", self.msg);
    }

    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            self.msg.eventtype = "init";
            self.msg.body.time = time.currentTime();
            out.send(
                stream.create().message()
                    .textMessage()
                    .property("streamdata").set(true)
                    .property("streamname").set(self.streamname)
                    .body(JSON.stringify(self.msg))
            );
            out.close();
        });
}