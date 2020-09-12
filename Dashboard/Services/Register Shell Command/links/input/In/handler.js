function handler(In) {
    var outMsg = stream.create().message().copyMessage(In);
    outMsg.property("operation").set("add")
        .property("command").set(this.props["name"])
        .property("description").set(this.props["description"])
        .property("referencelabelkey").set(this.props["referencelabelkey"])
        .property("referencevaluekey").set(this.props["referencevaluekey"])
        .property("handlerest").set(this.props["handlerest"]);
    if (this.props["resttopic"])
        outMsg.property("resttopic").set(this.props["resttopic"]);
    this.executeOutputLink("Out", outMsg);
}
