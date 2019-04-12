function handler(In) {
    var outMsg = stream.create().message().copyMessage(In);
    outMsg.property("operation").set("remove")
        .property("command").set(this.props["name"]);
    this.executeOutputLink("Out", outMsg);
}