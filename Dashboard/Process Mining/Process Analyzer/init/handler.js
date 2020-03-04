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
    this.shellstreamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_shell_snapshot_" + this.props["processname"];
    this.shellstreammeta = {
        name: stream.fullyQualifiedName().replace(/\./g, "_") + "_shell_snapshot_" + this.props["processname"],
        label: stream.fullyQualifiedName().replace(/\./g, "/") + "/Shell/Snapshot/" + this.props["processname"],
        type: "service"
    };
    var WIDTH_L = 20;
    var WIDTH_R = 50;
    var shellCommands = [
        "Result:",
        field("Command", WIDTH_L, ' ') + "| " + field("Description", WIDTH_R, ' '),
        field("", WIDTH_L + WIDTH_R + 2, '-'),
        field("help", WIDTH_L, ' ') + "| " + field("Show available commands", WIDTH_R, ' '),
        field("getsnapshot", WIDTH_L, ' ') + "| " + field("Returns a snapshot", WIDTH_R, ' '),
        field("  <time>", WIDTH_L, ' ') + "| " + field("  Time", WIDTH_R, ' '),
        field("getsnapshotbyindex", WIDTH_L, ' ') + "| " + field("Returns a snapshot by index", WIDTH_R, ' '),
        field("  <index>", WIDTH_L, ' ') + "| " + field("  Index", WIDTH_R, ' '),
        field("getitems", WIDTH_L, ' ') + "| " + field("Returns items from a stage.", WIDTH_R, ' '),
        field("  <stage>", WIDTH_L, ' ') + "| " + field("  Stage name", WIDTH_R, ' ')
    ];

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

    var Util = Java.type("com.swiftmq.util.SwiftUtilities");
    var MEMPREFIX = this.compid + "_stage_";
    var PROCESSSTART = "Process Start";
    var PROCESSEXPIRED = "Process Expired";
    var PROCESSEND = "Process End";
    var CHECKINTIME = "_checkintime";
    var LATEAFTER = "_lateafter";
    var PATH = "_path";
    var TOTALCOUNT = "_totalcount";
    var CURRENTCOUNT = "_currentcount";
    var DELAY = "_delaysum";
    var HISTORYMEM = this.compid + "_modelhistory";
    var SNAPSHOTTIMEPROP = "_snapshottime";
    var SHAREDQUEUE = this.flowcontext.getFlowQueue();

    var data = {
        totals: {
                totalprocessed: 0,
                intransit: 0,
                kpis: {}
            },
        model: {
            start: 0,
            end: 0
        },
        history: {
            lastsnapshottime: 0,
            numbersnapshots: 0,
            snapshotinterval: 15
        },
        key: null,
        kpis: [],
        stages: {},
        links: {},
        paths: {}
    };

    var alertcount = 0;
    var updates;
    var lateThresholds = {};
    var uniquePaths = [];
    var dirty = false;
    var expirationMS;

    data.key = this.props["processproperty"];
    for (var i = 0; i < self.props["kpis"].length; i++) {
        data.kpis.push(self.props["kpis"][i].label);
        data.totals.kpis[self.props["kpis"][i].label] = {
            totalprocessed: 0,
            intransit: 0
        }
    }
    for (i = 0; i < self.props["alerts"].length; i++) {
        lateThresholds[self.props["alerts"][i].stage] = timeUnitToMillis(self.props["alerts"][i].thresholdvalue, self.props["alerts"][i].thresholdunit);
    }

    newUpdateSet();

    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname).topic();

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            generateAllPaths();
            checkLates();
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
            stream.log().info("Init: "+JSON.stringify(data, null, 2));
        });

    stream.create().timer(this.compid + "_at_the_minute_starter").next().beginOfMinute().onTimer(function (t) {
        stream.create().timer(self.compid + "_update").interval().seconds(self.updateIntervalSec).onTimer(function (timer) {
            checkLates();
            if (dirty) {
                generateAllPaths();
                sendUpdate();
                dirty = false;
            }
        }).start();
    });

    function newUpdateSet() {
        updates = {
            totals: {},
            stages: {
                add: {},
                remove: [],
                update: {}
            },
            links: {
                add: {},
                remove: {},
                update: {}
            },
            paths: {}
        };
        updates.paths[TOTALCOUNT] = [];
    }

    function sendUpdate() {
        updates.totals = data.totals;
        updates.model = data.model;
        updates.history = data.history;
        updates.paths = data.paths;
        self.msg.eventtype = "update";
        self.msg.body.time = time.currentTime();
        self.msg.body.data = updates;
        stream.output(self.streamname).send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(self.streamname)
                .body(JSON.stringify(self.msg))
        );
        newUpdateSet();
    }

    // Static happy path
    if (this.props["happypath"]) {
        ensureStage(PROCESSSTART, this.props["processproperty"]);
        for (var i=0;i<this.props["happypath"].length; i++){
            ensureStage(this.props["happypath"][i], this.props["processproperty"]);
            if (i===0)
                ensureLink(PROCESSSTART, this.props["happypath"][i]);
            else
                ensureLink(this.props["happypath"][i-1], this.props["happypath"][i]);
        }
        ensureStage(PROCESSEND, this.props["processproperty"]);
        ensureLink(this.props["happypath"][this.props["happypath"].length-1], PROCESSEND);
        var path = [];
        path.push(PROCESSSTART);
        path = path.concat(this.props["happypath"]);
        path.push(PROCESSEND);
        uniquePaths.push({path: path, statichappypath: true});
        dirty = true;
    }

    // Expiration Timer
    if (this.props["stageexpirationvalue"] > 0) {
        switch (this.props["stageexpirationunit"]) {
            case "Seconds":
                stream.create().timer(this.compid + "_expiration").interval().seconds(1).onTimer(checkExpiredStages);
                break;
            case "Minutes":
                stream.create().timer(this.compid + "_expiration").interval().seconds(30).onTimer(checkExpiredStages);
                break;
            case "Hours":
                stream.create().timer(this.compid + "_expiration").interval().minutes(10).onTimer(checkExpiredStages);
                break;
            case "Days":
                stream.create().timer(this.compid + "_expiration").interval().hours(1).onTimer(checkExpiredStages);
                break;
            case "Months":
                stream.create().timer(this.compid + "_expiration").interval().days(1).onTimer(checkExpiredStages);
                break;
        }
        expirationMS = timeUnitToMillis(this.props["stageexpirationvalue"], this.props["stageexpirationunit"]);
    }

    function checkExpiredStages(timer) {
        var result = [];
        var timeout = time.currentTime() - expirationMS;
        for (var stage in data.stages) {
            if (!(stage === PROCESSSTART || stage === PROCESSEXPIRED || stage === PROCESSEND)) {
                stream.log().info("checkExpiredStages: " + stage + ", time: " + timeout);
                stream.memory(MEMPREFIX + stage).select(CHECKINTIME + " < " + timeout).forEach(function (msg) {
                    result.push(msg);
                });
            }
        }
        for (var i = 0; i < result.length; i++) {
            moveViaProcessExpiredToEnd(result[i]);
        }
    }

    function moveViaProcessExpiredToEnd(message) {
        stream.log().info("moveViaProcessExpiredToEnd: " + message.property(self.props["processproperty"]).value().toObject());
        message.property(self.props["stageproperty"]).set(PROCESSEXPIRED);
        processMessage(message);
        message.property(self.props["stageproperty"]).set(PROCESSEND);
        processMessage(message);
    }

    function timeUnitToMillis(value, unit) {
        switch (unit) {
            case "Seconds":
                value = value * 1000;
                break;
            case "Minutes":
                value = value * 60 * 1000;
                break;
            case "Hours":
                value = value * 60 * 60 * 1000;
                break;
            case "Days":
                value = value * 60 * 60 * 24 * 1000;
                break;
            case "Months":
                value = value * 60 * 60 * 24 * 30 * 1000;
                break;
        }
        return value;
    }

    function checkLates() {
        alertcount = 0;
        for (var stage in data.stages) {
            if (!(stage === PROCESSSTART || stage === PROCESSEND || stage === PROCESSEXPIRED))
                checkLate(stage);
        }
    }

    function checkLate(stage) {
        var cnt = 0;
        if (lateThresholds[stage]) {
            var current = time.currentTime();
            stream.memory(MEMPREFIX + stage).forEach(function (msg){
                if (current-msg.property(CHECKINTIME).value().toLong() > lateThresholds[stage]) {
                    cnt++;
                }
            });
        }
        if (data.stages[stage].late !== cnt) {
            data.stages[stage].late = cnt;
            updates.stages.update[stage] = JSON.parse(JSON.stringify(data.stages[stage]));
            dirty = true;
        }
        alertcount += cnt;
    }

    // Removes all data from the model
    this.resetModel = function () {
        stream.log().info("Reset model!");
        newUpdateSet();
        for (var stage in data.stages) {
            if (!(stage === PROCESSSTART || stage === PROCESSEND))
                stream.memory(MEMPREFIX + stage).clear().close();
            updates.stages.remove.push(stage);
        }
        updates.links.remove = data.links;
        data.model.start = 0;
        data.model.end = 0;
        data.stages = {};
        data.links = {};
        data.paths = {};
        data.totals.totalprocessed = 0;
        data.totals.intransit = 0;
        for (var kpi in data.totals.kpis) {
            data.totals.kpis[kpi].totalprocessed = 0;
            data.totals.kpis[kpi].intransit = 0;
        }
        uniquePaths = [];
        sendUpdate();
        dirty = false;
    };

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

        if (data.model.start === 0)
            data.model.start = time.currentTime();
        data.model.end = time.currentTime();

        msg.property(CHECKINTIME).set(time.currentTime());
        for (var i = 0; i < self.props["kpis"].length; i++) {
            if (!self.assertProperty(message, self.props["kpis"][i]["propertyname"]))
                return;
        }
        msg.copyProperties(message);
        processMessage(msg);
        if (isProcessEnd(stageName)) {
            msg.property(self.props["stageproperty"]).set(PROCESSEND);
            processMessage(msg);
        }
        sendTotals();
        dirty = true;
    };

    // Send totals
    function sendTotals(){
        var msg = stream.create().message().message();
        msg.property("alertcount").set(alertcount);
        msg.property("totalprocessed").set(data.totals.totalprocessed);
        msg.property("intransit").set(data.totals.intransit);
        for (var kpi in data.totals.kpis) {
            msg.property(kpi+"_totalprocessed").set(data.totals.kpis[kpi].totalprocessed);
            msg.property(kpi+"_intransit").set(data.totals.kpis[kpi].intransit);
        }
        self.executeOutputLink("Totals", msg);
    }

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
            if (stageName.indexOf(self.props["processstartstages"][i]) !== -1)
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
        ensureLink(source.stage, target.stage);
        data.links[source.stage][target.stage][TOTALCOUNT]++;
        data.links[source.stage][target.stage][DELAY] += target.time - source.time;
        for (var i = 0; i < self.props["kpis"].length; i++) {
            var value = message.property(self.props["kpis"][i]["propertyname"]).value().toObject();
            data.links[source.stage][target.stage].kpis[self.props["kpis"][i]["label"]].raw.total += value;
            data.links[source.stage][target.stage].kpis[self.props["kpis"][i]["label"]].average += data.links[source.stage][target.stage].kpis[self.props["kpis"][i]["label"]].raw.total / data.links[source.stage][target.stage][TOTALCOUNT];
        }
        var linkCopy = JSON.parse(JSON.stringify(data.links[source.stage][target.stage]));
        if (!updates.links.update[source.stage])
            updates.links.update[source.stage] = {};
        updates.links.update[source.stage][target.stage] = linkCopy;
    }

    // Ensures that a link exists
    function ensureLink(source, target) {
        if (!data.links[source])
            data.links[source] = {};
        if (!data.links[source][target]) {
            data.links[source][target] = {
                kpis: {}
            };
            data.links[source][target][TOTALCOUNT] = 0;
            data.links[source][target][DELAY] = 0;
            for (var i = 0; i < self.props["kpis"].length; i++) {
                data.links[source][target].kpis[self.props["kpis"][i]["label"]] = {
                    raw: {
                        total: 0
                    },
                    average: 0
                };
            }
            updates.links.add[source] = JSON.parse(JSON.stringify(data.links[source]));
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
                updates.stages.update[key] = JSON.parse(JSON.stringify(data.stages[key]));
                break;
            }
        }
        var rc;
        if (!prevMessage) {
            checkinStage(PROCESSSTART, message, []);
            rc = checkoutStage(message);
        } else {
            var path = [];
            if (prevMessage.property(PATH).exists())
                path = JSON.parse(prevMessage.property(PATH).value().toString());
            rc = {stage: prevStage, time: checkinTime, path: path};
        }
        return rc;
    }

    // checks a message into a stage
    function checkinStage(name, message, path) {
        var processprop = self.props["processproperty"];
        var isUpdate = !ensureStage(name, processprop);

        path.push(name);
        message.property(PATH).set(JSON.stringify(path));
        maintainUniquePaths(path);

        var stage = data.stages[name];
        stage[TOTALCOUNT]++;
        stage[CURRENTCOUNT]++;
        for (var i = 0; i < self.props["kpis"].length; i++) {
            var value = message.property(self.props["kpis"][i]["propertyname"]).value().toObject();
            stage.kpis[self.props["kpis"][i]["label"]].raw.current += value;
            stage.kpis[self.props["kpis"][i]["label"]].raw.total += value;
            stage.kpis[self.props["kpis"][i]["label"]].average = stage.kpis[self.props["kpis"][i]["label"]].raw.total / stage[TOTALCOUNT];
            if (name === PROCESSSTART) {
                data.totals.kpis[self.props["kpis"][i]["label"]].totalprocessed += value;
                data.totals.kpis[self.props["kpis"][i]["label"]].intransit += value;
            } else if (name === PROCESSEND)
                data.totals.kpis[self.props["kpis"][i]["label"]].intransit -= value;
        }
        if (name !== PROCESSEND)
            stream.memory(MEMPREFIX + name).add(message);
        if (name === PROCESSSTART) {
            data.totals.totalprocessed++;
            data.totals.intransit++;
        } else if (name === PROCESSEND)
            data.totals.intransit--;
        if (isUpdate)
            updates.stages.update[name] = JSON.parse(JSON.stringify(stage));
        else
            updates.stages.add[name] = JSON.parse(JSON.stringify(stage));
        if (name !== PROCESSSTART && name !== PROCESSEND) {
            var utilization = stream.create().message().message();
            utilization.property("stage").set(name);
            utilization.property("current").set(1);
            self.executeOutputLink("StageUtilization", utilization);
        }
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
                kpis: {},
                late: 0
            };
            stage[TOTALCOUNT] = 0;
            stage[CURRENTCOUNT] = 0;
            for (var i = 0; i < self.props["kpis"].length; i++) {
                stage.kpis[self.props["kpis"][i]["label"]] = {
                    raw: {
                        current: 0,
                        total: 0
                    },
                    average: 0
                };
            }
            data.stages[name] = stage;
            if (name !== PROCESSEND)
                stream.create().memory(MEMPREFIX + name).heap().createIndex(processprop);
            return true;
        }
        return false;
    }

    // Checks whether a stage is marked as Process End
    function isProcessEnd(stageName) {
        for (var i = 0; i < self.props["processendstages"].length; i++) {
            if (stageName.indexOf(self.props["processendstages"][i]) !== -1)
                return true;
        }
        return false;
    }

    // Generates all paths
    function generateAllPaths() {
        var result = uniquePaths;
        data.paths = {};
        for (var i = 0; i < self.props["kpis"].length; i++) {
            var kpi = self.props["kpis"][i].label;
            var intermediate = [];
            var happyKPI;
            result.forEach(function (p) {
                if (p.statichappypath)
                    happyKPI = p;
                else
                    intermediate.push(weightKpiPath(kpi, p.path));
            });
            data.paths[kpi] = intermediate.sort(function (a, b) {
                return b.weight - a.weight;
            });
            if (happyKPI) {
              var p = weightKpiPath(kpi, happyKPI.path);
              p["statichappypath"] = true;
              data.paths[kpi].splice(0,0,p);
            }
        }
        var intermediateTotal = [];
        var happyTotal;
        result.forEach(function (p) {
            if (p.statichappypath)
                happyTotal = p;
            else
                intermediateTotal.push(weightTotalPath(p.path));
        });

        data.paths[TOTALCOUNT] = intermediateTotal.sort(function (a, b) {
            return b.weight - a.weight;
        });
        if (happyTotal) {
          var pt = weightTotalPath(happyTotal.path);
          pt["statichappypath"] = true;
          data.paths[TOTALCOUNT].splice(0,0,pt);
        }
     }

    // Weight the KPI paths
    function weightKpiPath(kpi, path) {
        var sum = 0;
        for (var i = 0; i < path.length - 1; i++) {
            sum += data.links[path[i]][path[i + 1]].kpis[kpi].raw.total;
        }
        return {weight: Math.round(sum / path.length), path: path.slice(0)};
    }

    // Weight the totalcount paths
    function weightTotalPath(path) {
        var sum = 0;
        for (var i = 0; i < path.length - 1; i++) {
            sum += data.links[path[i]][path[i + 1]][TOTALCOUNT];
        }
        return {weight: Math.round(sum / path.length), path: path.slice(0)};
    }

    // Snapshot history starts here
    // Init Requests
    stream.create().input(this.compid + "_shellinitrequests").topic().destinationName(this.shellstreamname).selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            sendShellInit(out, input.current().correlationId());
            out.close();
        });

    // Command Requests
    stream.create().input(this.compid + "_shellcommandrequests").topic().destinationName(this.shellstreamname).selector("commandrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            executeCommand(out, input.current());
            out.close();
        });


    function sendShellInit(output, id) {
        var msg = {
            msgtype: "servicereply",
            streamname: self.shellstreamname,
            eventtype: "init",
            body: {
                time: time.currentTime(),
                message: ["Welcome to " + self.props["processname"] + " shell!",
                    "Enter shell command or type 'help' to get a list of available commands."]
            }
        };
        output.send(
            stream.create().message()
                .textMessage()
                .correlationId(id)
                .property("streamdata").set(true)
                .property("streamname").set(self.shellstreamname)
                .body(JSON.stringify(msg))
        );
    }

    function executeCommand(output, cmdMsg) {
        var msg = {
            msgtype: "servicereply",
            streamname: self.shellstreamname,
            eventtype: "commandresult",
            body: {
                time: time.currentTime(),
                message: null
            }
        };
        var id = cmdMsg.correlationId();
        var request = JSON.parse(cmdMsg.body());
        var result;
        try {
            var cmd = Util.parseCLICommand(request.command);
            switch (cmd[0]) {
                case "help":
                    result = shellCommands;
                    break;
                case "getsnapshot":
                    result = getSnapshot(cmd);
                    break;
                case "getsnapshotbyindex":
                    result = getSnapshotByIndex(cmd);
                    break;
                case "getitems":
                    result = getItems(cmd);
                    break;
                default:
                    result = ["Error:", "Invalid command: " + cmd[0]];
                    break;
            }
        } catch (e) {
            result = ["Error:", e];
        }
        msg.body.message = result;
        output.send(
            stream.create().message()
                .textMessage()
                .correlationId(id)
                .property("streamdata").set(true)
                .property("streamname").set(self.shellstreamname)
                .body(JSON.stringify(msg))
        );
    }

    function getSnapshot(cmd) {
        if (cmd.length !== 2)
            return ["Error:", "Invalid number of parameters for this command!"];
        var timestamp = Number(cmd[1]);
        // Need to extend the range of the select due to no precise timer
        var result = stream.memory(HISTORYMEM).select(SNAPSHOTTIMEPROP + " between " + (timestamp - 5 * 60000) + " and " + (timestamp + 5 * 60000));
        if (result.size() === 0)
            return ["Error:", "No snapshot found for this timestamp!"];
        return ["Result:", result.first().body()];
    }

    function getSnapshotByIndex(cmd) {
        if (cmd.length !== 2)
            return ["Error:", "Invalid number of parameters for this command!"];
        var index = Number(cmd[1]);
        if (index < 0 || index > stream.memory(HISTORYMEM).size() - 1)
            return ["Error:", "Index out of range!"];
        return ["Result:", stream.memory(HISTORYMEM).at(index).body()];
    }

    function getItems(cmd) {
        if (cmd.length > 2)
            return ["Error:", "Invalid number of parameters for this command!"];
        var stage = cmd[1];
        var mem = stream.memory(MEMPREFIX + stage);
        if (mem === null)
            return ["Error:", "Stage not found: " + stage];
        var result = [];
        var max = Math.min(mem.size(), 100);
        for (var i = 0; i < max; i++) {
            result.push(messageToItemJson(stage, mem.at(i)));
        }
        return ["Result:", JSON.stringify(result)];
    }

    function messageToItemJson(stage, message) {
        var json = {};
        json[self.props["processproperty"]] = message.property(self.props["processproperty"]).value().toObject();
        json[CHECKINTIME] = message.property(CHECKINTIME).value().toObject();
        if (lateThresholds[stage])
            json[LATEAFTER] = json[CHECKINTIME]+lateThresholds[stage];
        for (var i = 0; i < self.props["kpis"].length; i++) {
            json[self.props["kpis"][i].label] = message.property(self.props["kpis"][i].propertyname).value().toObject();
        }
        message.properties().forEach(function(p){
           if (!(json[p.name()] || isKpi(p.name()) || p.name() === PATH))
               json[p.name()] = p.value().toObject();
        });
        return json;
    }

    function isKpi(name) {
        for (var i = 0; i < self.props["kpis"].length; i++) {
            if (name === self.props["kpis"][i].propertyname)
                return true;
        }
        return false;
    }

    function field(s, length, c) {
        var res = s;
        for (var i = s.length; i < length; i++)
            res += c;
        return res;
    }

    // History memory
    stream.create().memory(HISTORYMEM)
        .sharedQueue(SHAREDQUEUE)
        .limit()
        .time()
        .sliding()
        .days(this.props["historydays"])
        .onRetire(function (retired) {
            data.history.numbersnapshots = stream.memory(HISTORYMEM).size();
        });

    // Snapshot timer
    stream.create().timer(this.compid + "_historysnapshot").interval().minutes(15).onTimer(function (timer) {
        var snapshotTime = time.currentTime();
        stream.memory(HISTORYMEM).add(
            stream.create().message().textMessage()
                .property(SNAPSHOTTIMEPROP).set(snapshotTime)
                .body(JSON.stringify(data))
        ).checkLimit();
        data.history.lastsnapshottime = snapshotTime;
        data.history.numbersnapshots = stream.memory(HISTORYMEM).size();
        stream.log().info("Snapshot, history size=" + stream.memory(HISTORYMEM).size());
    });

    this.initSnapshots = function () {
        stream.executeCallback(function (context) {
            if (stream.memory(HISTORYMEM).size() > 0) {
                data.history.lastsnapshottime = stream.memory(HISTORYMEM).last().property(SNAPSHOTTIMEPROP).value().toLong();
                data.history.numbersnapshots = stream.memory(HISTORYMEM).size();
            }
        }, null);
    }
}