function handler(In) {
    if (!this.assertProperty(In, this.props["assetproperty"]))
        return;

    var msg = stream.create().message().copyMessage(In);
    this.add(msg);
    this.executeOutputLink("Out", In);
}