function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Probe/" + this.props["probename"],
        type: "multivalue",
        fields: ["Non Durable", "Durable"]
    };
    this.durcount = 0;
    this.durprev = 0;
    this.nondurcount = 0;
    this.nondurprev = 0;

    this.msg = {
        msgtype: "stream",
        streamname: self.streamname,
        eventtype: null,
        body: {
            time: null,
            values: [0, 0]
        }
    };

    // Management Input to get the Subscriber count
    stream.create().input("sys$topicmanager/usage/subscriber").management()
        .onAdd(function (input) {
            self.nondurcount++;
        })
        .onRemove(function (input) {
            self.nondurcount--;
        });

    // Management Input to get the Durable count
    stream.create().input("sys$topicmanager/usage/durables").management()
        .onAdd(function (input) {
            self.durcount++;
        })
        .onRemove(function (input) {
            self.durcount--;
        });

    function sendUpdate(type, output) {
        self.msg.eventtype = type;
        self.msg.body.time = time.currentTime();
        self.msg.body.values[0] = self.nondurcount - self.durcount;
        self.msg.body.values[1] = self.durcount;
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
        if (self.durprev !== self.durcount || self.nondurprev !== self.nondurcount) {
            sendUpdate("update", stream.output(self.streamname));
            self.durprev = self.durcount;
            self.nondurprev = self.nondurcount;
        }
    });

    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
}