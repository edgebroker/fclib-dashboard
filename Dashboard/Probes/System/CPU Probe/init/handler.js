function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Probe/" + this.props["probename"],
        type: "multivalue",
        fields: ["Usage"]
    };

    this.cpu = os.processCpuLoad();
    this.cpuprev = 0;

    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: [0]
        }
    };

    function sendUpdate(type, output) {
        self.msg.eventtype = type;
        self.msg.body.time = time.currentTime();
        self.msg.body.values[0] = self.cpu;
        output.send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(self.msg))
        );
    }

    // Init Requests
    stream.create().input(self.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendUpdate("init", out);
            out.close();
        });

    // Update timer
    stream.create().timer(this.compid).interval().seconds(this.props["updateintervalsec"]).onTimer(function (timer) {
        self.cpu = os.processCpuLoad();
        if (self.cpuprev !== self.cpu) {
            sendUpdate("update", stream.output(self.streamname));
            self.cpuprev = self.cpu;
        }
    });

    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
}