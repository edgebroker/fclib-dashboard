function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Probe/" + this.props["probename"],
        type: "multivalue",
        fields: ["Free", "Used", "Total"]
    };
    this.free = 0;
    this.used = 0;
    this.max = 0;

    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: [0, 0, 0]
        }
    };

// Management Input to get the count
stream.create().input(".env/router-memory-list/" + stream.routerName()).management()
    .include("free-memory total-memory")
    .onChange(function (input) {
        self.max = input.current().property("total_memory").value().toLong();
        self.free = input.current().property("free_memory").value().toLong();
        self.used = self.max - self.free;
    });

    function sendUpdate(type, output) {
        self.msg.eventtype = type;
        self.msg.body.time = time.currentTime();
        self.msg.body.values[0] = Math.round(self.free / 1024);
        self.msg.body.values[1] = Math.round(self.used / 1024);
        self.msg.body.values[2] = Math.round(self.max / 1024);
        output.send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(self.msg))
        );
        self.executeOutputLink("Out", self.msg);
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
            sendUpdate("update", stream.output(self.streamname));
    });


    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
}