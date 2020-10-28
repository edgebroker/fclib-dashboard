function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_history_" + this.props["historyname"];
    var sharedQueue = this.flowcontext.getFlowQueue();
    this.groupProp = this.props["groupproperty"];
    this.valueProp = this.props["valueproperty"];
    this.updateIntervalSec = this.props["updateintervalsec"];
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
        type : "grouphistory",
    	timeframes: ["min", "hour", "day", "month", "year"],
        labely: this.props["labely"]
    };

    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname_min).topic();
    stream.create().output(this.streamname_hour).topic();
    stream.create().output(this.streamname_month).topic();
    stream.create().output(this.streamname_day).topic();
    stream.create().output(this.streamname_year).topic();

    stream.create().memoryGroup(this.memory_sec, this.groupProp).inactivityTimeout().minutes(1).onCreate(function (key) {
        stream.create().memory(key + "_" + self.memory_sec).heap().limit().timeUnitChange().seconds(self.updateIntervalSec).onRetire(function (retired) {
            storeNextMemory(key, stream.memoryGroup(self.memory_min), retired);
        });
        return stream.memory(key + "_" + self.memory_sec);
    });

    stream.create().memoryGroup(this.memory_min, this.groupProp).inactivityTimeout().minutes(2).onCreate(function (key) {
        createMemory(key + "_" + self.memory_min).limit().timeUnitChange().minutes(1).onRetire(function (retired) {
            storeNextMemory(key, stream.memoryGroup(self.memory_hour), retired);
        });
        return stream.memory(key + "_" + self.memory_min);
    });

    stream.create().memoryGroup(this.memory_hour, this.groupProp).inactivityTimeout().minutes(90).onCreate(function (key) {
        createMemory(key + "_" + self.memory_hour).limit().timeUnitChange().hours(1).onRetire(function (retired) {
            storeNextMemory(key, stream.memoryGroup(self.memory_day), retired);
        });
        return stream.memory(key + "_" + self.memory_hour);
    });

    stream.create().memoryGroup(this.memory_day, this.groupProp).inactivityTimeout().hours(26).onCreate(function (key) {
        createMemory(key + "_" + self.memory_day).limit().timeUnitChange().days(1).onRetire(function (retired) {
            storeNextMemory(key, stream.memoryGroup(self.memory_month), retired);
        });
        return stream.memory(key + "_" + self.memory_day);
    });

    stream.create().memoryGroup(this.memory_month, this.groupProp).inactivityTimeout().days(33).onCreate(function (key) {
        createMemory(key + "_" + self.memory_month).limit().timeUnitChange().months(1).onRetire(function (retired) {
            storeNextMemory(key, stream.memoryGroup(self.memory_year), retired);
        });
        return stream.memory(key + "_" + self.memory_month);
    });

    stream.create().memoryGroup(this.memory_year, this.groupProp).inactivityTimeout().days(368).onCreate(function (key) {
        createMemory(key + "_" + self.memory_year).limit().timeUnitChange().years(1);
        return stream.memory(key + "_" + self.memory_year);
    });

    function createMemory(name) {
        stream.create().memory(name).sharedQueue(sharedQueue);
        return stream.memory(name);
    }

    stream.create().timer(this.compid + "_at_the_second_starter").next().beginOfSecond().onTimer(function (t) {
        stream.create().timer(self.compid + "_secondcheck").interval().seconds(self.updateIntervalSec).onTimer(function (timer) {
            stream.memoryGroup(self.memory_sec).checkLimit();
            send("update", self.streamname_min, stream.memoryGroup(self.memory_min), "minute", stream.output(self.streamname_min));
        }).start();
    });

    stream.create().timer(this.compid + "_at_the_minute_starter").next().beginOfMinute().onTimer(function (t) {
        stream.create().timer(self.compid + "_minutecheck").interval().minutes(1).onTimer(function (timer) {
            stream.memoryGroup(self.memory_min).checkLimit();
            send("update", self.streamname_hour, stream.memoryGroup(self.memory_hour), "hour", stream.output(self.streamname_hour));
        }).start();
        stream.create().timer(self.compid + "_hourcheck").interval().minutes(10).onTimer(function (timer) {
            stream.memoryGroup(self.memory_hour).checkLimit();
            send("update", self.streamname_day, stream.memoryGroup(self.memory_day), "day", stream.output(self.streamname_day));
        }).start();
        stream.create().timer(self.compid + "_daycheck").interval().hours(1).onTimer(function (timer) {
            stream.memoryGroup(self.memory_day).checkLimit();
            send("update", self.streamname_month, stream.memoryGroup(self.memory_month), "month", stream.output(self.streamname_month));
        }).start();
        stream.create().timer(self.compid + "_monthcheck").interval().days(1).onTimer(function (timer) {
            stream.memoryGroup(self.memory_month).checkLimit();
            send("update", self.streamname_year, stream.memoryGroup(self.memory_year), "year", stream.output(self.streamname_year));
        }).start();
    });

    // Init Requests
    stream.create().input(this.streamname_min).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            send("init", self.streamname_min, stream.memoryGroup(self.memory_min), "minute", out);
            out.close();
        });
    stream.create().input(this.streamname_hour).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            send("init", self.streamname_hour, stream.memoryGroup(self.memory_hour), "hour", out);
            out.close();
        });
    stream.create().input(this.streamname_day).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            send("init", self.streamname_day, stream.memoryGroup(self.memory_day), "day", out);
            out.close();
        });
    stream.create().input(this.streamname_month).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            send("init", self.streamname_month, stream.memoryGroup(self.memory_month), "month", out);
            out.close();
        });
    stream.create().input(this.streamname_year).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            send("init", self.streamname_year, stream.memoryGroup(self.memory_year), "year", out);
            out.close();
        });

    function getTime(memory) {
        return memory.first().property("_TIME").value().toLong();
    }

    function performFunc(mem) {
        var res;
        switch (self.func) {
            case "sum":
                res = mem.sum(self.valueProp);
                break;
            case "min":
                res = mem.min(self.valueProp).property(self.valueProp).value().toObject();
                break;
            case "max":
                res = mem.max(self.valueProp).property(self.valueProp).value().toObject();
                break;
            case "average":
                res = mem.average(self.valueProp);
                break;
        }
        return res;
    }

    function storeNextMemory(key, memory, retired) {
        var result = performFunc(retired);
        if (self.func === "min" || result !== 0) {
            var msg = stream.create().message().message().property(self.groupProp).set(key);
            msg.property(self.valueProp).set(result);
            memory.add(msg);
        }
    }

    function compare(val1, val2) {
        if (self.func === "min")
            return val1 >= val2;
        return val1 <= val2;
    }

    function insertArray(keyArray, valArray, key, value) {
        for (var i = 0; i < valArray.length; i++) {
            if (compare(valArray[i], value)) {
                if (i === 0) {
                    keyArray.unshift(key);
                    valArray.unshift(value);
                } else {
                    keyArray.splice(i, 0, key);
                    valArray.splice(i, 0, value);
                }
                return;
            }
        }
        keyArray.push(key);
        valArray.push(value);
    }

    function send(evttype, streamName, memGroup, type, out) {
        var initMsg = {
            msgtype: "stream",
            streamname: streamName,
            eventtype: evttype,
            body: {
                type: type,
                columns: [['x'], [self.func]]
            }
        };
        memGroup.forEach(function (mem) {
            if (mem.size() > 0) {
                var key = mem.first().property(self.groupProp).value().toString();
                insertArray(initMsg.body.columns[0], initMsg.body.columns[1], key, performFunc(mem));
            }
        });
        out.send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(streamName)
                .body(JSON.stringify(initMsg))
        );
    }
}