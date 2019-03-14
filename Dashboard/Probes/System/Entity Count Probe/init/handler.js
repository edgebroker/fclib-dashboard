function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Probe/" + this.props["probename"],
        type: "multivalue",
        fields: ["Count"]
    };
    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: [0]
        }
    };
    this.count = 0;
    this.prev = -1;

    this.selector = null;
    if (this.props["context"].indexOf("sys$queuemanager") !== -1)
        this.selector = "name not like 'tpc$%'";

    // Management Input to get the count
    stream.create().input(this.props["context"]).management().selector(self.selector)
        .onAdd(function (input) {
            self.count++;
        })
        .onRemove(function (input) {
            self.count--;
        });

    function sendUpdate(type, output) {
        self.msg.eventtype = type;
        self.msg.body.time = time.currentTime();
        self.msg.body.values[0] = self.count;
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
        if (self.prev !== self.count) {
            sendUpdate("update", stream.output(self.streamname));
            self.prev = self.count;
        }
    });


    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
}