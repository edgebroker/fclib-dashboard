function handler(In) {
    var p = this.props["properties"];
    var changed = false;
    for (var i = 0; i < p.length; i++) {
        if (!In.property(p[i]).exists())
            return;
        var value = In.property(p[i]).value().toString();
        if (value.indexOf(",") !== 0)
            In.property(p[i]).set(value.replace(/,/g,""));
        value = In.property(p[i]).value().toLong();
        if (this.msg.body.values[i] !== value) {
            this.msg.body.values[i] = value;
            changed = true;
        }
    }
    if (changed) {
        this.msg.eventtype = "update";
        this.msg.body.time = time.currentTime();
        stream.output(this.streamname).send(
            stream.create().message()
                .textMessage()
                .property("streamdata").set(true)
                .property("streamname").set(this.streamname)
                .body(JSON.stringify(this.msg))
        );
        this.executeOutputLink("Out", this.msg);
    }
}