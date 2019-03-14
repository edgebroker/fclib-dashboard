function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_probe_" + this.props["probename"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Probe/" + this.props["probename"],
        type: "multivalue",
        fields: ["AMQP", "JMS", "MQTT", "RT"]
    };
    this.jmscount = 0;
    this.jmsprev = 0;
    this.amqpcount = 0;
    this.amqpprev = 0;
    this.mqttcount = 0;
    this.mqttprev = 0;
    this.rtcount = 0;
    this.rtprev = 0;

    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            values: [0, 0, 0, 0]
        }
    };

    // Management Input to get the JMS count
    stream.create().input("sys$jms/usage").management()
        .onAdd(function (input) {
            self.jmscount++;
        })
        .onRemove(function (input) {
            self.jmscount--;
        });

    // Management Input to get the AMQP count
    stream.create().input("sys$amqp/usage").management()
        .onAdd(function (input) {
            self.amqpcount++;
        })
        .onRemove(function (input) {
            self.amqpcount--;
        });

    // Management Input to get the RT count
    stream.create().input("sys$mqtt/usage/connections").management()
        .onAdd(function (input) {
            self.mqttcount++;
        })
        .onRemove(function (input) {
            self.mqttcount--;
        });

    // Management Input to get the RT count
    stream.create().input("sys$routing/usage/connections").management()
        .onAdd(function (input) {
            self.rtcount++;
        })
        .onRemove(function (input) {
            self.rtcount--;
        });

    function sendUpdate(type, output) {
        self.msg.eventtype = type;
        self.msg.body.time = time.currentTime();
        self.msg.body.values[0] = self.amqpcount;
        self.msg.body.values[1] = self.jmscount;
        self.msg.body.values[2] = self.mqttcount;
        self.msg.body.values[3] = self.rtcount;
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
        if (self.jmsprev !== self.jmscount || self.amqpprev !== self.amqpcount || self.mqttprev !== self.mqttcount || self.rtprev !== self.rtcount) {
            sendUpdate("update", stream.output(self.streamname));
            self.jmsprev = self.jmscount;
            self.amqpprev = self.amqpcount;
            self.mqttprev = self.mqttcount;
            self.rtprev = self.rtcount;
        }
    });


    stream.create().output(this.streamname).topic();
    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
}