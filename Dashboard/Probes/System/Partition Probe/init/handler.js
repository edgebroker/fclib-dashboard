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
    this.partitionName = stream.getWorkingDirectory();
    this.total = os.totalSpace(this.partitionName);
    this.totalprev = 0;
    this.used = this.total - os.unallocatedSpace(this.partitionName);
    this.usedprev = 0;
    this.unitdiv = 0;

    switch (this.props["unit"]) {
        case "MB":
            this.unitdiv = 1024 * 1024;
            break;
        case "GB":
            this.unitdiv = 1024 * 1024 * 1024;
            break;
    }

    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: [0, 0, 0]
        }
    };

    function sendUpdate(type, output) {
        self.msg.eventtype = type;
        self.msg.body.time = time.currentTime();
        self.msg.body.values[0] = Math.round((self.total-self.used) / self.unitdiv);
        self.msg.body.values[1] = Math.round(self.used / self.unitdiv);
        self.msg.body.values[2] = Math.round(self.total / self.unitdiv);
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
        self.total = os.totalSpace(self.partitionName);
        self.used = self.total - os.unallocatedSpace(self.partitionName);
        if (self.totalprev !== self.total || self.usedprev !== self.used) {
            sendUpdate("update", stream.output(self.streamname));
            self.totalprev = self.total;
            self.usedprev = self.used;
        }
    });


    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
}