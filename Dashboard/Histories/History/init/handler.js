function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_history_" + this.props["historyname"];
    var sharedQueue = this.flowcontext.getFlowQueue();
    this.updateIntervalSec = this.props["updateintervalsec"];
    this.continueLastValue = this.props["continue"];
    this.nvalues = this.props["fieldlabels"].length;
    this.func = this.props["func"];
    this.streamname_min = this.streamname + "_min";
    this.streamname_hour = this.streamname + "_hour";
    this.streamname_day = this.streamname + "_day";
    this.streamname_month = this.streamname + "_month";
    this.streamname_year = this.streamname + "_year";
    this.memory_sec = this.compid + "_second";
    this.memory_min = this.compid + "_minute";
    this.memory_hour = this.compid + "_hour";
    this.memory_day = this.compid + "_day";
    this.memory_month = this.compid + "_month";
    this.memory_year = this.compid + "_year";
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name : stream.fullyQualifiedName().replace(/\./g, "_") + "_history_" + this.props["historyname"],
        label : stream.fullyQualifiedName().replace(/\./g, "/")+"/History/"+this.props["historyname"],
        type : "history",
    	timeframes: ["min", "hour", "day", "month", "year"],
        fields: this.props["fieldlabels"],
        labely: this.props["labely"]
    };
    this.lastSecondUpdate = stream.create().message().message().persistent();
    this.lastSecondUpdate.property("time").set(time.currentTime());
    for (var i = 0; i < this.nvalues; i++)
        this.lastSecondUpdate.property("value" + i).set(0);

    this.initMsg = {
        msgtype: "stream",
        streamname: null,
        eventtype: "init",
        body: {
            type: null,
            columns: []
        }
    };

    this.updateMsg = {
        msgtype: "stream",
        streamname: null,
        eventtype: "update",
        body: {
            values: []
        }
    };

    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname_min).topic();
    stream.create().output(this.streamname_hour).topic();
    stream.create().output(this.streamname_month).topic();
    stream.create().output(this.streamname_day).topic();
    stream.create().output(this.streamname_year).topic();

    stream.create().memory(this.memory_sec)
        .sharedQueue(sharedQueue)
        .orderBy("time")
        .limit()
        .timeUnitChange()
        .seconds(this.updateIntervalSec)
        .onRetire(function (retired) {
            storeNextMemory(self.streamname_min, stream.memory(self.memory_min), retired, time.startOfSecond(time.currentTime(), 0));
        });

    stream.create().memory(this.memory_min)
        .sharedQueue(sharedQueue)
        .orderBy("time")
        .limit()
        .timeUnitChange()
        .minutes(1)
        .onRetire(function (retired) {
            storeNextMemory(self.streamname_hour, stream.memory(self.memory_hour), retired, time.startOfMinute(getTime(retired), 0));
        });

    stream.create().memory(this.memory_hour)
        .sharedQueue(sharedQueue)
        .orderBy("time")
        .limit()
        .timeUnitChange()
        .hours(1)
        .onRetire(function (retired) {
            storeNextMemory(self.streamname_day, stream.memory(self.memory_day), retired, time.startOfHour(getTime(retired), 0));
        });

    stream.create().memory(this.memory_day)
        .sharedQueue(sharedQueue)
        .orderBy("time")
        .limit()
        .timeUnitChange()
        .days(1)
        .onRetire(function (retired) {
            storeNextMemory(self.streamname_month, stream.memory(self.memory_month), retired, time.startOfDay(getTime(retired), 0));
        });

    stream.create().memory(this.memory_month)
        .sharedQueue(sharedQueue)
        .orderBy("time")
        .limit()
        .timeUnitChange()
        .months(1)
        .onRetire(function (retired) {
            storeNextMemory(self.streamname_year, stream.memory(self.memory_year), retired, time.startOfMonth(getTime(retired), 0));
        });

    stream.create().memory(this.memory_year)
        .sharedQueue(sharedQueue)
        .orderBy("time")
        .limit()
        .timeUnitChange()
        .years(1);

    stream.create().timer(this.compid + "_at_the_minute_starter").next().beginOfMinute().onTimer(function (t) {
        stream.create().timer(self.compid + "_secondupdate").interval().seconds(self.updateIntervalSec).onTimer(function (timer) {
            if (self.continueLastValue === false) {
                for (var i = 0; i < self.nvalues; i++)
                    self.lastSecondUpdate.property("value" + i).set(0);
            }
            self.lastSecondUpdate.property("time").set(time.currentTime());
            stream.memory(self.memory_sec).add(self.lastSecondUpdate);
            stream.memory(self.memory_sec).checkLimit();
        }).start();
        stream.create().timer(self.compid + "_memcheck1").interval().seconds(1).onTimer(function (timer) {
            stream.memory(self.memory_min).checkLimit();
        }).start();
        stream.create().timer(self.compid + "_memcheck2").interval().minutes(1).onTimer(function (timer) {
            stream.memory(self.memory_hour).checkLimit();
            stream.memory(self.memory_day).checkLimit();
            stream.memory(self.memory_month).checkLimit();
            stream.memory(self.memory_year).checkLimit();
        }).start();
    });

    stream.create().input(this.streamname_min).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendInit(self.streamname_min, stream.memory(self.memory_min), "minute", out);
            out.close();
        });
    stream.create().input(this.streamname_hour).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendInit(self.streamname_hour, stream.memory(self.memory_hour), "hour", out);
            out.close();
        });
    stream.create().input(this.streamname_day).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendInit(self.streamname_day, stream.memory(self.memory_day), "day", out);
            out.close();
        });
    stream.create().input(this.streamname_month).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendInit(self.streamname_month, stream.memory(self.memory_month), "month", out);
            out.close();
        });
    stream.create().input(this.streamname_year).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendInit(self.streamname_year, stream.memory(self.memory_year), "year", out);
            out.close();
        });

    function createTimeSeries(memCurrent) {
        var series = ["x"];
        memCurrent.forEach(function (message) {
            var time = message.property("time").value().toLong();
            series.push(time);
        });
        return series;
    }

    function createSeries(name, memCurrent, index) {
        var series = [name];
        memCurrent.forEach(function (message) {
            series.push(Math.round(message.property("value" + index).value().toDouble()));
        });
        return series;
    }

    function sendInit(streamName, memCurrent, type, out) {
        self.initMsg.streamname = streamName;
        self.initMsg.body.type = type;
        self.initMsg.body.columns = [createTimeSeries(memCurrent)];

        for (var i = 0; i < self.nvalues; i++) {
            self.initMsg.body.columns.push(createSeries("value" + i, memCurrent, i));
        }

        out.send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(streamName)
                .body(JSON.stringify(self.initMsg))
        );
    }

    function sendUpdate(streamName, message, out) {
        self.updateMsg.streamname = streamName;
        self.updateMsg.body.values = [message.property("time").value().toLong()];

        for (var i = 0; i < self.nvalues; i++) {
            self.updateMsg.body.values.push(Math.round(message.property("value" + i).value().toDouble()));
        }
        out.send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(streamName)
                .body(JSON.stringify(self.updateMsg))
        );
    }

    function getTime(memory) {
        return memory.first().property("time").value().toLong();
    }

    function storeNextMemory(streamName, memory, retired, t) {
        var msg = stream.create().message().message();
        for (var i = 0; i < self.nvalues; i++)
            if (self.func === "average")
                msg.property("value" + i).set(retired.average("value" + i));
            else
                msg.property("value" + i).set(retired.sum("value" + i));
        msg.property("time").set(t);
        sendUpdate(streamName, msg, stream.output(streamName));
        memory.add(msg);
    }

}