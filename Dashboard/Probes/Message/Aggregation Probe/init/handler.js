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
    this.resetInterval = this.props["resetinterval"];
    this.func = this.props["func"];
    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: []
        }
    };
    this.count = 0;
    this.averagevals = [];

    reset();

    stream.create().timer(this.compid+"_at_the_minute_starter").next().beginOfMinute().onTimer(function (t) {
        stream.create().timer(self.compid+"_update").interval().seconds(self.updateIntervalSec).onTimer(function (timer) {
            sendUpdate();
        }).start();
    });

    switch (this.resetInterval) {
        case "second":
            stream.create().timer(self.compid+"_reset").next().beginOfSecond().onTimer(function (t) {
                reset();
                stream.create().timer(self.compid+"_reset2").interval().seconds(1).onTimer(function (timer) {
                    reset();
                }).start();
            });
            break;
        case "minute":
            stream.create().timer(self.compid+"_reset").next().beginOfMinute().onTimer(function (t) {
                reset();
                stream.create().timer(self.compid+"_reset2").interval().minutes(1).onTimer(function (timer) {
                    reset();
                }).start();
            });
            break;
        case "hour":
            stream.create().timer(self.compid+"_reset").next().beginOfHour().onTimer(function (t) {
                reset();
                stream.create().timer(self.compid+"_reset2").interval().hours(1).onTimer(function (timer) {
                    reset();
                }).start();
            });
            break;
        case "day":
            stream.create().timer(self.compid+"_reset").next().beginOfDay().onTimer(function (t) {
                reset();
                stream.create().timer(self.compid+"_reset2").interval().days(1).onTimer(function (timer) {
                    reset();
                }).start();
            });
            break;
        default:
            break;
    }

    function reset() {
        for (var i = 0; i < self.props["properties"].length; i++) {
            self.msg.body.values[i] = self.func === "min"?Number.MAX_VALUE:0;
            self.averagevals[i] = 0;
        }
        self.count = 0;
    }

    this.handleMessage = function(message){
        self.count++;
        if (self.func === "count") {
            self.msg.body.values[0] = self.count;
        } else {
            for (var i = 0; i < self.props["properties"].length; i++) {
                if (!self.assertProperty(message, self.props["properties"][i]))
                    return;
                var value = message.property(self.props["properties"][i]).value().toString();
                if (value.indexOf(",") !== 0)
                    message.property(self.props["properties"][i]).set(value.replace(/,/g,""));
                value = message.property(self.props["properties"][i]).value().toLong();
                switch (self.func) {
                    case "min":
                        self.msg.body.values[i] = Math.min(self.msg.body.values[i], value);
                        break;
                    case "max":
                        self.msg.body.values[i] = Math.max(self.msg.body.values[i], value);
                        break;
                    case "sum":
                        self.msg.body.values[i] += value;
                        break;
                    case "average":
                        self.averagevals[i] += value;
                        self.msg.body.values[i] = Math.round(self.averagevals[i]/self.count);
                        break;
                }
            }
        }
    }.bind(this);

    function sendUpdate() {
        self.msg.eventtype = "update";
        self.msg.body.time = time.currentTime();
        stream.output(self.streamname).send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(self.msg))
        );
        self.executeOutputLink("Out", self.msg);
    }

    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            self.msg.eventtype = "init";
            self.msg.body.time = time.currentTime();
            out.send(
                stream.create().message()
                    .textMessage()
                    .property("streamdata").set(true)
                    .property("streamname").set(self.streamname)
                    .body(JSON.stringify(self.msg))
            );
            out.close();
        });
}