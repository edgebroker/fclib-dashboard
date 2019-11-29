function handler(In) {
    if (In.body.values.length !== this.props["properties"].length)
        throw "Number of properties don't match number of values in probe stream!";
    var msg = stream.create().message().message();
    for (var i=0;i<In.body.values.length;i++)
        msg.property(this.props["properties"][i]).set(In.body.values[i]);
    msg.property("time").set(In.body.time);
    msg.property("routername").set(stream.routerName());
    msg.property("probename").set(this.props["probename"]);
    this.executeOutputLink("Out", msg);
}