function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Probe/" + this.props["probename"],
        type: "multivalue",
        fields: ["Regular", "Tmp", "Sys"]
    };
    this.regcount = 0;
    this.regprev = 0;
    this.tmpcount = 0;
    this.tmpprev = 0;
    this.syscount = 0;
    this.sysprev = 0;

    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: [0, 0, 0]
        }
    };

    // Management Input to get the Queue usage count
    stream.create().input("sys$queuemanager/usage").management().selector("name not like 'tpc$%'")
        .onAdd(function (input) {
            var name = input.current().property("name").value().toString();
            if (name.startsWith("tmp$"))
                self.tmpcount++;
            else if (name.indexOf("$") !== -1 ||
                name.startsWith("swiftmq") || name.startsWith("streams_") ||
                name.startsWith("unroutable") || name.startsWith("routerdlq"))
                self.syscount++;
            else
                self.regcount++;
        })
        .onRemove(function (input) {
            var name = input.current().property("name").value().toString();
            if (name.startsWith("tmp$"))
                self.tmpcount--;
            else if (name.indexOf("$") !== -1 ||
                name.startsWith("swiftmq") || name.startsWith("streams_") ||
                name.startsWith("unroutable") || name.startsWith("routerdlq"))
                self.syscount--;
            else
                self.regcount--;
        });

    function sendUpdate(type, output) {
        self.msg.eventtype = type;
        self.msg.body.time = time.currentTime();
        self.msg.body.values[0] = self.regcount;
        self.msg.body.values[1] = self.tmpcount;
        self.msg.body.values[2] = self.syscount;
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
        if (self.regprev !== self.regcount || self.tmpprev !== self.tmpcount || self.sysprev !== self.syscount) {
            sendUpdate("update", stream.output(self.streamname));
            self.regprev = self.regcount;
            self.tmpprev = self.tmpcount;
            self.sysprev = self.syscount;
        }
    });

    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
}