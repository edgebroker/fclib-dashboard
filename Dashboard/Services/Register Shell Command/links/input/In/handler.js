function handler(In) {
  var outMsg = stream.create().message().copyMessage(In);
  outMsg.property("operation").set("add")
    .property("command").set(this.props["name"])
    .property("description").set(this.props["description"])
    .property("referencelabelkey").set(this.props["referencelabelkey"])
    .property("referencevaluekey").set(this.props["referencevaluekey"]);
  this.executeOutputLink("Out", outMsg);
}
