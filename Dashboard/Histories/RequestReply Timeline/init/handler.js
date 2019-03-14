function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_timeline_" + this.props["timelinename"];
    this.sharedQueue = this.flowcontext.getFlowQueue();
    this.updateIntervalSec = this.props["updateintervalsec"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_timeline_" + this.props["timelinename"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Timeline/" + this.props["timelinename"],
        type: "timeline"
    };
    this.msHist = this.props["historyhours"] * 60 * 60 * 1000;
    this.startupTime = time.currentTime();
    this.currentId = 0;
    this.groupProp = this.props["correlationproprequest"];

    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname).topic();

    stream.create().memory(this.compid+"_active").sharedQueue(this.sharedQueue).createIndex(this.groupProp).createIndex("_id");

    stream.create().memoryGroup(this.compid+"_history", this.groupProp).onCreate(function (key) {
        stream.create().memory(key + "_"+self.compid+"_hist").sharedQueue(self.sharedQueue).orderBy("activated").createIndex("_id");
        return stream.memory(key + "_" + self.compid+"_hist");
    });

    this.nextId = function() {
        if (self.currentId === Number.MAX_VALUE)
            self.currentId = 0;
        else
            self.currentId++;
        return self.startupTime + "-" + self.currentId;
    };

    this.store = function(key) {
        var mem = stream.memory(self.compid+"_active").index(self.groupProp).get(key);
        if (mem.size() === 0) {
            var msg = stream.create().message().message();
            msg.property("_id").set(self.nextId());
            msg.property(self.groupProp).set(key);
            var timeStamp = time.currentTime();
            msg.property("activated").set(timeStamp);
            stream.memory(self.compid+"_active").add(msg);
            sendUpdate(key, "open", timeStamp, timeStamp, timeStamp);
        }
    };

    this.deactivated = function(key) {
        var mem = stream.memory(self.compid+"_active").index(self.groupProp).get(key);
        if (mem.size() > 0) {
            var first = mem.first();
            var activated = first.property("activated").value().toLong();
            var timeStamp = time.currentTime();
            first.property("deactivated").set(timeStamp);
            stream.memoryGroup(self.compid+"_history").add(first);
            stream.memory(self.compid+"_active").index(self.groupProp).remove(key);
            sendUpdate(key, "close", activated, activated, timeStamp);
        }
    };

    function sendUpdate(key, event, currentStart, start, end) {
        var msg = {
            msgtype: "stream",
            streamname: self.streamname,
            eventtype: "update",
            body: {
                event: event,
                key: key,
                currentStart: currentStart,
                start: start,
                end: end
            }
        };
        stream.output(self.streamname).send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(msg))
        );
    };

    function sendTick(min, max) {
        var msg = {
            msgtype: "stream",
            streamname: self.streamname,
            eventtype: "update",
            body: {
                event: "tick",
                min: min,
                max: max
            }
        };
        stream.output(self.streamname).send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(msg))
        );
    }

    function updateTime(updates, mem, activated) {
        for (var i = 0; i < updates.length; i++) {
            var updateMem = mem.index("_id").get(updates[i]);
            var msg = updateMem.first();
            mem.index("_id").remove(updates[i]);
            msg.property("activated").set(activated);
            mem.add(msg);
        }
    }

    stream.create().timer(this.compid+"_update").interval().seconds(this.updateIntervalSec).onTimer(function (timer) {
        var current = time.currentTime();
        var timeout = current - self.msHist;
        var updates = [];

        stream.memory(self.compid+"_active").forEach(function (message) {
            var key = message.property(self.groupProp).value().toObject();
            var activated = message.property("activated").value().toLong();
            sendUpdate(key, "update", activated, Math.max(activated, timeout), current);
            if (activated < timeout)
                updates.push(message.property("_id").value().toObject());
        });
        updateTime(updates, stream.memory(self.compid+"_active"), timeout);
        updates = [];

        stream.memoryGroup(self.compid+"_history").forEach(function (mem) {
            mem.forEach(function (message) {
                var key = message.property(self.groupProp).value().toObject();
                var activated = message.property("activated").value().toLong();
                var deactivated = message.property("deactivated").value().toLong();
                if (deactivated < timeout)
                    sendUpdate(key, "remove", activated, activated, deactivated);
                else if (activated < timeout) {
                    sendUpdate(key, "update", activated, timeout, deactivated);
                    updates.push(message.property("_id").value().toObject());
                }
            });
            mem.remove("deactivated < " + timeout);
            updateTime(updates, mem, timeout);
            updates = [];
        });

        sendTick(timeout, current);
    });

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            var msg = {
                msgtype: "stream",
                streamname: self.streamname,
                eventtype: "init",
                body: {
                    min: time.currentTime() - self.msHist,
                    max: time.currentTime(),
                    data: []
                }
            };
            stream.memoryGroup(self.compid+"_history").forEach(function (mem) {
                mem.forEach(function (message) {
                    var key = message.property(self.groupProp).value().toObject();
                    var activated = message.property("activated").value().toLong();
                    var deactivated = message.property("deactivated").value().toLong();
                    msg.body.data.push([key, activated, deactivated]);
                });
            });
            stream.memory(self.compid+"_active").forEach(function (message) {
                var key = message.property(self.groupProp).value().toObject();
                var activated = message.property("activated").value().toLong();
                var deactivated = time.currentTime();
                msg.body.data.push([key, activated, deactivated]);
            });
            out.send(stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(msg))
            );
            out.close();
        });
}