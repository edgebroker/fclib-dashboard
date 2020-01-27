function handler() {
    var self = this;
    this.streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_process_" + this.props["processname"];
    this.registryTopic = "stream_" + stream.routerName() + "_streamregistry";
    this.metaRegistryTopic = "stream_" + stream.routerName() + "_metastreamregistry";
    this.streammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_process_" + this.props["processname"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Process/" + this.props["processname"],
        type: "process"
    };
    this.updateIntervalSec = this.props["updateintervalsec"];
    this.msg = {
        msgtype: "stream",
        streamname: this.streamname,
        eventtype: null,
        body: {
            time: null,
            data: {}
        }
    };

    var MEMPREFIX = this.compid + "_stage_";
    var PROCESSSTART = "Process Start";
    var PROCESSEXPIRED = "Process Expired";
    var PROCESSEND = "Process End";
    var CHECKINTIME = "_checkintime";
    var TOTALCOUNT = "_totalcount";
    var CURRENTCOUNT = "_currentcount";
    var DELAY = "_delaysum";

    var data = {
        kpis: [],
        stages: {},
        links: {},
        paths: {}
    };
    var uniquePaths = [];
    var dirty = false;
    var expirationMS;

    for (var i = 0; i < self.props["kpis"].length; i++) {
        data.kpis.push(self.props["kpis"][i].label);
    }

    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname).topic();

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            generateAllPaths();
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            self.msg.eventtype = "init";
            self.msg.body.time = time.currentTime();
            self.msg.body.data = data;
            out.send(
                stream.create().message()
                    .textMessage()
                    .property("streamdata").set(true)
                    .property("streamname").set(self.streamname)
                    .body(JSON.stringify(self.msg))
            );
            out.close();
        });

    stream.create().timer(this.compid + "_at_the_minute_starter").next().beginOfMinute().onTimer(function (t) {
        stream.create().timer(self.compid + "_update").interval().seconds(self.updateIntervalSec).onTimer(function (timer) {
            if (dirty) {
                generateAllPaths();
                sendUpdate();
                dirty = false;
            }
        }).start();
    });

    function sendUpdate() {
        self.msg.eventtype = "update";
        self.msg.body.time = time.currentTime();
        self.msg.body.data = data;
        stream.output(self.streamname).send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(self.msg))
        );
    }

    // Expiration Timer
    if (this.props["stageexpirationvalue"] > 0) {
        var expirationValue = this.props["stageexpirationvalue"];
        switch (this.props["stageexpirationunit"]) {
            case "Seconds":
                stream.create().timer(this.compid + "_expiration").interval().seconds(1).onTimer(checkExpiredStages);
                expirationMS = expirationValue * 1000;
                break;
            case "Minutes":
                stream.create().timer(this.compid + "_expiration").interval().seconds(30).onTimer(checkExpiredStages);
                expirationMS = expirationValue * 60 * 1000;
                break;
            case "Hours":
                stream.create().timer(this.compid + "_expiration").interval().minutes(10).onTimer(checkExpiredStages);
                expirationMS = expirationValue * 60 * 60 * 1000;
                break;
            case "Days":
                stream.create().timer(this.compid + "_expiration").interval().hours(1).onTimer(checkExpiredStages);
                expirationMS = expirationValue * 60 * 60 * 24 * 1000;
                break;
            case "Months":
                stream.create().timer(this.compid + "_expiration").interval().days(1).onTimer(checkExpiredStages);
                expirationMS = expirationValue * 60 * 60 * 24 * 30 * 1000;
                break;
        }
    }

    function checkExpiredStages(timer) {
        var result = [];
        var timeout = time.currentTime() - expirationMS;
        for (var stage in data.stages) {
            if (!(stage === PROCESSSTART || stage === PROCESSEXPIRED || stage === PROCESSEND)) {
                stream.log().info("checkExpiredStages: "+stage+", time: "+timeout);
                stream.memory(MEMPREFIX + stage).select(CHECKINTIME+" < "+ timeout).forEach(function(msg){
                    result.push(msg);
                });
            }
        }
        stream.log().info("results: "+result.length);
        for (var i=0;i<result.length;i++){
            moveViaProcessExpiredToEnd(result[i]);
        }
    }

    function moveViaProcessExpiredToEnd(message) {
        stream.log().info("moveViaProcessExpiredToEnd: "+message.property(self.props["processproperty"]).value().toObject());
        message.property(self.props["stageproperty"]).set(PROCESSEXPIRED);
        processMessage(message);
        message.property(self.props["stageproperty"]).set(PROCESSEND);
        processMessage(message);
    }

    // Adds a message to the model
    this.addMessage = function (message) {
        if (!self.assertProperty(message, self.props["processproperty"])) {
            stream.log().error("Missing: " + message);
            return;
        }
        if (!self.assertProperty(message, self.props["stageproperty"]))
            return;
        var msg = stream.create().message().message();
        var key = message.property(self.props["processproperty"]).value().toObject();
        var stageName = message.property(self.props["stageproperty"]).value().toObject();
        if (!startedOrValidStartStage(key, stageName)) {
            stream.log().info("processProp: " + key + ": Not a valid start stage: " + stageName);
            return;
        }
        stream.log().info("processProp: " + key + ", stage=" + stageName);
        msg.property(CHECKINTIME).set(time.currentTime());
        msg.property(self.props["processproperty"]).set(key);
        msg.property(self.props["stageproperty"]).set(stageName);
        for (var i = 0; i < self.props["kpis"].length; i++) {
            if (!self.assertProperty(message, self.props["kpis"][i]["propertyname"]))
                return;
            msg.property(self.props["kpis"][i]["propertyname"]).set(message.property(self.props["kpis"][i]["propertyname"]).value().toObject());
        }
        processMessage(msg);
        if (isProcessEnd(stageName)) {
            msg.property(self.props["stageproperty"]).set(PROCESSEND);
            processMessage(msg);
        }
        dirty = true;
    };

    // Checks whether a process with that key has already been started or
    // whether the stage is a valid start stage (if those are defined)
    function startedOrValidStartStage(key, stageName) {

        // No start stages defined, accept everything
        if (self.props["processstartstages"].length === 0)
            return true;

        // Check if already started
        for (var stage in data.stages) {
            if (!(stage === PROCESSSTART || stage === PROCESSEND) &&
                stream.memory(MEMPREFIX + stage).index(self.props["processproperty"]).get(key).size() > 0)
                return true;
        }

        // Not started, accept start stages only
        for (var i = 0; i < self.props["processstartstages"].length; i++) {
            if (stageName === self.props["processstartstages"][i])
                return true;
        }

        return false;
    }

    // Process a message = checkout of the previous, checkin to the current stage, create / update the link
    function processMessage(message) {
        var source = checkoutStage(message);
        var target = checkinStage(message.property(self.props["stageproperty"]).value().toString(), message, source.path);
        processLink(source, target, message);
    }

    // Creates or updates a link between stages
    function processLink(source, target, message) {
        ensureLink(source, target);
        data.links[source.stage][target.stage][TOTALCOUNT]++;
        data.links[source.stage][target.stage][DELAY] += target.time - source.time;
        for (var i = 0; i < self.props["kpis"].length; i++) {
            data.links[source.stage][target.stage].kpis[self.props["kpis"][i]["label"]].raw.total += message.property(self.props["kpis"][i]["propertyname"]).value().toObject();
        }
    }

    // Ensures that a link exists
    function ensureLink(source, target) {
        if (!data.links[source.stage])
            data.links[source.stage] = {};
        if (!data.links[source.stage][target.stage]) {
            data.links[source.stage][target.stage] = {
                kpis: {}
            };
            data.links[source.stage][target.stage][TOTALCOUNT] = 0;
            data.links[source.stage][target.stage][DELAY] = 0;
            for (var i = 0; i < self.props["kpis"].length; i++) {
                data.links[source.stage][target.stage].kpis[self.props["kpis"][i]["label"]] = {
                    raw: {
                        total: 0
                    }
                };
            }
        }
    }

    // checks a message out of a stage. If it wasn't checked in a previous stage, it is automatically checked into the
    // Process Start stage before
    function checkoutStage(message) {
        var value = message.property(self.props["processproperty"]).value().toObject();
        var prevStage;
        var checkinTime;
        var prevMessage;
        for (var key in data.stages) {
            if (key !== PROCESSEND && stream.memory(MEMPREFIX + key).index(self.props["processproperty"]).get(value).size() > 0) {
                prevStage = key;
                data.stages[prevStage][CURRENTCOUNT]--;
                prevMessage = stream.memory(MEMPREFIX + key).index(self.props["processproperty"]).get(value).first();
                checkinTime = prevMessage.property(CHECKINTIME).value().toLong();
                stream.memory(MEMPREFIX + key).index(self.props["processproperty"]).remove(value);
                for (var i = 0; i < self.props["kpis"].length; i++) {
                    data.stages[prevStage].kpis[self.props["kpis"][i]["label"]].raw.current -= prevMessage.property(self.props["kpis"][i]["propertyname"]).value().toObject();
                }
                break;
            }
        }
        var rc;
        if (!prevMessage) {
            checkinStage(PROCESSSTART, message, []);
            rc = checkoutStage(message);
        } else {
            var path = [];
            if (prevMessage.property("path").exists())
                path = JSON.parse(prevMessage.property("path").value().toString());
            rc = {stage: prevStage, time: checkinTime, path: path};
        }
        return rc;
    }

    // checks a message into a stage
    function checkinStage(name, message, path) {
        var processprop = self.props["processproperty"];
        ensureStage(name, processprop);

        path.push(name);
        message.property("path").set(JSON.stringify(path));
        maintainUniquePaths(path);

        var stage = data.stages[name];
        stage[TOTALCOUNT]++;
        stage[CURRENTCOUNT]++;
        for (var i = 0; i < self.props["kpis"].length; i++) {
            stage.kpis[self.props["kpis"][i]["label"]].raw.current += message.property(self.props["kpis"][i]["propertyname"]).value().toObject();
            stage.kpis[self.props["kpis"][i]["label"]].raw.total += message.property(self.props["kpis"][i]["propertyname"]).value().toObject();
        }
        if (name !== PROCESSEND)
            stream.memory(MEMPREFIX + name).add(message);
        return {stage: name, time: message.property(CHECKINTIME).value().toLong()};
    }

    // Maintains the unique paths
    function maintainUniquePaths(path) {
        var found = false;
        for (var i = 0; i < uniquePaths.length; i++) {
            if (samePath(path, uniquePaths[i].path)) {
                if (path.length > uniquePaths[i].path.length) {
                    uniquePaths[i].path = path.slice(0);
                }
                found = true;
                break;
            }
        }
        if (!found)
            uniquePaths.push({path: path.slice(0)});
    }

    // Checks whether both paths are equal
    function samePath(a, b) {
        var to = Math.min(a.length, b.length);
        for (var i = 0; i < to; i++) {
            if (a[i] !== b[i])
                return false;
        }
        return true;
    }

    // Ensures that a stage exists
    function ensureStage(name, processprop) {
        var stage = data.stages[name];
        if (!stage) {
            stage = {
                kpis: {}
            };
            stage[TOTALCOUNT] = 0;
            stage[CURRENTCOUNT] = 0;
            for (var i = 0; i < self.props["kpis"].length; i++) {
                stage.kpis[self.props["kpis"][i]["label"]] = {
                    raw: {
                        current: 0,
                        total: 0
                    }
                };
            }
            data.stages[name] = stage;
            if (name !== PROCESSEND)
                stream.create().memory(MEMPREFIX + name).heap().createIndex(processprop);
        }
    }

    // Checks whether a stage is marked as Process End
    function isProcessEnd(stageName) {
        for (var i = 0; i < self.props["processendstages"].length; i++) {
            if (stageName === self.props["processendstages"][i])
                return true;
        }
        return false;
    }

    // Generates all paths
    function generateAllPaths() {
        var start = time.currentTime();
        var result = uniquePaths;
        data.paths = {};
        for (var i = 0; i < self.props["kpis"].length; i++) {
            var kpi = self.props["kpis"][i].label;
            var intermediate = [];
            result.forEach(function (p) {
                intermediate.push(weightKpiPath(kpi, p.path));
            });
            data.paths[kpi] = intermediate.sort(function (a, b) {
                return b.weight - a.weight;
            });
            if (data.paths[kpi].length > self.props["maxpaths"])
                data.paths[kpi] = data.paths[kpi].slice(0, self.props["maxpaths"]);
        }
        var intermediateTotal = [];
        result.forEach(function (p) {
            intermediateTotal.push(weightTotalPath(p.path));
        });

        data.paths[TOTALCOUNT] = intermediateTotal.sort(function (a, b) {
            return b.weight - a.weight;
        });
        if (data.paths[TOTALCOUNT].length > self.props["maxpaths"])
            data.paths[TOTALCOUNT] = data.paths[TOTALCOUNT].slice(0, self.props["maxpaths"]);
        stream.log().info(JSON.stringify(data.paths, 0, 2));
        stream.log().info("unique paths=" + uniquePaths.length + ", time=" + (time.currentTime() - start));
    }

    // Weight the KPI paths
    function weightKpiPath(kpi, path) {
        var sum = 0;
        for (var i = 0; i < path.length-1; i++) {
            sum += data.links[path[i]][path[i+1]].kpis[kpi].raw.total;
        }
        return {weight: Math.round(sum / path.length), path: path.slice(0)};
    }

    // Weight the totalcount paths
    function weightTotalPath(path) {
        var sum = 0;
        for (var i = 0; i < path.length-1; i++) {
            sum += data.links[path[i]][path[i+1]][TOTALCOUNT];
        }
        return {weight: Math.round(sum / path.length), path: path.slice(0)};
    }
}