function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name : stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label : stream.fullyQualifiedName().replace(/\./g, "/")+"/Probe/"+this.props["probename"],
        type : "multivalue",
        fields: this.props["fieldlabels"]
    };
    this.updateIntervalSec = this.props["updateintervalsec"];

    this.cnt1 = 0;
    this.cnt2 = 0;

    stream.create().timer(self.compid+"_update").interval().seconds(self.updateIntervalSec).onTimer(function (timer) {
        sendUpdate();
    });

    function sendUpdate() {
        var msg = {
                msgtype: "stream",
                streamname: self.streamname,
                eventtype: "update",
                body: {
                    time: time.currentTime(),
                    values: [self.cnt1, self.cnt2]
                }
            };
        stream.output(self.streamname).send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(msg))
        );
        self.executeOutputLink("Out", msg);
        self.cnt1 = 0;
        self.cnt2 = 0;
    }

    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            var msg = {
                  msgtype: "stream",
                  streamname: self.streamname,
                  eventtype: "init",
                  body: {
                      time: time.currentTime(),
                      values: [self.cnt1, self.cnt2]
                  }
              };
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            out.send(
                stream.create().message()
                    .textMessage()
                    .property("streamdata").set(true)
                    .property("streamname").set(self.streamname)
                    .body(JSON.stringify(msg))
            );
            out.close();
        });
}