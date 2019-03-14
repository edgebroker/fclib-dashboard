function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_monitor_" + this.props["panelname"];
    this.sharedQueue = this.flowcontext.getFlowQueue();
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_monitor_" + this.props["panelname"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Monitor/" + this.props["panelname"],
        type: "monitor"
    };

    stream.create().memoryGroup(this.compid+"_messages", "name").inactivityTimeout().days(this.props["retiredays"]).onCreate(function (key) {
        stream.create().memory(key+"_"+self.compid).sharedQueue(self.sharedQueue).limit().count(self.props["historysize"]).limit().time().days(self.props["retiredays"]);
        return stream.memory(key+"_"+self.compid);
    });

    stream.create().timer(this.compid+"_checklimit").interval().hours(1).onTimer(function (timer) {
        stream.memoryGroup(self.compid+"_messages").checkLimit();
    });

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendInit(out);
            out.close();
        });
    
    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();

    function sendInit(output) {
        var msg = {
            msgtype: "stream",
            streamname: self.streamname,
            eventtype: "init",
            body: {
                routername: stream.routerName(),
                histsize: self.props["historysize"],
                time: time.currentTime(),
                values: {}
            }
        };
        stream.memoryGroup(self.compid+"_messages").forEach(function (memory) {
            var entry = [];
            memory.reverse().forEach(function (message) {
                entry.push(JSON.parse(message.body()));
            });
            if (entry.length > 0)
                msg.body.values[memory.name()] = entry;
        });
        output.send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(msg))
        );
    }

    this.sendUpdate = function(output, message) {
        var msg = {
            msgtype: "stream",
            streamname: self.streamname,
            eventtype: "update",
            body: {
                routername: stream.routerName(),
                time: time.currentTime(),
                value: JSON.parse(message.body())
            }
        };
        output.send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(msg))
        );
    }.bind(this);
}