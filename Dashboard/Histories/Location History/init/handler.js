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

    this.orderby = this.props["eventtimeproperty"]?this.props["eventtimeproperty"]:"_time";

    stream.create().output(this.registryTopic).topic();
    stream.create().output(this.metaRegistryTopic).topic();
    stream.create().output(this.streamname).topic();

    stream.create().memoryGroup(this.compid+"-updates", this.props["assetproperty"]).onCreate(function (key) {
        return stream.create().memory(key+"-"+self.compid+"-updates").heap().orderBy(self.orderby);
    });

    this.updateGroup = stream.memoryGroup(this.compid+"-updates");

    stream.create().memoryGroup(this.compid+"-history", this.props["assetproperty"]).onCreate(function (key) {
        return createMemory(key+"-"+self.compid+"-history");
    });

    this.historyGroup = stream.memoryGroup(this.compid+"-history");

    this.add = function(msg) {
        if (this.orderBy === "_time")
           msg.property("_time").set(time.currentTime());
       this.updateGroup.add(msg);
    };

    stream.create().timer(this.compid + "_checklimit").interval().seconds(this.props["updateintervalsec"]).onTimer(function (timer) {
        // Send updates, move updates to history
        send("update", self.updateGroup, stream.output(self.streamname));

        // Move updates to history
        var toClear = [];
        self.updateGroup.forEach(function(mem){
           mem.forEach(function(msg){
               self.historyGroup.add(msg);
           });
           toClear.push(mem);
        });

        // Clear updates
        toClear.forEach(function(mem){
           mem.clear();
           self.updateGroup.removeMemory(mem.name());
        });

        // Check limit on history
        self.historyGroup.checkLimit();
    });

    function createMemory(key) {
        stream.create().memory(key + "_" + self.compid).sharedQueue(sharedQueue).orderBy(self.orderby).limit().count(self.props["limit"]);
        return stream.memory(key + "_" + self.compid);
    }

    // Init Requests
    stream.create().input(this.streamname).topic().selector("initrequest = true")
        .onInput(function (input) {
            var out = stream.create().output(null).forAddress(input.current().replyTo());
            send("init", self.historyGroup, out);
            out.close();
        });

    function send(type, group, out) {
        var msg = {
            msgtype: "stream",
            streamname: self.streamname,
            eventtype: type,
            body: {
                assets: []
            }
        };
        group.forEach(function(mem){
           msg.body.assets.push(createAsset(mem));
        });
        if (msg.body.assets.length > 0) {
            out.send(
                stream.create().message()
                    .textMessage()
                    .property("streamdata").set(true)
                    .property("streamname").set(self.streamname)
                    .body(JSON.stringify(msg))
            );
        }
    }

    function createAsset(mem) {
        var asset = {
            name: null,
            locations: []
        };
        mem.forEach(function(msg){
           if (asset.name === null)
               asset.name = msg.property(self.props["assetproperty"]).value().toString();
           asset.locations.push(JSON.parse(msg.body()));
        });
        return asset;
    }
}
