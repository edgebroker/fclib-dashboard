function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_location_" + this.props["historyname"];
    var sharedQueue = this.flowcontext.getFlowQueue();
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name : stream.fullyQualifiedName().replace(/\./g, "_") + "_location_" + this.props["historyname"],
        label : stream.fullyQualifiedName().replace(/\./g, "/")+"/Location/"+this.props["historyname"],
        type : "location"
    };

    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname).topic();

    stream.create().memory(this.compid+"-history")
        .heap()
        .createIndex("id")
        .limit()
        .time()
        .tumbling()
        .hours(this.props["inactivitytimeout"]);
    this.history = stream.memory(this.compid+"-history");

    this.add = function(msg) {
        var old = self.history.index("id").get(msg.property("id").value().toObject());
        if (self.history.size() < self.props["maxassets"] || old.size() > 0) {
            if (old.size() > 0) {
                var oldMsg = old.first();
                if (oldMsg.property("long").value().toObject() !== msg.property("long").value().toObject() ||
                    oldMsg.property("lat").value().toObject() !== msg.property("lat").value().toObject()) {
                    self.history.index("id").remove(msg.property("id").value().toObject());
                    msg.property("_dirty").set(true);
                    self.history.add(msg);
                }
            } else {
                msg.property("_dirty").set(true);
                self.history.add(msg);
            }
        }
    };

    stream.create().timer(this.compid + "_checklimit").interval().seconds(this.props["updateintervalsec"]).onTimer(function (timer) {
        // Send updates, move updates to history
        send("update", self.history, stream.output(self.streamname));

        // Check limit on history
        self.history.checkLimit();
    });

    // Init Requests
    stream.create().input(this.compid + "_initrequests").topic().destinationName(this.streamname).selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            send("init", self.history, out);
            out.close();
        });

    function send(type, mem, out) {
        var msg = {
            msgtype: "stream",
            streamname: self.streamname,
            eventtype: type,
            body: {
                apikey: self.props["apikey"],
                assets: []
            }
        };
        var driving = 0;
        var stopped = 0;
        var hasSpeed = false;
        mem.forEach(function(posMsg){
            if (posMsg.property("_dirty").value().toBoolean() || type === "init") {
                var json = {
                    id: posMsg.property("id").value().toObject(),
                    label: posMsg.property("label").value().toObject(),
                    long: posMsg.property("long").value().toObject(),
                    lat: posMsg.property("lat").value().toObject(),
                    timestamp: posMsg.property("timestamp").value().toObject()
                };
                if (posMsg.property("speed").exists())
                    json.speed = posMsg.property("speed").value().toObject();
                msg.body.assets.push(json);
                posMsg.property("_dirty").set(false);
            } else {
                if (posMsg.property("speed").exists() &&  posMsg.property("speed").value().toDouble() > 0) {
                    posMsg.property("speed").set(0);
                    posMsg.property("_dirty").set(true);
                }
            }
            if (posMsg.property("speed").exists()){
                hasSpeed = true;
                if (posMsg.property("speed").value().toDouble() > 0)
                    driving++;
                else
                    stopped++;
            }
        });

        var updates = msg.body.assets.length;
        var maxAssets = self.props["maxassets"];
        if (msg.body.assets.length > 0 || type === "init") {
            out.send(
                stream.create().message()
                    .textMessage()
                    .property("streamdata").set(true)
                    .property("streamname").set(self.streamname)
                    .body(JSON.stringify(msg))
            );
        }
        var statMessage = stream.create().message().message();
        statMessage.property("updates").set(updates);
        statMessage.property("maxassets").set(maxAssets);
        if (hasSpeed === true) {
            statMessage.property("driving").set(driving);
            statMessage.property("stopped").set(stopped);
        }
        self.executeOutputLink("Statistic", statMessage);
    }
}
